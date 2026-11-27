// Cristina – Viabilidade Redesim SP (ASAP)
// Roda nas páginas *.sp.gov.br (VRE | REDESIM). Três modos:
//  1) GRAVAR (aula): você preenche a viabilidade normalmente e ela anota cada campo e cada clique,
//     ligando o valor que você digitou ao dado do portal (CEP, CNAE, IPTU...).
//  2) PREENCHER: repete a aula com os dados de outra empresa. Para ANTES de transmitir/enviar.
//  3) Sempre: quando aparece um número de viabilidade (ex.: SPN2633893093), oferece lançar no portal.
(() => {
  if (window.__cristina) return; window.__cristina = true;
  const TOPO = window.top === window;
  const PROIBIDOS = /transmitir|enviar|protocolar|finalizar|concluir pedido|confirmar envio|assinar|pagar|gerar (guia|darf|boleto)/i;
  const REGEX_VIAB = /\b([A-Z]{3}\d{10})\b/;

  // ---------------- utilitários ----------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (e) => { if (!e || !e.getBoundingClientRect) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
  const digits = (v) => String(v ?? "").replace(/\D/g, "");
  const norm = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const pagina = () => location.host + location.pathname.toLowerCase();
  const store = {
    get: (k) => new Promise((r) => chrome.storage.local.get(k, r)),
    set: (o) => new Promise((r) => chrome.storage.local.set(o, r))
  };
  function msg(m) {
    return new Promise((res) => { try { chrome.runtime.sendMessage(m, (r) => { void chrome.runtime.lastError; res(r || { ok: false }); }); } catch (_) { res({ ok: false, error: "extensão recarregada: atualize a página" }); } });
  }
  async function waitFor(fn, ms = 12000, step = 250) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (_) {} await sleep(step); }
    return null;
  }
  const fire = (el, ...tipos) => tipos.forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
  // id gerado automaticamente (muda a cada visita) não serve para achar o campo de novo
  const idEstavel = (id) => id && !/\d{5,}|^ext-|^gen|^ember|^react|^mui|^:r/i.test(id);

  // Texto do rótulo de um campo: <label for>, label em volta, aria-label, ou o texto logo antes dele
  function rotuloDe(el) {
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && l.innerText.trim()) return l.innerText.trim(); }
    const lp = el.closest("label"); if (lp && lp.innerText.trim()) return lp.innerText.trim();
    const aria = el.getAttribute("aria-label") || el.getAttribute("title"); if (aria) return aria.trim();
    if (el.getAttribute("aria-labelledby")) { const l = document.getElementById(el.getAttribute("aria-labelledby")); if (l) return l.innerText.trim(); }
    let c = el;
    for (let i = 0; i < 4 && c; i++) {
      let s = c.previousElementSibling;
      while (s) { const t = (s.innerText || "").trim(); if (t && t.length < 80) return t; s = s.previousElementSibling; }
      c = c.parentElement;
    }
    return el.placeholder || el.name || "";
  }
  const limpaRotulo = (t) => String(t || "").replace(/[*:]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);

  function descrever(el) {
    const tag = el.tagName.toLowerCase();
    const rotulo = limpaRotulo(rotuloDe(el));
    const mesmos = [...document.querySelectorAll(tag)].filter((x) => limpaRotulo(rotuloDe(x)) === rotulo);
    return { tag, tipo: (el.type || "").toLowerCase(), id: idEstavel(el.id) ? el.id : "", name: el.name || "", rotulo, placeholder: el.placeholder || "", indice: Math.max(0, mesmos.indexOf(el)) };
  }
  function acharCampo(d) {
    const ok = (e) => e && vis(e) && !e.disabled;
    if (d.id) { const e = document.getElementById(d.id); if (ok(e)) return e; }
    if (d.name) {
      const es = [...document.getElementsByName(d.name)].filter(ok);
      if (d.tipo === "radio" || d.tipo === "checkbox") return es.length ? es : null;
      if (es.length) return es[Math.min(d.indice || 0, es.length - 1)];
    }
    if (d.rotulo) {
      const es = [...document.querySelectorAll(d.tag || "input,select,textarea")].filter((e) => ok(e) && limpaRotulo(rotuloDe(e)) === d.rotulo);
      if (es.length) return es[Math.min(d.indice || 0, es.length - 1)];
    }
    if (d.placeholder) { const e = [...document.querySelectorAll(`[placeholder="${CSS.escape(d.placeholder)}"]`)].find(ok); if (e) return e; }
    return null;
  }
  const clicaveis = () => [...document.querySelectorAll("button,a,input[type=button],input[type=submit],[role=button],[role=option],[role=menuitem],[role=tab],li,td,span.ui-button-text")].filter(vis);
  const textoDe = (e) => (e.innerText || e.value || e.getAttribute("aria-label") || e.title || "").replace(/\s+/g, " ").trim();

  // Liga o valor digitado a um dado do portal (CEP, CNAE...), para trocar pela empresa da vez
  function acharFonte(valor, dic, contem = false) {
    const v = norm(valor), vd = digits(valor);
    if (!v) return null;
    let melhor = null;
    for (const it of dic || []) {
      const iv = norm(it.valor), id = digits(it.valor);
      if (iv === v) return it.chave;
      if (!melhor && vd.length >= 4 && id === vd && /^[\d\s.\-/,()]+$/.test(String(valor))) melhor = it.chave;
      if (!melhor && contem && iv.length >= 5 && v.includes(iv)) melhor = it.chave;
    }
    return melhor;
  }

  // ---------------- painel (só na janela principal) ----------------
  let painel = null;
  function mostrarPainel(html, cor = "#ad1457") {
    if (!TOPO) return;
    if (!painel) {
      painel = document.createElement("div");
      painel.id = "cristina-painel";
      painel.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:2147483647;max-width:360px;font:13px/1.4 system-ui,sans-serif;color:#fff;border-radius:12px;padding:10px 12px;box-shadow:0 6px 24px #0005";
      document.documentElement.appendChild(painel);
    }
    painel.style.background = cor;
    painel.innerHTML = `<div style="font-weight:700;margin-bottom:4px">Cristina · Viabilidade</div>${html}`;
    painel.querySelectorAll("button").forEach((b) => (b.style.cssText = "margin:6px 6px 0 0;padding:5px 9px;border:0;border-radius:7px;background:#fff;color:#ad1457;font-weight:600;cursor:pointer"));
    return painel;
  }
  function esconderPainel() { if (painel) { painel.remove(); painel = null; } }
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // =====================================================================
  // 1) GRAVAR A AULA
  // =====================================================================
  let gravando = null;
  async function addPasso(p) {
    const { gravando: g } = await store.get("gravando");
    if (!g || !g.ativo) return;
    p.pagina = pagina(); p.quando = Date.now();
    const ult = g.passos[g.passos.length - 1];
    // o mesmo campo alterado de novo em seguida: fica só o último valor
    if (ult && p.tipo === "campo" && ult.tipo === "campo" && ult.pagina === p.pagina && JSON.stringify(ult.campo) === JSON.stringify(p.campo)) g.passos[g.passos.length - 1] = p;
    else g.passos.push(p);
    // mapa da página (estrutura dos campos, sem valores) para eu entender a tela depois
    g.mapas = g.mapas || {};
    if (!g.mapas[p.pagina]) g.mapas[p.pagina] = mapaDaPagina();
    await store.set({ gravando: g });
  }
  function mapaDaPagina() {
    return [...document.querySelectorAll("input,select,textarea")].filter((e) => vis(e) && e.type !== "hidden" && e.type !== "password").slice(0, 120).map((e) => {
      const d = descrever(e);
      if (e.tagName === "SELECT") d.opcoes = [...e.options].slice(0, 40).map((o) => o.text.trim());
      return d;
    });
  }
  function onChange(ev) {
    const el = ev.target;
    if (!gravando || !el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
    if (el.type === "password" || el.type === "hidden" || el.type === "file") return;
    const campo = descrever(el);
    let valor, texto = "";
    if (el.type === "checkbox") valor = el.checked;
    else if (el.type === "radio") { if (!el.checked) return; valor = el.value; texto = limpaRotulo(rotuloDe(el)); }
    else if (el.tagName === "SELECT") { const o = el.options[el.selectedIndex]; valor = el.value; texto = o ? o.text.trim() : ""; }
    else valor = el.value;
    const fonte = typeof valor === "string" ? acharFonte(texto || valor, gravando.dic) : null;
    addPasso({ tipo: "campo", campo, valor, texto, fonte });
    atualizarPainelGravacao();
  }
  function onClick(ev) {
    if (!gravando) return;
    if (painel && painel.contains(ev.target)) return;
    const el = ev.target.closest("button,a,input[type=button],input[type=submit],[role=button],[role=option],[role=menuitem],[role=tab],li,td");
    if (!el || /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName) && !/button|submit/.test(ev.target.type)) return;
    const texto = textoDe(el).slice(0, 120);
    if (!texto && !el.id) return;
    const fonte = acharFonte(texto, gravando.dic, true);
    addPasso({ tipo: "clique", alvo: { tag: el.tagName.toLowerCase(), id: idEstavel(el.id) ? el.id : "", texto }, fonte });
    atualizarPainelGravacao();
  }
  async function atualizarPainelGravacao() {
    const { gravando: g } = await store.get("gravando");
    if (!g || !g.ativo) return;
    const ult = g.passos[g.passos.length - 1];
    const ligados = g.passos.filter((p) => p.fonte).length;
    const rot = (k) => ((g.dic || []).find((x) => x.chave === k) || {}).rotulo || k;
    mostrarPainel(`🔴 Gravando a aula com <b>${esc(g.processo.razao)}</b><br>${g.passos.length} passo(s) · ${ligados} ligado(s) a dados do portal` +
      (ult ? `<br><small>Último: ${ult.tipo === "campo" ? esc(ult.campo.rotulo || ult.campo.name) + " = " + esc(ult.texto || String(ult.valor)).slice(0, 40) + (ult.fonte ? " ← <b>" + esc(rot(ult.fonte)) + "</b>" : " (fixo)") : "clique em “" + esc(ult.alvo.texto).slice(0, 40) + "”"}</small>` : "<br><small>Preencha a viabilidade normalmente. Eu só observo.</small>") +
      `<br><button id="cr-parar-grav">Terminei: salvar a aula</button>`);
    const b = document.getElementById("cr-parar-grav");
    if (b) b.onclick = async () => { const r = await msg({ type: "pararGravacao" }); gravando = null; mostrarPainel(r.ok && r.data ? `Aula salva: ${r.data.passos} passos (${r.data.ligados || 0} ligados ao portal).<br>No ícone da Cristina: “Baixar aula” para mandar ao Claude revisar.` : "Nada foi gravado.", "#2e7d32"); setTimeout(esconderPainel, 9000); };
  }

  // =====================================================================
  // 2) PREENCHER COM O QUE APRENDEU
  // =====================================================================
  let executando = false;
  async function setCampo(el, valor, passo) {
    if (Array.isArray(el)) { // grupo de radio/checkbox com o mesmo name
      const alvo = el.find((r) => r.value === String(valor) || norm(limpaRotulo(rotuloDe(r))) === norm(passo.texto));
      if (!alvo) throw new Error(`opção “${passo.texto || valor}” não existe em “${passo.campo.rotulo}”`);
      if (passo.campo.tipo === "checkbox" ? alvo.checked !== !!valor : !alvo.checked) alvo.click();
      return;
    }
    el.scrollIntoView({ block: "center" });
    if (el.type === "checkbox") { if (el.checked !== !!valor) el.click(); return; }
    if (el.type === "radio") { if (!el.checked) el.click(); return; }
    if (el.tagName === "SELECT") {
      const txt = passo.fonte ? valor : (passo.texto || valor);
      const o = [...el.options].find((o) => norm(o.text) === norm(txt) || o.value === String(valor)) ||
        [...el.options].find((o) => norm(o.text).startsWith(norm(txt)) || (digits(txt).length >= 4 && digits(o.text).startsWith(digits(txt))));
      if (!o) throw new Error(`opção “${txt}” não existe em “${passo.campo.rotulo}”`);
      el.value = o.value; fire(el, "input", "change"); return;
    }
    el.focus(); el.value = valor; fire(el, "input", "keyup", "change"); el.blur(); fire(el, "blur", "focusout");
    await sleep(150);
    // campo com máscara que não aceitou: digita como teclado
    if (norm(el.value) !== norm(valor) && digits(el.value) !== digits(valor)) {
      el.focus(); await msg({ type: "realType", text: String(valor), tecla: "Tab" }); await sleep(300);
    }
  }

  async function executar() {
    if (executando) return; executando = true;
    try {
      for (;;) {
        const { job, aula } = await store.get(["job", "aula"]);
        if (!job || !job.ativo || !aula) return;
        const total = aula.passos.length;
        if (job.passo >= total) {
          if (TOPO) { await msg({ type: "soltar" }); await msg({ type: "fim", status: "revisar", texto: `${job.processo.razao}: preenchi todos os ${total} passos. Revise e envie você.` }); mostrarPainel(`✅ Preenchi tudo de <b>${esc(job.processo.razao)}</b>.<br>Revise a tela e transmita você mesmo.`, "#2e7d32"); }
          return;
        }
        const p = aula.passos[job.passo];
        if (p.pagina !== pagina()) {
          // passo de outra página/quadro: quem está na página certa faz. A janela principal vigia se travou.
          if (TOPO) {
            mostrarPainel(`Preenchendo <b>${esc(job.processo.razao)}</b><br>Passo ${job.passo + 1} de ${total}: esperando a página <small>${esc(p.pagina)}</small>`);
            const t0 = job.passo;
            // espera até 25 s outro quadro/página avançar o passo
            const andou = await waitFor(async () => { const { job: j } = await store.get("job"); return !j || !j.ativo || j.passo !== t0 || pagina() === p.pagina; }, 25000, 1000);
            const { job: j2 } = await store.get("job");
            if (!andou && j2 && j2.ativo && j2.passo === t0) {
              mostrarPainel(`⏸️ Travei no passo ${t0 + 1} de ${total}: não cheguei na página <small>${esc(p.pagina)}</small>.<br>Vá até essa tela e clique em Continuar, ou pare.<br><button id="cr-cont">Continuar</button><button id="cr-parar">Parar</button>`, "#e65100");
              document.getElementById("cr-cont").onclick = () => { executando = false; executar(); };
              document.getElementById("cr-parar").onclick = async () => { await msg({ type: "parar" }); esconderPainel(); };
              return;
            }
            continue;
          }
          return;
        }
        const dic = job.dic || [];
        const valorDe = (fonte, padrao) => { if (!fonte) return padrao; const it = dic.find((x) => x.chave === fonte); return it ? it.valor : undefined; };
        const rot = (k) => ((aula.dicExemplo || dic).find((x) => x.chave === k) || {}).rotulo || k;
        mostrarPainel(`Preenchendo <b>${esc(job.processo.razao)}</b><br>Passo ${job.passo + 1} de ${total}<br><button id="cr-parar">Parar</button>`);
        const bp = document.getElementById("cr-parar"); if (bp) bp.onclick = async () => { await msg({ type: "parar" }); esconderPainel(); };
        try {
          if (p.tipo === "campo") {
            const valor = valorDe(p.fonte, p.valor);
            if (valor === undefined) {
              // a empresa da vez não tem esse dado no portal: deixa em branco e segue, avisando no fim
              job.log.push(`Sem “${rot(p.fonte)}” no portal (campo ${p.campo.rotulo}).`);
            } else {
              const el = await waitFor(() => acharCampo(p.campo));
              if (!el) throw new Error(`não achei o campo “${p.campo.rotulo || p.campo.name}”`);
              await setCampo(el, valor, p);
            }
            job.passo++; await store.set({ job }); await sleep(400);
          } else {
            const texto = p.fonte ? valorDe(p.fonte) : p.alvo.texto;
            if (PROIBIDOS.test(p.alvo.texto)) {
              await msg({ type: "soltar" });
              await msg({ type: "fim", status: "revisar", texto: `${job.processo.razao}: preenchi até o botão “${p.alvo.texto}”. Revise e clique você.` + (job.log.length ? " Avisos: " + job.log.join(" ") : "") });
              mostrarPainel(`✋ Parei antes de <b>“${esc(p.alvo.texto)}”</b>.<br>Revise tudo e clique você.` + (job.log.length ? `<br><small>${job.log.map(esc).join("<br>")}</small>` : ""), "#2e7d32");
              return;
            }
            const alvo = await waitFor(() => {
              if (p.alvo.id) { const e = document.getElementById(p.alvo.id); if (vis(e)) return e; }
              const cands = clicaveis();
              const n = norm(texto);
              return cands.find((e) => norm(textoDe(e)) === n) || (p.fonte && cands.find((e) => norm(textoDe(e)).includes(n))) || (p.fonte && digits(texto).length >= 4 && cands.find((e) => digits(textoDe(e)).includes(digits(texto))));
            });
            if (!alvo) throw new Error(`não achei o botão/opção “${texto}”`);
            job.passo++; await store.set({ job }); // antes do clique: a página pode recarregar
            alvo.scrollIntoView({ block: "center" }); alvo.click();
            await sleep(1200);
          }
        } catch (e) {
          await msg({ type: "soltar" });
          await msg({ type: "fim", status: "erro", texto: `${job.processo.razao}: parei no passo ${job.passo + 1} – ${e.message}.` });
          mostrarPainel(`⚠️ Parei no passo ${job.passo + 1} de ${total}:<br>${esc(e.message)}.<br><small>Termine à mão. Se a tela mudou, grave uma aula nova.</small>`, "#c62828");
          return;
        }
      }
    } finally { executando = false; }
  }

  // =====================================================================
  // 3) NÚMERO DA VIABILIDADE NA TELA -> LANÇAR NO PORTAL
  // =====================================================================
  let numeroOferecido = "";
  async function procurarNumero() {
    if (!TOPO) return;
    const m = (document.body && document.body.innerText || "").match(REGEX_VIAB);
    if (!m || m[1] === numeroOferecido) return;
    const { ultimoProcesso, job, gravando: g } = await store.get(["ultimoProcesso", "job", "gravando"]);
    if ((job && job.ativo) || (g && g.ativo)) return;
    if (!ultimoProcesso) return;
    numeroOferecido = m[1];
    mostrarPainel(`Achei o número <b>${esc(m[1])}</b> nesta tela.<br>Lançar na viabilidade de <b>${esc(ultimoProcesso.razao)}</b> no portal?<br><button id="cr-lancar">Lançar no portal</button><button id="cr-nao">Agora não</button>`);
    document.getElementById("cr-nao").onclick = esconderPainel;
    document.getElementById("cr-lancar").onclick = async () => {
      const r = await msg({ type: "salvarViabilidade", id: ultimoProcesso.id, numero: m[1] });
      mostrarPainel(r.ok ? `✅ ${esc(r.data)} lançado em ${esc(ultimoProcesso.razao)}. Status: Em análise.` : `⚠️ ${esc(r.error)}`, r.ok ? "#2e7d32" : "#c62828");
      setTimeout(esconderPainel, 8000);
    };
  }

  // ---------------- início ----------------
  async function iniciar() {
    const { gravando: g, job } = await store.get(["gravando", "job"]);
    if (g && g.ativo) { gravando = g; if (TOPO) atualizarPainelGravacao(); }
    if (job && job.ativo) executar();
  }
  document.addEventListener("change", onChange, true);
  document.addEventListener("click", onClick, true);
  chrome.storage.onChanged.addListener((ch) => {
    if (ch.gravando) { gravando = ch.gravando.newValue && ch.gravando.newValue.ativo ? ch.gravando.newValue : null; if (gravando && TOPO) atualizarPainelGravacao(); }
    if (ch.job && ch.job.newValue && ch.job.newValue.ativo && !executando) executar();
  });
  chrome.runtime.onMessage.addListener((m) => { if (m.type === "acordar") iniciar(); });
  iniciar();
  setInterval(procurarNumero, 3000);
})();

importScripts("config.js");
const C = self.CRISTINA_CONFIG;
const anexados = new Set();
chrome.debugger.onDetach.addListener((src) => anexados.delete(src.tabId));

// =====================================================================
// SESSÃO DO PORTAL ASAP (login do próprio usuário, igual à Cláudia)
// =====================================================================
async function getSession() {
  const { session } = await chrome.storage.local.get("session");
  if (!session) return null;
  if (Date.now() / 1000 < session.expires_at - 60) return session;
  const r = await fetch(`${C.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: C.SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  });
  if (!r.ok) { await chrome.storage.local.remove("session"); return null; }
  const s = await r.json();
  const ns = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, user: s.user };
  await chrome.storage.local.set({ session: ns });
  return ns;
}

async function login(email, password) {
  const r = await fetch(`${C.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: C.SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const s = await r.json();
  if (!r.ok) throw new Error(s.error_description || s.msg || "Falha no login do portal");
  const ns = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, user: s.user };
  await chrome.storage.local.set({ session: ns });
  return { email: s.user.email };
}

async function rest(path, opts = {}) {
  const s = await getSession();
  if (!s) throw new Error("Faça login no portal pela extensão.");
  const r = await fetch(`${C.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: C.SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Portal: ${r.status} ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");
const fmtCNPJ = (d) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const fmtCPF = (d) => soDigitos(d).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
const fmtCEP = (d) => soDigitos(d).replace(/^(\d{5})(\d{3})$/, "$1-$2");
const numBR = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

// =====================================================================
// PROCESSOS SOCIETÁRIOS: de onde vêm os dados da viabilidade
// =====================================================================
const CAMPOS_PROC = "id,tipo,status,razao_social,nome_fantasia,cnpj,municipio,natureza_juridica,enquadramento,cnae_principal,cnaes_secundarios,tipo_unidade,cep,endereco,numero,complemento,iptu,area_imovel,area_estabelecimento,area_terreno,capital_social,objeto_social,email,telefone,socios,responsavel,numero_viabilidade,status_viabilidade,alteracao_descricao,orgao_registro,created_at";

// Processos de abertura/alteração com a viabilidade ainda pendente
async function pendentes() {
  const lista = await rest(`soc_processos?select=id,tipo,razao_social,nome_fantasia,cnpj,municipio,status,status_viabilidade,created_at,enquadramento,natureza_juridica,objeto_social,cep,numero,cnae_principal,iptu,area_estabelecimento,area_imovel&tipo=in.(abertura,alteracao)&status_viabilidade=eq.pendente&order=created_at.desc&limit=200`);
  return (lista || []).filter((p) => !/conclu|cancel|arquiv/i.test(p.status || ""))
    .map((p) => ({ id: p.id, tipo: p.tipo, razao_social: p.razao_social, nome_fantasia: p.nome_fantasia, cnpj: p.cnpj, municipio: p.municipio, faltando: faltandoDe(p), sabeFazer: p.tipo === "abertura" }));
}

// O que falta no card para a Cristina conseguir fazer a viabilidade
function faltandoDe(p) {
  const f = [];
  if (p.tipo !== "abertura") return f;
  if (!p.enquadramento) f.push("enquadramento");
  if (!p.natureza_juridica) f.push("natureza jurídica");
  if (!p.razao_social) f.push("razão social");
  if (!p.objeto_social) f.push("objeto social");
  if (!p.municipio) f.push("município");
  if (!p.cep) f.push("CEP");
  if (!p.numero) f.push("número do endereço");
  if (!p.cnae_principal) f.push("CNAE principal");
  if (!p.iptu) f.push("IPTU");
  if (!p.area_estabelecimento && !p.area_imovel) f.push("área");
  return f;
}

// Monta o "dicionário" de dados que a Cristina pode usar para preencher.
// Cada item: chave (nome interno), rótulo (como você lê) e valor.
function dicionario(p) {
  const d = [];
  const add = (chave, rotulo, valor) => { if (valor != null && String(valor).trim() !== "") d.push({ chave, rotulo, valor: String(valor).trim() }); };
  const municipio = String(p.municipio || "").replace(/\s*\/\s*SP$/i, "");
  add("razao_social", "Razão social", (p.razao_social || "").toUpperCase());
  add("razao_sem_acento", "Razão social (sem acento)", (p.razao_social || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase());
  add("nome_fantasia", "Nome fantasia", (p.nome_fantasia || "").toUpperCase());
  add("cnpj", "CNPJ", p.cnpj ? fmtCNPJ(soDigitos(p.cnpj)) : "");
  add("municipio", "Município", municipio);
  add("natureza_juridica", "Natureza jurídica", p.natureza_juridica);
  add("natureza_codigo", "Natureza jurídica (código)", soDigitos((p.natureza_juridica || "").split(" ")[0]));
  add("orgao_registro", "Órgão de registro", p.orgao_registro);
  add("enquadramento", "Enquadramento (porte)", p.enquadramento);
  add("porte_sigla", "Porte (sigla)", (p.enquadramento || "").split(" ")[0]);
  add("tipo_unidade", "Tipo de unidade", p.tipo_unidade);
  add("cnae_principal", "CNAE principal", p.cnae_principal);
  add("cnae_principal_num", "CNAE principal (só números)", soDigitos(p.cnae_principal));
  const sec = String(p.cnaes_secundarios || "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  sec.forEach((c, i) => { add(`cnae_sec_${i + 1}`, `CNAE secundário ${i + 1}`, c); add(`cnae_sec_${i + 1}_num`, `CNAE secundário ${i + 1} (só números)`, soDigitos(c)); });
  add("cep", "CEP", fmtCEP(p.cep));
  add("cep_num", "CEP (só números)", soDigitos(p.cep));
  add("endereco", "Endereço (logradouro)", p.endereco);
  add("numero", "Número", p.numero);
  add("complemento", "Complemento", p.complemento);
  add("iptu", "IPTU (SQL)", p.iptu);
  add("iptu_num", "IPTU (só números)", soDigitos(p.iptu));
  const iptuD = soDigitos(p.iptu);
  add("iptu_sql", "IPTU (formato SQL)", iptuD.length === 11 ? iptuD.replace(/^(\d{3})(\d{3})(\d{4})(\d)$/, "$1.$2.$3-$4") : p.iptu);
  const dec2 = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  add("area_imovel_2c", "Área do imóvel (com centavos)", dec2(p.area_imovel));
  add("area_estabelecimento_2c", "Área do estabelecimento (com centavos)", dec2(p.area_estabelecimento));
  add("area_imovel", "Área do imóvel (m²)", numBR(p.area_imovel));
  add("area_estabelecimento", "Área do estabelecimento (m²)", numBR(p.area_estabelecimento));
  add("area_terreno", "Área do terreno (m²)", numBR(p.area_terreno));
  add("capital_social", "Capital social", numBR(p.capital_social));
  add("objeto_social", "Objeto social", p.objeto_social);
  add("email", "E-mail da empresa", p.email);
  add("telefone", "Telefone", p.telefone);
  add("telefone_num", "Telefone (só números)", soDigitos(p.telefone));
  const socios = Array.isArray(p.socios) ? p.socios.filter((s) => s && (s.cpf || s.nome)) : [];
  const resp = socios.find((s) => /administrador/i.test(s.qualificacao || "")) || socios[0];
  if (resp) {
    add("socio_resp_nome", "Sócio responsável – nome", (resp.nome || "").toUpperCase());
    add("socio_resp_cpf", "Sócio responsável – CPF", fmtCPF(resp.cpf));
    add("socio_resp_cpf_num", "Sócio responsável – CPF (só números)", soDigitos(resp.cpf));
    add("socio_resp_email", "Sócio responsável – e-mail", resp.email);
    add("socio_resp_telefone", "Sócio responsável – telefone", resp.telefone);
    add("socio_resp_rg", "Sócio responsável – RG", resp.rg);
    add("socio_resp_nascimento", "Sócio responsável – data de nascimento", resp.data_nascimento ? String(resp.data_nascimento).split("-").reverse().join("/") : "");
    add("socio_resp_qualificacao", "Sócio responsável – qualificação", resp.qualificacao);
    add("socio_resp_cep", "Sócio responsável – CEP residencial", resp.cep ? fmtCEP(resp.cep) : "");
    add("socio_resp_endereco", "Sócio responsável – endereço residencial", resp.endereco);
    add("socio_resp_numero", "Sócio responsável – número residencial", resp.numero);
  }
  socios.forEach((s, i) => {
    add(`socio_${i + 1}_nome`, `Sócio ${i + 1} – nome`, (s.nome || "").toUpperCase());
    add(`socio_${i + 1}_cpf`, `Sócio ${i + 1} – CPF`, fmtCPF(s.cpf));
  });
  add("alteracao_descricao", "Descrição da alteração", p.alteracao_descricao);
  return d;
}

async function dadosProcesso(id) {
  const r = await rest(`soc_processos?select=${CAMPOS_PROC}&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!r || !r.length) throw new Error("Processo não encontrado em Processos Societários.");
  const p = r[0];
  const faltando = faltandoDe(p);
  return { id: p.id, tipo: p.tipo, razao: p.razao_social || "", viabilidade: p.numero_viabilidade || "", statusViab: p.status_viabilidade, faltando, dic: dicionario(p) };
}

// Lança o número da viabilidade no portal e põe o status "Em análise"
async function salvarViabilidade(id, numero) {
  const n = String(numero || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{3}\d{10}$/.test(n)) throw new Error("Número inválido: são 3 letras + 10 números (ex.: SPN2633893093).");
  await rest(`soc_processos?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ numero_viabilidade: n, status_viabilidade: "em_analise", updated_at: new Date().toISOString() })
  });
  const r = await rest(`soc_processos?select=numero_viabilidade&id=eq.${encodeURIComponent(id)}`);
  if (!r || !r[0] || r[0].numero_viabilidade !== n) throw new Error("Não consegui confirmar o número no portal (verifique se você tem acesso ao Societário).");
  return n;
}

// =====================================================================
// A "AULA": o que a Cristina aprendeu vendo você fazer
// aula = { versao, gravadaEm, processoExemplo, passos: [ {tipo, pagina, campo, valor, fonte, ...} ] }
// =====================================================================
async function getAula() { const { aula } = await chrome.storage.local.get("aula"); return aula || null; }

function avisar(titulo, texto, id = "cristina-" + Date.now()) {
  try { chrome.notifications.create(id, { type: "basic", iconUrl: "icon128.png", title: titulo, message: texto, priority: 1 }); } catch (_) {}
}

// Abre (ou reaproveita) a aba do Redesim
async function abaRedesim(focar = true) {
  const abas = await chrome.tabs.query({ url: "https://*.sp.gov.br/*" });
  let tab = abas.find((t) => /vreredesim|jucesp|redesim/i.test(t.url || ""));
  if (!tab) tab = await chrome.tabs.create({ url: C.URL_REDESIM, active: focar });
  else if (focar) { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
  return tab;
}

async function comecarGravacao(processoId) {
  const proc = await dadosProcesso(processoId);
  await chrome.storage.local.set({ ultimoProcesso: { id: proc.id, razao: proc.razao },
    gravando: { ativo: true, inicio: Date.now(), processo: { id: proc.id, razao: proc.razao, tipo: proc.tipo }, dic: proc.dic, passos: [], mapas: {} } });
  await abaRedesim(true);
  return true;
}

async function pararGravacao() {
  const { gravando } = await chrome.storage.local.get("gravando");
  if (!gravando) return null;
  await chrome.storage.local.remove("gravando");
  if (!gravando.passos.length) return { passos: 0 };
  const aula = { versao: 1, gravadaEm: new Date().toISOString(), processoExemplo: gravando.processo, dicExemplo: gravando.dic, mapas: gravando.mapas || {}, passos: gravando.passos };
  await chrome.storage.local.set({ aula });
  return { passos: gravando.passos.length, ligados: gravando.passos.filter((p) => p.fonte).length };
}

const URL_NOVA_VIAB = "https://www.jucesp.sp.gov.br/integradorpaulista/";
async function comecarPreenchimento(processoId, extra = {}) {
  const proc = await dadosProcesso(processoId);
  // Abertura: roteiro próprio da JUCESP (aprendido da aula do Gustavo), lendo tudo do card do processo.
  // Outros tipos: ainda precisam de uma aula específica.
  const roteiro = proc.tipo === "abertura" ? "jucesp_abertura" : null;
  if (!roteiro) throw new Error("Por enquanto eu só faço viabilidade de ABERTURA. Para alteração, me ensine com uma aula de alteração.");
  const { autoFinalizar = true } = await chrome.storage.local.get("autoFinalizar");
  const tab = await abaRedesim(true);
  if (extra.recomecar) await chrome.tabs.update(tab.id, { url: URL_NOVA_VIAB });
  await chrome.storage.local.set({ ultimoProcesso: { id: proc.id, razao: proc.razao }, job: { ativo: true, roteiro, autoFinalizar, naFila: !!extra.naFila, tabId: tab.id, passo: 0, processo: { id: proc.id, razao: proc.razao }, dic: proc.dic, log: [], inicio: Date.now(), tarefaSasuke: extra.tarefaSasuke || null } });
  try { await chrome.tabs.sendMessage(tab.id, { type: "acordar" }); } catch (_) {}
  return { total: "todos os", faltando: proc.faltando };
}

async function fimPreenchimento(status, texto) {
  const { job } = await chrome.storage.local.get("job");
  await chrome.storage.local.remove("job");
  const { historico = [] } = await chrome.storage.local.get("historico");
  historico.unshift({ quando: new Date().toLocaleString("pt-BR"), razao: job && job.processo ? job.processo.razao : "", status, texto });
  await chrome.storage.local.set({ historico: historico.slice(0, 30) });
  const { fila } = await chrome.storage.local.get("fila");
  if (fila && fila.ativa && job && job.naFila) {
    fila.resultados.push({ razao: job.processo.razao, status, texto });
    fila.i++;
    if (status === "revisar") { fila.aguardando = true; await chrome.storage.local.set({ fila }); avisar("Cristina: revise e finalize", texto + " Depois clique em “Próxima” no painel.", "cristina-fim"); return; }
    await chrome.storage.local.set({ fila });
    setTimeout(proximoDaFila, 2500);
    return;
  }
  avisar(status === "concluida" ? "Cristina finalizou a viabilidade" : status === "revisar" ? "Cristina preencheu: revise e finalize" : "Cristina parou", texto, "cristina-fim");
  if (job && job.tarefaSasuke) await resultadoTarefa(job.tarefaSasuke, status === "erro" ? "erro" : "concluida", texto);
}

// =====================================================================
// FILA: vários processos em sequência
// fila = { ativa, ids, i, resultados: [{razao,status,texto}], tarefaSasuke, aguardando }
// =====================================================================
async function comecarFila(ids, extra = {}) {
  if (!ids || !ids.length) throw new Error("Selecione pelo menos um processo.");
  const { job } = await chrome.storage.local.get("job");
  if (job && job.ativo) throw new Error("Já estou fazendo uma viabilidade. Pare antes ou espere terminar.");
  await chrome.storage.local.set({ fila: { ativa: true, ids, i: 0, resultados: [], tarefaSasuke: extra.tarefaSasuke || null, inicio: Date.now() } });
  await proximoDaFila();
  return { total: ids.length };
}

async function proximoDaFila() {
  const { fila } = await chrome.storage.local.get("fila");
  if (!fila || !fila.ativa) return;
  fila.aguardando = false;
  while (fila.i < fila.ids.length) {
    const id = fila.ids[fila.i];
    try {
      const proc = await dadosProcesso(id);
      if (proc.tipo !== "abertura") { fila.resultados.push({ razao: proc.razao, status: "pulado", texto: "alteração: ainda não sei fazer" }); fila.i++; continue; }
      if (proc.faltando.length) { fila.resultados.push({ razao: proc.razao, status: "pulado", texto: "falta no card: " + proc.faltando.join(", ") }); fila.i++; continue; }
      await chrome.storage.local.set({ fila });
      await comecarPreenchimento(id, { naFila: true, recomecar: fila.i > 0 || fila.resultados.length > 0 });
      return;
    } catch (e) { fila.resultados.push({ razao: id, status: "erro", texto: e.message }); fila.i++; }
  }
  // terminou a fila
  fila.ativa = false; fila.fim = Date.now();
  await chrome.storage.local.set({ fila });
  const n = (s) => fila.resultados.filter((r) => r.status === s).length;
  const resumo = `Fila terminada: ${n("concluida")} finalizada(s)` + (n("revisar") ? `, ${n("revisar")} preenchida(s) para você finalizar` : "") +
    (n("erro") ? `, ${n("erro")} com erro` : "") + (n("pulado") ? `, ${n("pulado")} pulada(s)` : "") + ".";
  avisar("Cristina terminou a fila", resumo, "cristina-fila");
  if (fila.tarefaSasuke) await resultadoTarefa(fila.tarefaSasuke, n("concluida") || n("revisar") ? "concluida" : "erro",
    resumo + " " + fila.resultados.map((r) => `${r.razao}: ${r.status === "concluida" ? r.texto.replace(/^.*protocolo /, "protocolo ").replace(/ lançado.*$/, "") : r.status + " – " + r.texto}`).join("; "));
}

// =====================================================================
// PONTE COM O CARECA (antigo Sasuke): mesma ponte local da Cláudia (127.0.0.1:47321)
// =====================================================================
const CARECA = "http://127.0.0.1:47321";
async function careca(path, corpo) {
  try {
    const r = await fetch(CARECA + path, corpo ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) } : {});
    return r.ok ? await r.json() : null;
  } catch (_) { return null; } // Careca fechado
}
const resultadoTarefa = (id, status, resultado) => careca(`/ponte/tarefa/${id}`, { status, resultado });

async function acharProcesso(texto) {
  const lista = await pendentes();
  const d = soDigitos(texto);
  const alvo = String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  return lista.filter((p) => (d.length === 14 && soDigitos(p.cnpj) === d) ||
    (alvo.length >= 3 && String(p.razao_social || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().includes(alvo)));
}

let checando = false;
async function checarPonte() {
  if (checando) return; checando = true;
  try {
    const { job, historico } = await chrome.storage.local.get(["job", "historico"]);
    const ok = await careca("/ponte/status", { agente: "cristina", versao: chrome.runtime.getManifest().version,
      historico: (historico || []).slice(0, 5), trabalhando: !!(job && job.ativo), portalLogado: !!(await getSession()), aprendeu: !!(await getAula()) });
    const { fila } = await chrome.storage.local.get("fila");
    if (!ok || (job && job.ativo) || (fila && fila.ativa)) return;
    const r = await careca("/ponte/tarefas?agente=cristina");
    const t = r && r.tarefas && r.tarefas[0];
    if (!t) return;
    const pedido = `${t.sistema} ${t.acao} ${t.detalhes}`.toLowerCase();
    if (!/viabilidade|redesim|consulta pr[eé]via/.test(pedido)) return resultadoTarefa(t.id, "erro", `Ainda não sei fazer isso: "${t.acao}". Hoje eu só preencho viabilidade no Redesim SP.`);
    if (!(await getSession())) return resultadoTarefa(t.id, "erro", "Estou sem login no Portal ASAP. Entre pelo ícone da Cristina no Chrome.");
    if (/\b(todas|todos|pendentes)\b/i.test(`${t.empresa} ${t.acao} ${t.detalhes}`)) {
      const ids = (await pendentes()).filter((p) => p.sabeFazer && !p.faltando.length).map((p) => p.id);
      if (!ids.length) return resultadoTarefa(t.id, "concluida", "Não tem nenhuma abertura pronta (com o card completo) para fazer agora.");
      await resultadoTarefa(t.id, "em_execucao", `Começando a fila com ${ids.length} abertura(s).`);
      await comecarFila(ids, { tarefaSasuke: t.id });
      return;
    }
    const achados = await acharProcesso(t.empresa || "");
    if (!achados.length) return resultadoTarefa(t.id, "erro", `Não achei "${t.empresa}" entre os processos com viabilidade pendente.`);
    if (achados.length > 1) return resultadoTarefa(t.id, "erro", "Achei mais de um processo: " + achados.slice(0, 4).map((p) => p.razao_social).join("; ") + ". Fala o nome completo ou o CNPJ.");
    await resultadoTarefa(t.id, "em_execucao", "Abrindo o Redesim.");
    await comecarPreenchimento(achados[0].id, { tarefaSasuke: t.id });
  } catch (e) { /* tenta de novo no próximo ciclo */ } finally { checando = false; }
}
chrome.alarms.get("cristina-ponte", (al) => { if (!al) chrome.alarms.create("cristina-ponte", { periodInMinutes: 0.5 }); });
chrome.alarms.onAlarm.addListener((al) => { if (al.name === "cristina-ponte") checarPonte(); });

// =====================================================================
// MENSAGENS (popup e página do Redesim)
// =====================================================================
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    try {
      switch (msg.type) {
        case "login": return reply({ ok: true, data: await login(msg.email, msg.password) });
        case "logout": await chrome.storage.local.remove("session"); return reply({ ok: true });
        case "whoami": { const s = await getSession(); return reply({ ok: true, data: s ? s.user.email : null }); }
        case "pendentes": return reply({ ok: true, data: await pendentes() });
        case "dados": return reply({ ok: true, data: await dadosProcesso(msg.id) });
        case "gravar": return reply({ ok: true, data: await comecarGravacao(msg.id) });
        case "pararGravacao": return reply({ ok: true, data: await pararGravacao() });
        case "aula": return reply({ ok: true, data: await getAula() });
        case "importarAula": {
          const a = msg.aula;
          if (!a || !Array.isArray(a.passos)) throw new Error("Arquivo de aula inválido.");
          await chrome.storage.local.set({ aula: a }); return reply({ ok: true, data: a.passos.length });
        }
        case "esquecer": await chrome.storage.local.remove("aula"); return reply({ ok: true });
        case "preencher": return reply({ ok: true, data: await comecarPreenchimento(msg.id) });
        case "parar": {
          const { fila } = await chrome.storage.local.get("fila");
          if (fila && fila.ativa) { fila.ativa = false; fila.parada = true; await chrome.storage.local.set({ fila }); }
          const { job } = await chrome.storage.local.get("job");
          if (job && job.ativo) { job.naFila = false; await chrome.storage.local.set({ job }); await fimPreenchimento("erro", "Parada por você."); }
          return reply({ ok: true });
        }
        case "fila": return reply({ ok: true, data: await comecarFila(msg.ids) });
        case "proximaFila": await proximoDaFila(); return reply({ ok: true });
        case "estadoFila": { const { fila } = await chrome.storage.local.get("fila"); return reply({ ok: true, data: fila || null }); }
        case "fim": await fimPreenchimento(msg.status, msg.texto); return reply({ ok: true });
        case "salvarViabilidade": return reply({ ok: true, data: await salvarViabilidade(msg.id, msg.numero) });
        case "historico": { const { historico = [] } = await chrome.storage.local.get("historico"); return reply({ ok: true, data: historico.slice(0, 5) }); }
        case "realType": {
          // Digita como teclado de verdade (para campos com máscara que ignoram o preenchimento direto)
          const target = { tabId: sender.tab.id };
          if (!anexados.has(target.tabId)) { await chrome.debugger.attach(target, "1.3"); anexados.add(target.tabId); }
          const k = (type, key, code, vk, mod = 0) => chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: vk, modifiers: mod });
          await k("rawKeyDown", "a", "KeyA", 65, 2); await k("keyUp", "a", "KeyA", 65, 2);
          await chrome.debugger.sendCommand(target, "Input.insertText", { text: msg.text });
          if (msg.tecla === "Tab") { await k("rawKeyDown", "Tab", "Tab", 9); await k("keyUp", "Tab", "Tab", 9); }
          return reply({ ok: true });
        }
        case "aceitarConfirm": {
          // Responde "OK" sozinho às caixas "Deseja realmente…?" do navegador nesta aba (só durante o Finalizar)
          await chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId || 0] }, world: "MAIN",
            func: () => { window.confirm = () => true; window.alert = () => {}; } });
          return reply({ ok: true });
        }
        case "realClick": {
          // Clique de mouse de verdade na posição da tela (para bolinhas desenhadas por cima do campo)
          const target = { tabId: sender.tab.id };
          if (!anexados.has(target.tabId)) { await chrome.debugger.attach(target, "1.3"); anexados.add(target.tabId); }
          const base = { x: msg.x, y: msg.y, button: "left", clickCount: 1 };
          await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x: msg.x, y: msg.y });
          await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...base, type: "mousePressed" });
          await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...base, type: "mouseReleased" });
          return reply({ ok: true });
        }
        case "soltar": {
          const id = sender.tab.id;
          if (anexados.has(id)) { try { await chrome.debugger.detach({ tabId: id }); } catch (_) {} anexados.delete(id); }
          return reply({ ok: true });
        }
        default: return reply({ ok: false, error: "mensagem desconhecida" });
      }
    } catch (e) { reply({ ok: false, error: e.message }); }
  })();
  return true;
});

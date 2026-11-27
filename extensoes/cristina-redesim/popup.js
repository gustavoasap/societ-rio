const $ = (id) => document.getElementById(id);
const send = (m) => new Promise((res) => chrome.runtime.sendMessage(m, (r) => res(r || { ok: false, error: "sem resposta" })));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function aviso(t, tipo = "") { $("msg").className = "msg " + tipo; $("msg").textContent = t || ""; }
const TIPO = { abertura: "Abertura", alteracao: "Alteração" };

async function init() {
  const w = await send({ type: "whoami" });
  if (!w.ok || !w.data) { $("sLogin").classList.remove("hidden"); return; }
  $("sRun").classList.remove("hidden");
  $("who").textContent = "Portal: " + w.data;
  const { gravando } = await chrome.storage.local.get("gravando");
  if (gravando && gravando.ativo) aviso(`Estou gravando a aula com ${gravando.processo.razao}. Termine pelo painel rosa no Redesim.`, "ok");
  const { autoFinalizar = true } = await chrome.storage.local.get("autoFinalizar");
  $("autoFin").checked = autoFinalizar;
  await carregarProcessos();
  await mostrarAula();
  await mostrarFila();
}
$("autoFin").onchange = () => chrome.storage.local.set({ autoFinalizar: $("autoFin").checked });

let processos = [], filtro = "todos";
const marcados = new Set();
async function carregarProcessos() {
  const r = await send({ type: "pendentes" });
  if (!r.ok) { $("lista").innerHTML = `<small class="erro">Erro ao ler o portal</small>`; aviso(r.error, "erro"); return; }
  processos = r.data;
  const ids = new Set(processos.map((p) => p.id));
  [...marcados].forEach((id) => { if (!ids.has(id)) marcados.delete(id); });
  desenharLista();
  const { ultimoProcesso } = await chrome.storage.local.get("ultimoProcesso");
  if (ultimoProcesso && ids.has(ultimoProcesso.id)) await preview(ultimoProcesso.id);
}
const pronto = (p) => p.sabeFazer && !p.faltando.length;
function visiveis() {
  const q = $("busca").value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim(), qd = q.replace(/\D/g, "");
  return processos.filter((p) => (filtro === "todos" || p.tipo === filtro) &&
    (!q || String(p.razao_social || p.nome_fantasia || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().includes(q) || (qd.length >= 3 && String(p.cnpj || "").replace(/\D/g, "").includes(qd))));
}
function desenharLista() {
  const lista = visiveis();
  if (!lista.length) { $("lista").innerHTML = `<small style="display:block;padding:8px">${processos.length ? "Nada neste filtro." : "Nenhuma viabilidade pendente 🎉"}</small>`; }
  else $("lista").innerHTML = lista.map((p) => `<div class="it${atual && atual.id === p.id ? " sel" : ""}">
      <input type="checkbox" data-id="${esc(p.id)}" ${marcados.has(p.id) ? "checked" : ""} ${pronto(p) ? "" : "disabled"}>
      <span class="nm" data-ver="${esc(p.id)}"><span class="tag${p.tipo === "alteracao" ? " alt" : ""}">${esc(TIPO[p.tipo] || p.tipo)}</span>${esc(p.razao_social || p.nome_fantasia || "(sem nome)")}
      ${!p.sabeFazer ? `<span class="nao">Ainda não sei fazer alteração</span>` : p.faltando.length ? `<span class="falta">Falta no card: ${esc(p.faltando.join(", "))}</span>` : ""}</span></div>`).join("");
  $("lista").querySelectorAll("input[data-id]").forEach((cb) => (cb.onchange = () => { cb.checked ? marcados.add(cb.dataset.id) : marcados.delete(cb.dataset.id); contar(); }));
  $("lista").querySelectorAll("[data-ver]").forEach((s) => (s.onclick = () => preview(s.dataset.ver)));
  const prontos = lista.filter(pronto);
  $("todosProntos").checked = prontos.length > 0 && prontos.every((p) => marcados.has(p.id));
  contar();
}
function contar() {
  const n = marcados.size;
  $("contSel").textContent = n ? `${n} selecionado(s)` : "";
  $("btnFila").textContent = n ? `Fazer os ${n} selecionados em sequência` : "Fazer os selecionados";
  $("btnFila").disabled = !n;
}
document.querySelectorAll(".filtro").forEach((b) => (b.onclick = () => {
  filtro = b.dataset.f; document.querySelectorAll(".filtro").forEach((x) => x.classList.toggle("on", x === b)); desenharLista();
}));
$("busca").oninput = desenharLista;
$("todosProntos").onchange = () => { visiveis().filter(pronto).forEach((p) => ($("todosProntos").checked ? marcados.add(p.id) : marcados.delete(p.id))); desenharLista(); };

let atual = null;
async function preview(id) {
  atual = null; $("preview").innerHTML = "";
  if (!id) return;
  const r = await send({ type: "dados", id });
  if (!r.ok) { aviso(r.error, "erro"); return; }
  atual = r.data;
  const mostra = ["municipio", "natureza_juridica", "enquadramento", "cnae_principal", "cep", "endereco", "numero", "complemento", "iptu", "area_estabelecimento", "area_imovel"];
  $("preview").innerHTML = `<b>${esc(r.data.razao)}</b><br>` + r.data.dic.filter((x) => mostra.includes(x.chave)).map((x) => `${esc(x.rotulo)}: <b>${esc(x.valor)}</b>`).join("<br>") +
    (r.data.faltando.length ? `<br><span class="falta">Falta no portal: ${esc(r.data.faltando.join(", "))}</span>` : "");
  await chrome.storage.local.set({ ultimoProcesso: { id: r.data.id, razao: r.data.razao } });
  desenharLista();
}

const ST = { concluida: "✅", revisar: "✋", erro: "⚠️", pulado: "⏭️" };
async function mostrarFila() {
  const r = await send({ type: "estadoFila" });
  const f = r.ok ? r.data : null;
  if (!f || (!f.ativa && !f.resultados.length)) { $("filaStatus").classList.add("hidden"); return; }
  $("filaStatus").classList.remove("hidden");
  const atualTxt = f.ativa ? (f.aguardando ? "Esperando você finalizar e clicar em “Próxima” no painel." : `Fazendo ${Math.min(f.i + 1, f.ids.length)} de ${f.ids.length}…`) : (f.parada ? "Fila parada por você." : "Fila terminada.");
  $("filaStatus").innerHTML = `<h4>Fila</h4><small>${esc(atualTxt)}</small>` +
    (f.resultados.length ? `<div class="res">${f.resultados.map((x) => `${ST[x.status] || ""} <b>${esc(x.razao)}</b>: ${esc(x.status === "concluida" ? (x.texto.match(/[A-Z]{3}\d{10}/) || [x.texto])[0] : x.texto)}`).join("<br>")}</div>` : "");
}
setInterval(mostrarFila, 2000);

async function mostrarAula() {
  const r = await send({ type: "aula" });
  const a = r.ok ? r.data : null;
  $("btnBaixar").disabled = $("btnEsquecer").disabled = !a;
  if (!a) { $("aulaInfo").innerHTML = "<small>Abertura: já sei o roteiro da JUCESP (leio tudo do card do processo). Aulas novas servem para me ensinar outros casos, como alteração.</small>"; return; }
  const ligados = a.passos.filter((p) => p.fonte).length;
  $("aulaInfo").innerHTML = `<small>Aula gravada em ${new Date(a.gravadaEm).toLocaleString("pt-BR")} com <b>${esc(a.processoExemplo && a.processoExemplo.razao)}</b>: ${a.passos.length} passos, ${ligados} ligados aos dados do portal.</small>`;
  $("btnGravar").textContent = "Gravar uma aula nova (substitui a atual)";
}

$("btnLogin").onclick = async () => {
  aviso("Entrando…");
  const r = await send({ type: "login", email: $("email").value.trim(), password: $("senha").value });
  if (!r.ok) return aviso(r.error, "erro");
  $("senha").value = ""; $("sLogin").classList.add("hidden"); aviso(""); init();
};
$("btnGravar").onclick = async () => {
  if (!atual) return aviso("Escolha primeiro o processo que você vai usar de exemplo.", "erro");
  const r = await send({ type: "gravar", id: atual.id });
  if (!r.ok) return aviso(r.error, "erro");
  aviso("Pode começar! Faça login no Redesim e preencha a viabilidade normalmente. No fim, clique em “Terminei: salvar a aula” no painel rosa.", "ok");
};
$("btnFila").onclick = async () => {
  const ids = processos.filter((p) => marcados.has(p.id)).map((p) => p.id); // na ordem da lista
  if (!ids.length) return;
  const r = await send({ type: "fila", ids });
  if (!r.ok) return aviso(r.error, "erro");
  marcados.clear(); desenharLista();
  aviso(`Começando a fila com ${r.data.total} processo(s). Faça login no Redesim se pedir e não mexa na aba dela.` + ($("autoFin").checked ? " Vou finalizar e lançar cada número no portal." : " Vou parar antes de cada Finalizar; depois clique em “Próxima” no painel."), "ok");
  mostrarFila();
};
$("btnBaixar").onclick = async () => {
  const r = await send({ type: "aula" });
  if (!r.ok || !r.data) return;
  const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `aula-cristina-viabilidade-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  aviso("Aula baixada. Mande esse arquivo para o Claude revisar e deixar a Cristina mais esperta.", "ok");
};
$("btnImportar").onclick = () => $("arq").click();
$("arq").onchange = async () => {
  const f = $("arq").files[0]; if (!f) return;
  try { const aula = JSON.parse(await f.text()); const r = await send({ type: "importarAula", aula }); if (!r.ok) throw new Error(r.error); aviso(`Aula carregada: ${r.data} passos.`, "ok"); mostrarAula(); }
  catch (e) { aviso("Arquivo inválido: " + e.message, "erro"); }
};
$("btnEsquecer").onclick = async () => { if (!confirm("Apagar a aula que eu aprendi?")) return; await send({ type: "esquecer" }); mostrarAula(); };
$("btnLancar").onclick = async () => {
  if (!atual) return aviso("Escolha o processo.", "erro");
  const r = await send({ type: "salvarViabilidade", id: atual.id, numero: $("numViab").value });
  if (!r.ok) return aviso(r.error, "erro");
  aviso(`${r.data} lançado em ${atual.razao}. Status da viabilidade: Em análise.`, "ok"); $("numViab").value = ""; atual = null; $("preview").innerHTML = ""; carregarProcessos();
};
$("btnParar").onclick = async () => { await send({ type: "parar" }); await send({ type: "pararGravacao" }); aviso("Parei (e parei a fila, se tinha uma).", "ok"); mostrarAula(); mostrarFila(); };
$("btnSair").onclick = async () => { await send({ type: "logout" }); location.reload(); };
init();

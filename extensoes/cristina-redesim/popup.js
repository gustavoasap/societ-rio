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
  await carregarProcessos();
  await mostrarAula();
}

async function carregarProcessos() {
  const r = await send({ type: "pendentes" });
  const sel = $("proc");
  if (!r.ok) { sel.innerHTML = `<option value="">Erro ao ler o portal</option>`; aviso(r.error, "erro"); return; }
  if (!r.data.length) { sel.innerHTML = `<option value="">Nenhuma viabilidade pendente 🎉</option>`; return; }
  sel.innerHTML = `<option value="">Escolha (${r.data.length})…</option>` + r.data.map((p) =>
    `<option value="${esc(p.id)}">${esc(TIPO[p.tipo] || p.tipo)} · ${esc(p.razao_social || p.nome_fantasia || "(sem nome)")}${p.municipio ? " · " + esc(p.municipio) : ""}</option>`).join("");
  const { ultimoProcesso } = await chrome.storage.local.get("ultimoProcesso");
  if (ultimoProcesso && r.data.some((p) => p.id === ultimoProcesso.id)) { sel.value = ultimoProcesso.id; await preview(); }
}

let atual = null;
async function preview() {
  const id = $("proc").value; atual = null; $("preview").innerHTML = "";
  if (!id) return;
  const r = await send({ type: "dados", id });
  if (!r.ok) { aviso(r.error, "erro"); return; }
  atual = r.data;
  const mostra = ["municipio", "natureza_juridica", "enquadramento", "cnae_principal", "cep", "endereco", "numero", "complemento", "iptu", "area_estabelecimento", "area_imovel"];
  $("preview").innerHTML = r.data.dic.filter((x) => mostra.includes(x.chave)).map((x) => `${esc(x.rotulo)}: <b>${esc(x.valor)}</b>`).join("<br>") +
    (r.data.faltando.length ? `<br><span class="falta">Falta no portal: ${esc(r.data.faltando.join(", "))}</span>` : "");
  await chrome.storage.local.set({ ultimoProcesso: { id: r.data.id, razao: r.data.razao } });
}

async function mostrarAula() {
  const r = await send({ type: "aula" });
  const a = r.ok ? r.data : null;
  $("btnPreencher").disabled = $("btnBaixar").disabled = $("btnEsquecer").disabled = !a;
  if (!a) { $("aulaInfo").innerHTML = "<small>Ainda não aprendi a viabilidade. Escolha um processo e clique em Aprender.</small>"; return; }
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
$("proc").onchange = preview;
$("btnGravar").onclick = async () => {
  if (!atual) return aviso("Escolha primeiro o processo que você vai usar de exemplo.", "erro");
  const r = await send({ type: "gravar", id: atual.id });
  if (!r.ok) return aviso(r.error, "erro");
  aviso("Pode começar! Faça login no Redesim e preencha a viabilidade normalmente. No fim, clique em “Terminei: salvar a aula” no painel rosa.", "ok");
};
$("btnPreencher").onclick = async () => {
  if (!atual) return aviso("Escolha o processo.", "erro");
  if (atual.faltando.length && !confirm("Falta no portal: " + atual.faltando.join(", ") + ".\nPreencher assim mesmo (esses campos ficam em branco)?")) return;
  const r = await send({ type: "preencher", id: atual.id });
  if (!r.ok) return aviso(r.error, "erro");
  aviso(`Começando (${r.data.total} passos). Faça login no Redesim se pedir. Eu paro antes de transmitir.`, "ok");
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
  aviso(`${r.data} lançado em ${atual.razao}. Status da viabilidade: Em análise.`, "ok"); $("numViab").value = ""; carregarProcessos();
};
$("btnParar").onclick = async () => { await send({ type: "parar" }); await send({ type: "pararGravacao" }); aviso("Parei.", "ok"); mostrarAula(); };
$("btnSair").onclick = async () => { await send({ type: "logout" }); location.reload(); };
init();

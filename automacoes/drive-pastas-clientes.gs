/**
 * =====================================================
 * ASAP ASSESSORIA CONTÁBIL
 * AUTOMAÇÃO DE PASTAS DE CLIENTES (PORTAL ASAP → GOOGLE DRIVE)
 * =====================================================
 *
 * ORIGEM DOS CLIENTES: Base de Clientes do Portal ASAP (Supabase).
 * - Código do cliente  → número da pasta (ex.: 007 - RAZÃO SOCIAL)
 * - Razão social       → nome da pasta
 * - Link da pasta      → gravado no campo "Pasta no Drive" do cliente no portal
 *
 * FUNCIONALIDADES:
 * - A cada 5 minutos: cria as pastas dos clientes novos (sem link no portal)
 * - Recupera pastas que já existem no Drive (pelo número do cliente)
 * - Cria somente as subpastas ausentes dos departamentos
 * - Cria o arquivo SENHA CERTIFICADO.txt se não existir
 * - Botão "Criar pasta no Drive" no portal (App da Web): cria na hora
 * - Varredura completa diária (~08h) de todas as pastas
 * - Relatório por e-mail quando há criação ou aviso
 *
 * Não exclui pastas nem arquivos. Não troca links já gravados no portal.
 *
 * INSTALAÇÃO: cole este código no Apps Script, salve e execute uma vez
 * a função instalarAutomacao (autorize o acesso quando o Google pedir).
 *
 * BOTÃO DO PORTAL: Implantar > Nova implantação > tipo "App da Web" >
 * Executar como: Eu > Quem pode acessar: Qualquer pessoa > Implantar.
 * Copie a URL (termina em /exec) e cole no portal (Base de Clientes > Drive).
 * O mesmo endereço também recebe documentos enviados pelo portal: Contrato Social e
 * Cartão CNPJ (em DEPARTAMENTO - SOCIETÁRIO) e Certificado Digital (em CERTIFICADO
 * DIGITAL; os vencidos vão para CERTIFICADO DIGITAL/EXPIRADO). Senha de certificado
 * nunca passa por aqui: só o arquivo.
 * Só aceita envios de usuários logados no portal (o login é conferido no Supabase).
 *
 * ATUALIZAR O CÓDIGO SEM TROCAR A URL: Implantar > Gerenciar implantações >
 * lápis (Editar) > Versão: "Nova versão" > Implantar.
 */

// =====================================================
// 1. CONFIGURAÇÕES GERAIS
// =====================================================

const CONFIG = {
  ID_PASTA_RAIZ: '11dnSVbzLS9Fy3WgsOkc4E2gVSPiPFtqK',

  EMAIL: 'gustavo.lamartine@asapcont.com',

  // Portal ASAP (Supabase). A chave abaixo é a chave pública do portal.
  SUPABASE_URL: 'https://zpffbnhtzlphuewctpsk.supabase.co',
  SUPABASE_CHAVE:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZmZibmh0emxwaHVld2N0cHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MTkyMjMsImV4cCI6MjEwNDM5NTIyM30.KR_pKPniEzxi_0uMtSGBtyyUvOQIhHtC1psV1X3Z8lM',

  // Token exclusivo desta automação (é a "senha" que libera o acesso à Base).
  TOKEN_PORTAL: 'COLE_AQUI_O_TOKEN',

  // Não disponibilizar pastas publicamente por link.
  COMPARTILHAR_POR_LINK: false,

  ARQUIVO_SENHA: 'SENHA CERTIFICADO.txt',
  CONTEUDO_SENHA: 'SENHA CERTIFICADO'
};

// =====================================================
// 2. COMUNICAÇÃO COM O PORTAL
// =====================================================

function chamarPortal(funcao, parametros) {
  const resposta = UrlFetchApp.fetch(
    CONFIG.SUPABASE_URL + '/rest/v1/rpc/' + funcao,
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        apikey: CONFIG.SUPABASE_CHAVE,
        Authorization: 'Bearer ' + CONFIG.SUPABASE_CHAVE
      },
      payload: JSON.stringify(
        Object.assign({ p_token: CONFIG.TOKEN_PORTAL }, parametros)
      ),
      muteHttpExceptions: true
    }
  );

  const codigo = resposta.getResponseCode();
  const texto = resposta.getContentText();

  if (codigo < 200 || codigo >= 300) {
    throw new Error('Portal respondeu ' + codigo + ': ' + texto);
  }

  return texto ? JSON.parse(texto) : null;
}

// Clientes do portal: somente os sem pasta (todos = false) ou todos.
function buscarClientes(todos) {
  return chamarPortal('drive_clientes', { p_todos: !!todos }) || [];
}

// Grava o link da pasta no cliente (só se ainda estiver vazio).
function registrarPasta(idCliente, url) {
  return chamarPortal('drive_registrar_pasta', {
    p_id: idCliente,
    p_url: url
  });
}

// =====================================================
// 3. NORMALIZAÇÃO E IDENTIFICAÇÃO DE CLIENTES
// =====================================================

function normalizarID(valor) {
  const texto = String(valor).trim();

  if (!/^\d+$/.test(texto)) {
    return '';
  }

  const numero = texto.replace(/^0+/, '') || '0';

  return numero.padStart(3, '0');
}

function obterIDPasta(nome) {
  const match = String(nome).match(/^(\d+)\s*-\s*/);

  return match ? normalizarID(match[1]) : '';
}

// Extrai o ID da pasta de um link do Drive (para comparar links).
function idDoLink(url) {
  const match = String(url || '').match(/folders\/([\w-]+)/);

  return match ? match[1] : '';
}

// =====================================================
// 4. CRIAÇÃO SEGURA DE SUBPASTAS
// =====================================================

function obterOuCriarSubpasta(pastaPai, nome, log) {
  const encontradas = pastaPai.getFoldersByName(nome);

  // Se existir, reutiliza.
  if (encontradas.hasNext()) {
    const pastaExistente = encontradas.next();

    if (encontradas.hasNext()) {
      log.avisos.push(
        'Subpastas duplicadas: "' + nome +
        '" dentro de "' + pastaPai.getName() + '"'
      );
    }

    return pastaExistente;
  }

  // Se não existir, cria.
  const novaPasta = pastaPai.createFolder(nome);

  log.subpastasCriadas++;
  log.acoes.push('Subpasta criada: ' + pastaPai.getName() + ' / ' + nome);

  return novaPasta;
}

// =====================================================
// 5. VERIFICAÇÃO DO ARQUIVO TXT
// =====================================================

function garantirArquivoSenha(pastaCertificado, log) {
  const arquivos = pastaCertificado.getFilesByName(CONFIG.ARQUIVO_SENHA);

  // Arquivo existente: não modifica.
  if (arquivos.hasNext()) {
    arquivos.next();

    if (arquivos.hasNext()) {
      log.avisos.push(
        'Arquivos TXT duplicados em: ' + pastaCertificado.getUrl()
      );
    }

    return;
  }

  const novoArquivo = pastaCertificado.createFile(
    CONFIG.ARQUIVO_SENHA,
    CONFIG.CONTEUDO_SENHA,
    MimeType.PLAIN_TEXT
  );

  log.arquivosTxtCriados++;
  log.acoes.push(
    'Arquivo TXT criado: ' + pastaCertificado.getName() + ' / ' +
    CONFIG.ARQUIVO_SENHA + '\n' + novoArquivo.getUrl()
  );
}

// =====================================================
// 6. GARANTIR ESTRUTURA COMPLETA
// =====================================================

function garantirEstrutura(pastaCliente, log) {
  const certificado = obterOuCriarSubpasta(
    pastaCliente, 'CERTIFICADO DIGITAL', log
  );
  garantirArquivoSenha(certificado, log);

  obterOuCriarSubpasta(pastaCliente, 'DEPARTAMENTO - CONTÁBIL', log);
  obterOuCriarSubpasta(pastaCliente, 'DEPARTAMENTO - FISCAL', log);
  obterOuCriarSubpasta(pastaCliente, 'DEPARTAMENTO - PESSOAL', log);

  const societario = obterOuCriarSubpasta(
    pastaCliente, 'DEPARTAMENTO - SOCIETÁRIO', log
  );
  obterOuCriarSubpasta(societario, 'DOCUMENTAÇÃO CLIENTE', log);
}

// =====================================================
// 7. MAPEAR PASTAS EXISTENTES NO DRIVE
// =====================================================

function mapearPastasClientes(pastaRaiz, log) {
  const mapa = new Map();
  const todasPastas = [];
  const iterator = pastaRaiz.getFolders();

  while (iterator.hasNext()) {
    const pasta = iterator.next();
    const id = obterIDPasta(pasta.getName());

    if (!id) continue;

    todasPastas.push(pasta);

    if (!mapa.has(id)) {
      mapa.set(id, pasta);
    } else {
      log.avisos.push(
        'ATENÇÃO: existem múltiplas pastas principais para o cliente ' +
        id + '. Verificação manual necessária.'
      );
    }
  }

  return { mapa, todasPastas };
}

// =====================================================
// 8. PROCESSAMENTO PRINCIPAL
// =====================================================

function processarClientes(varreduraCompleta) {
  const lock = LockService.getScriptLock();

  // Evita execuções simultâneas deste script.
  if (!lock.tryLock(30000)) {
    console.warn('Execução ignorada: outra rotina está ativa.');
    return null;
  }

  try {
    const log = {
      clientesCriados: 0,
      linksPreenchidos: 0,
      subpastasCriadas: 0,
      arquivosTxtCriados: 0,
      pastasVerificadas: 0,
      erros: 0,
      acoes: [],
      avisos: []
    };

    const clientes = buscarClientes(varreduraCompleta);

    // Nada novo no portal: encerra sem mexer no Drive.
    if (!varreduraCompleta && clientes.length === 0) {
      return log;
    }

    const pastaRaiz = DriveApp.getFolderById(CONFIG.ID_PASTA_RAIZ);
    const resultado = mapearPastasClientes(pastaRaiz, log);
    const mapa = resultado.mapa;
    const pastasJaVerificadas = new Set();

    // 8.1. Varredura de todas as pastas existentes
    if (varreduraCompleta) {
      for (const pasta of resultado.todasPastas) {
        try {
          garantirEstrutura(pasta, log);
          pastasJaVerificadas.add(pasta.getId());
          log.pastasVerificadas++;
        } catch (erro) {
          log.erros++;
          log.avisos.push(
            'Erro na pasta "' + pasta.getName() + '": ' + erro.message
          );
        }
      }
    }

    // 8.2. Clientes do portal
    for (const cliente of clientes) {
      const id = normalizarID(cliente.codigo);
      const razao = String(cliente.razao_social || '').trim().toUpperCase();

      if (!id || !razao) continue;

      const nomePasta = id + ' - ' + razao;

      try {
        let pastaCliente;

        if (mapa.has(id)) {
          // Reutiliza a pasta do cliente, se existir.
          pastaCliente = mapa.get(id);
        } else {
          // Só cria nova pasta se o número não existir.
          pastaCliente = pastaRaiz.createFolder(nomePasta);
          mapa.set(id, pastaCliente);
          log.clientesCriados++;
          log.acoes.push('Pasta principal criada: ' + nomePasta);
        }

        if (CONFIG.COMPARTILHAR_POR_LINK) {
          pastaCliente.setSharing(
            DriveApp.Access.ANYONE_WITH_LINK,
            DriveApp.Permission.EDIT
          );
        }

        if (!pastasJaVerificadas.has(pastaCliente.getId())) {
          garantirEstrutura(pastaCliente, log);
          pastasJaVerificadas.add(pastaCliente.getId());
          log.pastasVerificadas++;
        }

        const urlPasta = pastaCliente.getUrl();
        const linkAtual = String(cliente.link_drive || '').trim();

        if (!linkAtual) {
          // Grava o link no cadastro do cliente no portal.
          const r = registrarPasta(cliente.id, urlPasta);

          if (r === 'preenchido') {
            log.linksPreenchidos++;
            log.acoes.push('Link gravado no portal: ' + nomePasta + '\n' + urlPasta);
          }
        } else if (idDoLink(linkAtual) !== pastaCliente.getId()) {
          // Não altera automaticamente links antigos.
          log.avisos.push(
            'Cliente ' + nomePasta +
            ': o link no portal é de outra pasta, diferente da pasta ' + id
          );
        }
      } catch (erro) {
        log.erros++;
        log.avisos.push(
          'Erro ao processar "' + nomePasta + '": ' + erro.message
        );
      }
    }

    // Só envia e-mail se houve mudanças ou avisos.
    if (log.acoes.length > 0 || log.avisos.length > 0) {
      try {
        enviarRelatorio(log);
      } catch (erroEmail) {
        console.error('Falha no envio de e-mail: ' + erroEmail.message);
      }
    }

    console.log(JSON.stringify(log, null, 2));
    return log;
  } finally {
    lock.releaseLock();
  }
}

// =====================================================
// 9. EXECUÇÕES
// =====================================================

// A cada 5 minutos: clientes novos (sem pasta) no portal.
function verificarNovosClientes() {
  processarClientes(false);
}

// Diária: todos os clientes e todas as pastas.
function verificacaoDiaria() {
  processarClientes(true);
  try {
    varrerDocumentos();
  } catch (e) {
    console.error('Varredura de documentos: ' + e.message);
  }
}

// =====================================================
// DOCUMENTOS (CONTRATO SOCIAL / CARTÃO CNPJ) NAS PASTAS DOS CLIENTES
// =====================================================

// Nome do arquivo → tipo do documento (ou null).
function tipoPeloNome(nome) {
  const n = String(nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/CARTAO\s*(DO\s*)?CNPJ|CADASTRO\s*CNPJ|COMPROVANTE\s*DE\s*INSCRICAO/.test(n)) return 'cartao';
  if (/CONTRATO\s*SOCIAL|ALTERACAO\s*CONTRATUAL|CONSTITUICAO|CONSOLIDACAO|ATO\s*CONSTITUTIVO|INTEIRO\s*TEOR/.test(n)) return 'contrato';
  return null;
}

// Procura Contratos Sociais e Cartões CNPJ nas pastas dos clientes e registra no portal
// (o portal mostra quem está sem Contrato Social). Usa a busca do Drive, que é rápida.
function varrerDocumentos() {
  const raizId = CONFIG.ID_PASTA_RAIZ;
  const termos = ['Contrato', 'Alteração', 'Alteracao', 'Constituição', 'Constituicao', 'Consolidação', 'Consolidacao', 'Inteiro', 'Teor', 'CNPJ', 'Comprovante'];
  const vistos = {};
  const itens = [];
  const cacheCliente = {};

  // Sobe pelas pastas até a pasta do cliente (filha direta da pasta raiz) e devolve o código.
  function codigoDoArquivo(arquivo) {
    let pais = arquivo.getParents();
    for (let nivel = 0; nivel < 8 && pais.hasNext(); nivel++) {
      const pasta = pais.next();
      const id = pasta.getId();
      if (cacheCliente[id] !== undefined) return cacheCliente[id];
      const avos = pasta.getParents();
      if (!avos.hasNext()) return null;
      const avo = avos.next();
      if (avo.getId() === raizId) {
        cacheCliente[id] = obterIDPasta(pasta.getName()) || null;
        return cacheCliente[id];
      }
      pais = pasta.getParents();
    }
    return null;
  }

  termos.forEach(function (termo) {
    const busca = DriveApp.searchFiles("title contains '" + termo + "' and trashed = false");
    while (busca.hasNext()) {
      const arq = busca.next();
      if (vistos[arq.getId()]) continue;
      vistos[arq.getId()] = true;
      const tipo = tipoPeloNome(arq.getName());
      if (!tipo) continue;
      const codigo = codigoDoArquivo(arq);
      if (!codigo) continue;
      itens.push({ codigo: Number(codigo), tipo: tipo, nome: arq.getName(), url: arq.getUrl(), drive_id: arq.getId() });
    }
  });

  // Certificados digitais: arquivos .pfx/.p12/.cer/.crt na pasta CERTIFICADO DIGITAL de cada cliente
  // (os que estão na subpasta EXPIRADO entram como expirados)
  const pastas = DriveApp.getFolderById(raizId).getFolders();
  while (pastas.hasNext()) {
    const pastaCliente = pastas.next();
    const codigo = obterIDPasta(pastaCliente.getName());
    if (!codigo) continue;
    const certs = pastaCliente.getFoldersByName('CERTIFICADO DIGITAL');
    if (!certs.hasNext()) continue;
    const pastaCert = certs.next();
    coletarCertificados(pastaCert, codigo, 'ativo', itens);
    const expirados = pastaCert.getFoldersByName('EXPIRADO');
    if (expirados.hasNext()) coletarCertificados(expirados.next(), codigo, 'expirado', itens);
  }

  if (itens.length) chamarPortal('drive_registrar_documentos', { p_itens: itens });
  console.log('Documentos registrados: ' + itens.length);
  return itens.length;
}

function coletarCertificados(pasta, codigo, situacao, itens) {
  const arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    const arq = arquivos.next();
    if (!/\.(pfx|p12|cer|crt)$/i.test(arq.getName())) continue;
    itens.push({ codigo: Number(codigo), tipo: 'certificado', nome: arq.getName(), url: arq.getUrl(), drive_id: arq.getId(), situacao: situacao });
  }
}

// Move um certificado vencido para CERTIFICADO DIGITAL / EXPIRADO do mesmo cliente.
function moverParaExpirado(driveId) {
  const arq = DriveApp.getFileById(String(driveId || ''));
  if (!dentroDaRaiz(arq)) throw new Error('Arquivo fora das pastas de clientes.');
  const pai = arq.getParents().next();
  if (pai.getName() === 'EXPIRADO') return { ok: true, erro: null };
  const log = { subpastasCriadas: 0, acoes: [], avisos: [] };
  const destino = obterOuCriarSubpasta(pai, 'EXPIRADO', log);
  arq.moveTo(destino);
  return { ok: true, url: arq.getUrl(), erro: null };
}

// Botão "Criar pasta no Drive" do portal (App da Web).
function doGet(e) {
  // Botão "Procurar no Drive" (Contratos Sociais / Cartões CNPJ já existentes)
  if (e && e.parameter && e.parameter.acao === 'documentos') {
    let resp;
    try {
      resp = { ok: true, documentos: varrerDocumentos(), erro: null };
    } catch (err) {
      resp = { ok: false, documentos: 0, erro: err.message };
    }
    return ContentService.createTextOutput(JSON.stringify(resp)).setMimeType(ContentService.MimeType.JSON);
  }

  let log = null;
  let erro = null;

  try {
    log = processarClientes(false);
  } catch (e) {
    erro = e.message;
  }

  const resposta = {
    ok: !erro && !!log,
    ocupado: !erro && !log,
    pastasCriadas: log ? log.clientesCriados : 0,
    linksGravados: log ? log.linksPreenchidos : 0,
    erros: log ? log.erros : 0,
    avisos: log ? log.avisos.slice(0, 5) : [],
    erro: erro
  };

  return ContentService
    .createTextOutput(JSON.stringify(resposta))
    .setMimeType(ContentService.MimeType.JSON);
}

// Envio de documentos pelo portal (Contrato Social, Cartão CNPJ...).
// Corpo (texto JSON): { token, codigo, nome, mime, base64, subpasta }
function doPost(e) {
  let resposta;

  try {
    const dados = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (!usuarioDoPortal(dados.token)) {
      throw new Error('Acesso negado: faça login no portal novamente.');
    }

    // Certificado vencido: vai para a subpasta EXPIRADO
    if (dados.acao === 'expirar') {
      let resp;
      try {
        resp = moverParaExpirado(dados.drive_id);
      } catch (err) {
        resp = { ok: false, erro: err.message };
      }
      return ContentService.createTextOutput(JSON.stringify(resp)).setMimeType(ContentService.MimeType.JSON);
    }

    // Portal pedindo um documento já salvo na pasta do cliente (para ler os sócios do contrato)
    if (dados.acao === 'baixar') {
      return ContentService
        .createTextOutput(JSON.stringify(baixarDocumento(dados.drive_id)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const codigo = normalizarID(dados.codigo);
    if (!codigo) throw new Error('Código do cliente inválido.');
    if (!dados.base64 || !dados.nome) throw new Error('Arquivo não recebido.');

    let pasta = pastaDoCliente(codigo);

    // Cliente novo ainda sem pasta: cria agora e procura de novo
    if (!pasta) {
      processarClientes(false);
      pasta = pastaDoCliente(codigo);
    }
    if (!pasta) throw new Error('Pasta do cliente ' + codigo + ' não encontrada no Drive.');

    const log = { subpastasCriadas: 0, acoes: [], avisos: [] };
    const nomeSub = dados.subpasta || 'DEPARTAMENTO - SOCIETÁRIO';
    // Aceita caminho com subpastas (ex.: CERTIFICADO DIGITAL/EXPIRADO)
    let destino = pasta;
    String(nomeSub).split('/').forEach(function (parte) {
      if (parte.trim()) destino = obterOuCriarSubpasta(destino, parte.trim(), log);
    });

    const bytes = Utilities.base64Decode(dados.base64);
    const nome = String(dados.nome).replace(/[\\/:*?"<>|]/g, '-').slice(0, 200);

    // Mesmo nome e mesmo tamanho: já foi enviado, não duplica
    const iguais = destino.getFilesByName(nome);
    while (iguais.hasNext()) {
      const existente = iguais.next();
      if (existente.getSize() === bytes.length) {
        resposta = { ok: true, duplicado: true, url: existente.getUrl(), drive_id: existente.getId(), pasta: pasta.getName() + ' / ' + nomeSub, erro: null };
        break;
      }
    }

    if (!resposta) {
      const blob = Utilities.newBlob(bytes, dados.mime || 'application/octet-stream', nome);
      const arquivo = destino.createFile(blob);
      resposta = { ok: true, duplicado: false, url: arquivo.getUrl(), drive_id: arquivo.getId(), pasta: pasta.getName() + ' / ' + nomeSub, erro: null };
    }
  } catch (err) {
    resposta = { ok: false, erro: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(resposta))
    .setMimeType(ContentService.MimeType.JSON);
}

// Devolve um arquivo das pastas de clientes (só dentro da pasta raiz e até 15 MB).
function baixarDocumento(driveId) {
  try {
    const arq = DriveApp.getFileById(String(driveId || ''));
    if (!dentroDaRaiz(arq)) throw new Error('Arquivo fora das pastas de clientes.');
    if (arq.getSize() > 15 * 1024 * 1024) throw new Error('Arquivo maior que 15 MB.');
    const blob = arq.getBlob();
    return { ok: true, nome: arq.getName(), mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()), erro: null };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

function dentroDaRaiz(arquivo) {
  let pais = arquivo.getParents();
  for (let nivel = 0; nivel < 10 && pais.hasNext(); nivel++) {
    const pasta = pais.next();
    if (pasta.getId() === CONFIG.ID_PASTA_RAIZ) return true;
    pais = pasta.getParents();
  }
  return false;
}

// Confere no Supabase se o token é de um usuário logado no portal.
// O login conferido fica guardado por 10 minutos (evita uma consulta por arquivo) e, se o
// Google falhar na consulta (erro passageiro do UrlFetchApp), tenta de novo até 3 vezes.
function usuarioDoPortal(token) {
  if (!token) return false;

  const cache = CacheService.getScriptCache();
  const chave = 'login_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
  ).slice(0, 40);
  if (cache.get(chave) === 'ok') return true;

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const r = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/auth/v1/user', {
        method: 'get',
        headers: { apikey: CONFIG.SUPABASE_CHAVE, Authorization: 'Bearer ' + token },
        muteHttpExceptions: true
      });
      const ok = r.getResponseCode() === 200;
      if (ok) cache.put(chave, 'ok', 600);
      return ok;
    } catch (e) {
      if (tentativa === 3) throw new Error('O Google não conseguiu conferir o login agora (' + e.message + '). Tente de novo.');
      Utilities.sleep(1500 * tentativa);
    }
  }
  return false;
}

// Pasta principal do cliente (ex.: "007 - RAZÃO SOCIAL") pelo código.
function pastaDoCliente(codigo) {
  const iterator = DriveApp.getFolderById(CONFIG.ID_PASTA_RAIZ).getFolders();

  while (iterator.hasNext()) {
    const pasta = iterator.next();
    if (obterIDPasta(pasta.getName()) === codigo) return pasta;
  }

  return null;
}

// Execução manual completa.
function criarPastasClientesPorID() {
  processarClientes(true);
}

// =====================================================
// 10. RELATÓRIO POR E-MAIL
// =====================================================

function enviarRelatorio(log) {
  const resumo = [
    'ASAP ASSESSORIA CONTÁBIL',
    'RELATÓRIO DE AUTOMAÇÃO',
    '',
    'RESUMO:',
    '',
    'Pastas de clientes criadas: ' + log.clientesCriados,
    'Links gravados no portal: ' + log.linksPreenchidos,
    'Subpastas criadas: ' + log.subpastasCriadas,
    'Arquivos TXT criados: ' + log.arquivosTxtCriados,
    'Pastas verificadas: ' + log.pastasVerificadas,
    'Erros: ' + log.erros,
    '',
    'AÇÕES REALIZADAS:',
    '',
    ...log.acoes,
    '',
    'AVISOS:',
    '',
    ...log.avisos,
    '',
    'Mensagem automática - ASAP Assessoria Contábil'
  ].join('\n');

  MailApp.sendEmail({
    to: CONFIG.EMAIL,
    subject: 'ASAP | Automação de Pastas de Clientes',
    body: resumo
  });
}

// =====================================================
// 11. INSTALAÇÃO DOS ACIONADORES
// =====================================================

function instalarAutomacao() {
  // Remove os acionadores antigos (inclusive o da planilha).
  const funcoes = [
    'aoEditarCliente',
    'verificacaoDiaria',
    'verificarNovosClientes'
  ];

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (funcoes.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Clientes novos do portal: a cada 5 minutos.
  ScriptApp.newTrigger('verificarNovosClientes')
    .timeBased()
    .everyMinutes(5)
    .create();

  // Varredura completa todos os dias, aproximadamente às 08h.
  ScriptApp.newTrigger('verificacaoDiaria')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .inTimezone('America/Sao_Paulo')
    .create();

  // Teste da conexão com o portal (mostra no registro de execução).
  const pendentes = buscarClientes(false);
  console.log(
    'Automação ASAP instalada com sucesso! Clientes sem pasta no portal: ' +
    pendentes.length
  );
}

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
 * - Varredura completa diária (~08h) de todas as pastas
 * - Relatório por e-mail quando há criação ou aviso
 *
 * Não exclui pastas nem arquivos. Não troca links já gravados no portal.
 *
 * INSTALAÇÃO: cole este código no Apps Script, salve e execute uma vez
 * a função instalarAutomacao (autorize o acesso quando o Google pedir).
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
    return;
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
      return;
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

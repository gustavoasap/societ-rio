import { useState, type ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import { Modal } from './ui'

interface Secao {
  titulo: string
  texto: ReactNode
}
interface Guia {
  titulo: string
  resumo: ReactNode
  secoes: Secao[]
}

// Bloco que se repete: como o cartão de crédito entra nos números
const CARTAO_E_DRE: Secao = {
  titulo: 'Cartão de crédito × DRE × Resumo',
  texto: (
    <>
      <p>
        <b>A compra no cartão é a despesa.</b> Ela entra na DRE, no Resumo e no Dashboard <b>na data da compra</b> (ou da parcela), com a categoria dela — é o
        regime de competência: o gasto aconteceu naquele mês.
      </p>
      <p>
        <b>Pagar a fatura não é uma nova despesa.</b> É só dinheiro saindo do banco para quitar o cartão (uma transferência banco → cartão). Por isso o pagamento
        da fatura <b>não</b> aparece na DRE nem em “Despesas do mês” — senão a mesma compra contaria duas vezes.
      </p>
      <p>
        Exemplo: compra de R$ 300 no mercado em 05/10 no cartão que vence em 03/11. A despesa de R$ 300 aparece em <b>outubro</b> (DRE e Resumo). Em 03/11 você
        paga a fatura: o saldo do banco cai R$ 300 e a dívida do cartão zera, mas a DRE de novembro não muda.
      </p>
      <p>Na tela Cartões você vê as faturas pelo mês do vencimento (quando o dinheiro sai); na DRE, pelo mês da compra.</p>
    </>
  ),
}

const GUIAS: Record<string, Guia> = {
  '/': {
    titulo: 'Resumo (página inicial)',
    resumo: 'A foto do mês atual: quanto ainda pode gastar, quanto entrou e saiu, o que vence e as metas.',
    secoes: [
      {
        titulo: 'Período',
        texto: (
          <p>
            Tudo aqui é do <b>mês atual</b> (do dia 1º até hoje, mais o que já está lançado para o resto do mês). O gráfico “Últimos 6 meses” mostra o histórico. Para
            médias e o futuro, use <b>Meu plano</b>.
          </p>
        ),
      },
      {
        titulo: 'Ainda posso gastar este mês',
        texto: (
          <p>
            Renda do mês (a que já entrou ou, se ainda não entrou, a prevista no plano) <b>−</b> o que o plano manda separar (investimento, metas e provisão das
            anuais) <b>−</b> o que já foi gasto no mês. Toque no ⓘ para ver a conta com os seus números.
          </p>
        ),
      },
      {
        titulo: 'Patrimônio, receitas, despesas e resultado',
        texto: (
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Patrimônio</b>: soma dos saldos de todas as contas ativas hoje (cartão entra negativo, porque é dívida). Vem de Contas.
            </li>
            <li>
              <b>Receitas / Despesas do mês</b>: lançamentos com data neste mês, só os seus (o que é de outra pessoa fica em “A receber de terceiros”).
              Transferências não entram. “A pagar / a receber” é a parte ainda não marcada como paga.
            </li>
            <li>
              <b>Resultado</b>: receitas − despesas do mês.
            </li>
          </ul>
        ),
      },
      CARTAO_E_DRE,
      {
        titulo: 'De onde vêm os dados',
        texto: <p>Dos lançamentos (manuais, recorrentes de Fixos, parcelas e compras no cartão, e o que você lança na Conciliação), das Contas e das Metas.</p>,
      },
    ],
  },
  '/plano': {
    titulo: 'Meu plano',
    resumo: 'Quanto você precisa por mês para viver, com as metas e a folga que escolher, e como o dinheiro anda nos próximos 12 meses.',
    secoes: [
      {
        titulo: 'Período: média mensal + projeção',
        texto: (
          <>
            <p>
              Os números de cima são uma <b>média mensal típica</b>, não o mês atual: fixos e salário (de Fixos e salário, com as anuais divididas por 12) + a média
              dos gastos do dia a dia (variáveis: últimos 3 meses fechados; eventuais e fixos sem cadastro: últimos 12) ou o limite do Orçamento, o que for maior.
            </p>
            <p>
              A tabela <b>Projeção dos próximos 12 meses</b> mostra mês a mês o futuro: salário e fixos no mês em que caem (anuais no mês do vencimento), parcelas já
              lançadas e a média do dia a dia.
            </p>
            <p>
              O mês atual, com o que já aconteceu, fica no <b>Resumo</b> (“Ainda posso gastar este mês”).
            </p>
          </>
        ),
      },
      {
        titulo: 'Como ler os números',
        texto: (
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Renda mensal</b>: salário/receitas fixas + média das receitas variáveis.
            </li>
            <li>
              <b>Custo de vida atual</b>: tudo o que você gasta num mês típico (soma da tabela “De onde vem o custo de vida”).
            </li>
            <li>
              <b>Renda mínima para viver</b>: todas as despesas previstas no mês atual (fixos e assinaturas, inclusive no cartão, parcelas e o dia a dia). Muda de mês
              para mês: o botão “Visão por mês” mostra os próximos 12.
            </li>
            <li>
              <b>Renda necessária</b>: custo de vida + a margem de folga que você escolher (%). Ao lado aparece também contando o que quer guardar.
            </li>
            <li>
              <b>Renda ideal</b>: o que precisaria ganhar para manter o padrão, cumprir as metas e ainda investir o % escolhido.
            </li>
            <li>
              <b>Todo mês, separe assim</b>: reserva de emergência, investimentos (% da renda), provisão das despesas anuais e cada meta.
            </li>
            <li>
              <b>Reserva de emergência</b>: meses escolhidos × todas as despesas do mês — fixos, fatura do cartão (assinaturas, compras e parcelas) e o resto do dia a
              dia — porque é isso que continua chegando se a renda parar.
            </li>
          </ul>
        ),
      },
      {
        titulo: 'O que você pode ajustar',
        texto: (
          <p>
            A margem de folga (%), quantos meses de reserva, o % para guardar, as metas (valor e prazo) e quais categorias são essenciais. Tudo recalcula na hora.
            Cada número tem um ⓘ com a conta detalhada.
          </p>
        ),
      },
    ],
  },
  '/dashboard': {
    titulo: 'Dashboard',
    resumo: 'Gráficos e indicadores do período escolhido: média de receitas e despesas, taxa de poupança, para onde vai o dinheiro.',
    secoes: [
      {
        titulo: 'Período',
        texto: <p>O período que você escolhe no topo (ex.: últimos 6 meses). Os indicadores são médias por mês dentro dele.</p>,
      },
      {
        titulo: 'Indicadores',
        texto: (
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Taxa de poupança</b>: quanto sobrou da receita (resultado ÷ receita).
            </li>
            <li>
              <b>Custo fixo / receita</b>: quanto da renda já está comprometido com despesas fixas.
            </li>
          </ul>
        ),
      },
      CARTAO_E_DRE,
    ],
  },
  '/dre': {
    titulo: 'DRE pessoal',
    resumo: 'Demonstração do resultado mês a mês do ano: receitas, custos fixos, variáveis e eventuais, e o que sobrou.',
    secoes: [
      {
        titulo: 'Regime de competência',
        texto: (
          <p>
            Cada lançamento entra no mês da sua data (no cartão, a data da compra ou da parcela). Só entra o que é seu: gastos em nome de outra pessoa aparecem à parte,
            embaixo, como “a reembolsar”. Transferências entre contas (inclusive o pagamento de fatura) não entram.
          </p>
        ),
      },
      {
        titulo: 'Detalhar um número',
        texto: <p>Clique no nome de uma categoria para ver todos os lançamentos do ano, ou num valor para ver os daquele mês: data, descrição, observação, conta/cartão e se é parcela ou recorrente.</p>,
      },
      {
        titulo: 'Classificação',
        texto: (
          <p>
            Fixa, variável ou eventual vem do lançamento ou, se ele não tiver, da categoria (Ajustes → Categorias). Despesa compartilhada entra só pela sua parte.
          </p>
        ),
      },
      CARTAO_E_DRE,
    ],
  },
  '/lancamentos': {
    titulo: 'Lançamentos',
    resumo: 'Todas as receitas, despesas e transferências do mês escolhido, com busca e filtros.',
    secoes: [
      {
        titulo: 'Como usar',
        texto: (
          <p>
            Toque num lançamento para editar. O botão + cria um novo (única, parcelada ou repetir). O ✓ verde marca como pago/recebido — só o que está pago mexe no
            saldo das contas.
          </p>
        ),
      },
      {
        titulo: 'Tipos',
        texto: (
          <p>
            <b>Transferência</b> é dinheiro mudando de conta (aplicar na corretora, pagar a fatura do cartão): não é ganho nem gasto e não entra na DRE.
          </p>
        ),
      },
    ],
  },
  '/fixos': {
    titulo: 'Fixos e salário',
    resumo: 'Receitas e despesas que se repetem: salário, aluguel, assinaturas, IPVA, faxina a cada 15 dias...',
    secoes: [
      {
        titulo: 'Como funciona',
        texto: (
          <p>
            Cadastre uma vez e o app lança sozinho, sempre até o fim do mês que vem. Frequências: toda semana, a cada 15 dias, a cada N dias, todo mês, a cada 2, 3 ou 6
            meses e anual. No mês, pode ser dia fixo ou N-ésimo dia útil (salário no 5º dia útil).
          </p>
        ),
      },
      {
        titulo: 'Onde isso aparece',
        texto: (
          <p>
            Nos lançamentos de cada mês, no Meu plano (renda e custo fixo; as anuais divididas por 12) e na projeção dos próximos 12 meses. As despesas ficam separadas em
            “Despesas recorrentes (fora do cartão)” e “Despesas cartão de crédito” (as que caem na fatura) — o bloco depende da conta escolhida em “Pago com”.
          </p>
        ),
      },
      {
        titulo: 'Alterar ou encerrar',
        texto: (
          <p>
            Editar muda os meses daqui para frente (reajuste de aluguel, troca de conta). Para parar, informe “Termina em” — também dá para fazer isso abrindo qualquer
            mês da recorrência em Lançamentos.
          </p>
        ),
      },
    ],
  },
  '/cartoes': {
    titulo: 'Cartões de crédito',
    resumo: 'Faturas mês a mês, o que caiu em cada uma, quem gastou e o pagamento da fatura.',
    secoes: [
      {
        titulo: 'Mês da fatura',
        texto: (
          <p>
            A fatura recebe o nome do mês do <b>vencimento</b>. Compras a partir do dia do fechamento vão para a fatura seguinte. Se num mês o banco mudar as datas, use
            “Alterar datas desta fatura”: as compras se reorganizam sozinhas.
          </p>
        ),
      },
      CARTAO_E_DRE,
      {
        titulo: 'Pagar a fatura',
        texto: <p>“Pagar fatura” registra uma transferência da conta do banco para o cartão: o saldo do banco cai, a dívida do cartão zera e a DRE não muda.</p>,
      },
      {
        titulo: 'Resumo por categoria',
        texto: <p>Mostra quanto cada categoria pesa na fatura do mês selecionado.</p>,
      },
    ],
  },
  '/terceiros': {
    titulo: 'A receber de terceiros',
    resumo: 'Gastos que você pagou em nome de outra pessoa e que ela ainda vai te devolver.',
    secoes: [
      {
        titulo: 'Como funciona',
        texto: (
          <p>
            No lançamento, escolha o Responsável (outra pessoa). Esse gasto sai da sua DRE e do seu plano e aparece aqui até você marcar como reembolsado. Despesa
            compartilhada da Conciliação já entra como reembolsada.
          </p>
        ),
      },
    ],
  },
  '/contas': {
    titulo: 'Contas',
    resumo: 'Bancos, carteira, investimentos e cartões, com o saldo de cada um.',
    secoes: [
      {
        titulo: 'Saldo',
        texto: <p>Saldo inicial + tudo o que já foi pago/recebido até hoje. Lançamento futuro ou não marcado como pago não mexe no saldo. Cartão aparece como dívida.</p>,
      },
      {
        titulo: 'Dados bancários',
        texto: <p>Banco (código), agência e conta com dígito servem para conferir se o extrato OFX importado na Conciliação é mesmo desta conta.</p>,
      },
      {
        titulo: 'Reserva de emergência',
        texto: <p>Marque “Faz parte da reserva” nas contas/aplicações da reserva: o Meu plano usa esse saldo para saber quanto já tem.</p>,
      },
    ],
  },
  '/conciliacao': {
    titulo: 'Conciliação bancária',
    resumo: 'Confere o extrato do banco com o que está no app, lança o que falta e mostra o extrato completo.',
    secoes: [
      {
        titulo: 'Trazer o extrato',
        texto: (
          <p>
            “Importar extrato” aceita OFX (confere banco, agência e conta com o cadastro) e CSV. “Digitar linha” serve para montar o extrato à mão. Linhas repetidas
            não entram duas vezes.
          </p>
        ),
      },
      {
        titulo: 'Abas',
        texto: (
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>A classificar</b>: linhas do banco que ainda não viraram lançamento. Escreva o seu histórico, escolha a categoria (ou transferência) e lance. Ícones:
              despesa compartilhada, estorno, ignorar, apagar.
            </li>
            <li>
              <b>Conciliadas</b>: linhas já ligadas a um lançamento. O lápis edita o seu histórico, a observação e a categoria sem desconciliar.
            </li>
            <li>
              <b>Só no app</b>: lançamentos desta conta que não apareceram no extrato (data/valor diferente, ainda não compensou...).
            </li>
            <li>
              <b>Extrato</b>: o extrato de uma conta ou de todas, por mês, ano ou período personalizado, com saldo anterior, entradas, saídas, saldo final e o saldo
              linha a linha.
            </li>
          </ul>
        ),
      },
      {
        titulo: 'Três históricos',
        texto: (
          <p>
            <b>Banco</b>: o texto original do extrato (guardado, não muda). <b>Histórico – Conciliação</b>: o seu título para o lançamento (ex.: “Clube”).{' '}
            <b>Observação</b>: a sua anotação livre para lembrar no futuro (ex.: “Compra de 2 coxinhas no clube”). Históricos padrão (★) guardam textos que se repetem,
            com a categoria.
          </p>
        ),
      },
      {
        titulo: 'Compartilhada e estorno',
        texto: (
          <p>
            <b>Compartilhada</b>: pagou por todos e recebeu PIX de volta; só a sua parte vira despesa. <b>Estorno</b>: devolução total ou parcial de um pagamento ou
            recebimento; o original fica pelo líquido. Os dois mantêm o saldo batendo com o banco e podem ser desfeitos em Conciliadas.
          </p>
        ),
      },
      {
        titulo: 'Saldo banco × app',
        texto: <p>Informe (ou importe no OFX) o saldo do extrato: o app compara com o saldo calculado na mesma data e mostra a diferença ou “Bateu!”.</p>,
      },
    ],
  },
  '/orcamento': {
    titulo: 'Orçamento',
    resumo: 'Limite mensal por categoria e quanto já foi usado no mês.',
    secoes: [
      {
        titulo: 'Como funciona',
        texto: <p>Defina quanto pode gastar por mês em cada categoria. O limite vale para a categoria inteira (fixos + gastos do dia a dia) e entra no Meu plano quando for maior que a média.</p>,
      },
    ],
  },
  '/metas': {
    titulo: 'Metas financeiras',
    resumo: 'Quanto juntar, até quando, e quanto guardar por mês para chegar lá.',
    secoes: [
      {
        titulo: 'Como funciona',
        texto: (
          <p>
            Informe o valor e o prazo; o app calcula quanto guardar por mês e isso entra em “Todo mês, separe assim” no Meu plano. Registre os aportes (ou resgates) para
            acompanhar o progresso. A meta “Reserva de emergência” usa o cálculo da reserva do plano.
          </p>
        ),
      },
    ],
  },
  '/objetivos': {
    titulo: 'Objetivos de vida',
    resumo: 'O que você quer conquistar (não só financeiro), dividido em etapas.',
    secoes: [
      {
        titulo: 'Como usar',
        texto: <p>Crie o objetivo com área, prazo e prioridade e quebre em etapas. Marque as etapas concluídas para ver o progresso. Os em andamento aparecem no Resumo.</p>,
      },
    ],
  },
  '/ajustes': {
    titulo: 'Ajustes',
    resumo: 'Categorias, pessoas, seu nome e senha.',
    secoes: [
      {
        titulo: 'Categorias',
        texto: (
          <p>
            Crie e edite categorias de receita e despesa: classificação (fixa, variável, eventual), se é essencial (entra na renda mínima e na reserva), limite mensal,
            ícone e cor.
          </p>
        ),
      },
      {
        titulo: 'Pessoas',
        texto: <p>Quem pode ser responsável por um gasto (os gastos delas ficam em “A receber de terceiros”).</p>,
      },
    ],
  },
}

/** Botão “?” (no topo de cada página): abre o guia da aba atual. */
export function BotaoGuia({ rota }: { rota: string }) {
  const [aberto, setAberto] = useState(false)
  const chave = Object.keys(GUIAS)
    .filter((k) => (k === '/' ? rota === '/' : rota.startsWith(k)))
    .sort((a, b) => b.length - a.length)[0]
  const guia = chave ? GUIAS[chave] : undefined
  if (!guia) return null
  return (
    <>
      <button
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/25 transition hover:bg-white/20"
        onClick={() => setAberto(true)}
        aria-label={`Guia: ${guia.titulo}`}
        title="Guia desta página"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
      {aberto && (
        <Modal
          titulo={`Guia · ${guia.titulo}`}
          onClose={() => setAberto(false)}
          rodape={
            <button type="button" className="btn-secondary" onClick={() => setAberto(false)}>
              Fechar
            </button>
          }
        >
          <p className="rounded-xl bg-azul-50 px-3 py-2 text-sm font-medium text-azul-900">{guia.resumo}</p>
          {guia.secoes.map((s) => (
            <section key={s.titulo} className="space-y-1.5 text-sm text-slate-700">
              <h3 className="text-sm font-bold text-slate-900">{s.titulo}</h3>
              {s.texto}
            </section>
          ))}
          <p className="text-xs text-slate-400">Nos números que têm ⓘ, toque para ver a conta detalhada com os seus valores.</p>
        </Modal>
      )}
    </>
  )
}

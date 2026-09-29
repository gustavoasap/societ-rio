import { useState, type FormEvent } from 'react'
import { ArrowLeftRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Bolinha, Cabecalho, Campo, CampoValor, Erro, Modal, Selecao, Vazio } from '../components/ui'
import { CORES, corDe, ICONE_CONTA } from '../components/visual'
import { useApp } from '../contexto'
import { somar } from '../lib/calculos'
import { excluir, salvar, type ContaComSaldo } from '../lib/dados'
import { moeda } from '../lib/formato'
import { rotuloDe, TIPOS_CONTA, type TipoConta } from '../tipos'

export function Contas() {
  const { contas, abrirLancamento } = useApp()
  const [edit, setEdit] = useState<ContaComSaldo | 'nova' | null>(null)
  const ativas = contas.filter((c) => c.ativa)
  const inativas = contas.filter((c) => !c.ativa)
  const positivo = somar(ativas.filter((c) => c.saldo > 0).map((c) => c.saldo))
  const dividas = somar(ativas.filter((c) => c.saldo < 0).map((c) => c.saldo))

  return (
    <div className="space-y-4">
      <Cabecalho
        titulo="Contas"
        descricao="Bancos, carteira, cartões e investimentos. O saldo considera só o que já foi pago/recebido."
        acoes={
          <>
            {contas.length > 1 && (
              <button className="btn-secondary" onClick={() => abrirLancamento({ tipo: 'transferencia' })}>
                <ArrowLeftRight className="h-4 w-4" /> Transferir
              </button>
            )}
            <button className="btn-primary" onClick={() => setEdit('nova')}>
              <Plus className="h-4 w-4" /> Nova conta
            </button>
          </>
        }
      />

      {ativas.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Resumo rotulo="Tenho" valor={positivo} cor="text-emerald-600" />
          <Resumo rotulo="Devo" valor={dividas} cor="text-rose-600" />
          <Resumo rotulo="Patrimônio" valor={somar([positivo, dividas])} cor="text-azul-700" />
        </div>
      )}

      {contas.length === 0 ? (
        <Vazio>
          <span>Cadastre suas contas com o saldo de hoje para começar.</span>
          <button className="btn-primary btn-sm mt-1" onClick={() => setEdit('nova')}>
            <Plus className="h-3.5 w-3.5" /> Nova conta
          </button>
        </Vazio>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...ativas, ...inativas].map((c) => {
            const cor = corDe(c.cor)
            const cartao = c.tipo === 'cartao'
            return (
              <div key={c.id} className={`cartao flex flex-col gap-3 ${c.ativa ? '' : 'opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <Bolinha icone={ICONE_CONTA[c.tipo]} fundo={cor.fundo} texto={cor.texto} tamanho="h-11 w-11" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-slate-900">{c.nome}</div>
                    <div className="truncate text-xs text-slate-500">
                      {rotuloDe(TIPOS_CONTA, c.tipo)}
                      {c.instituicao ? ` · ${c.instituicao}` : ''}
                      {!c.ativa && ' · desativada'}
                    </div>
                  </div>
                  <button className="icon-btn" onClick={() => setEdit(c)} aria-label="Editar conta">
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{cartao ? 'Fatura em aberto' : 'Saldo'}</div>
                  <div className={`text-xl font-extrabold tabular-nums ${c.saldo < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{moeda(cartao ? Math.abs(c.saldo) : c.saldo)}</div>
                  {cartao && c.limite ? <div className="text-xs text-slate-400">Limite disponível: {moeda(somar([c.limite, c.saldo]))}</div> : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {edit && <ContaForm inicial={edit === 'nova' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function Resumo({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div className="cartao px-3 py-3 sm:px-4">
      <div className="text-[0.6875rem] font-semibold text-slate-500 uppercase">{rotulo}</div>
      <div className={`mt-0.5 text-xs font-extrabold tabular-nums min-[400px]:text-sm sm:text-lg ${cor}`}>{moeda(valor)}</div>
    </div>
  )
}

export function ContaForm({ inicial, onClose, tipoPadrao = 'corrente' }: { inicial: ContaComSaldo | null; onClose: () => void; tipoPadrao?: TipoConta }) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [tipo, setTipo] = useState<TipoConta>(inicial?.tipo ?? tipoPadrao)
  const [fechamento, setFechamento] = useState<number | ''>(inicial?.dia_fechamento ?? '')
  const [vencimento, setVencimento] = useState<number | ''>(inicial?.dia_vencimento ?? '')
  const [instituicao, setInstituicao] = useState(inicial?.instituicao ?? '')
  // no cartão, o usuário digita a fatura atual (positiva) e gravamos como saldo negativo
  const [saldo, setSaldo] = useState<number | null>(inicial ? (inicial.tipo === 'cartao' ? -inicial.saldo_inicial : inicial.saldo_inicial) : null)
  const [negativo, setNegativo] = useState(inicial ? inicial.tipo !== 'cartao' && inicial.saldo_inicial < 0 : false)
  const [limite, setLimite] = useState<number | null>(inicial?.limite ?? null)
  const [cor, setCor] = useState(inicial?.cor ?? 'azul')
  const [ativa, setAtiva] = useState(inicial?.ativa ?? true)
  const [erro, setErro] = useState<string | null>(null)

  async function gravar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const base = Math.abs(saldo ?? 0)
    const saldo_inicial = tipo === 'cartao' ? -base : negativo ? -base : base
    try {
      await salvar('pes_contas', inicial?.id, {
        nome: nome.trim(),
        tipo,
        instituicao: instituicao.trim() || null,
        saldo_inicial,
        limite: tipo === 'cartao' ? limite : null,
        dia_fechamento: tipo === 'cartao' && fechamento ? fechamento : null,
        dia_vencimento: tipo === 'cartao' && vencimento ? vencimento : null,
        cor,
        ativa,
      })
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function apagar() {
    if (!inicial || !window.confirm(`Excluir a conta “${inicial.nome}”?`)) return
    try {
      await excluir('pes_contas', inicial.id)
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      titulo={inicial ? 'Editar conta' : 'Nova conta'}
      onClose={onClose}
      rodape={
        <>
          {inicial && (
            <button type="button" className="btn-danger btn-sm mr-auto" onClick={apagar}>
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="form-conta">
            Salvar
          </button>
        </>
      }
    >
      <form id="form-conta" onSubmit={gravar} className="space-y-4">
        <Campo label="Nome">
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Itaú, Nubank, Carteira" required autoFocus />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Tipo">
            <Selecao value={tipo} onChange={(v) => setTipo(v as TipoConta)} opcoes={TIPOS_CONTA} />
          </Campo>
          <Campo label="Banco / instituição">
            <input className="input" value={instituicao} onChange={(e) => setInstituicao(e.target.value)} />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo
            label={tipo === 'cartao' ? 'Fatura atual (antes dos lançamentos)' : 'Saldo inicial'}
            dica={inicial ? 'Saldo antes do primeiro lançamento no app.' : 'Informe o saldo de hoje.'}
          >
            <CampoValor valor={saldo === null ? null : Math.abs(saldo)} onChange={setSaldo} />
          </Campo>
          {tipo === 'cartao' ? (
            <Campo label="Limite do cartão">
              <CampoValor valor={limite} onChange={setLimite} />
            </Campo>
          ) : (
            <label className="mt-6 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-rose-600" checked={negativo} onChange={(e) => setNegativo(e.target.checked)} />
              Saldo negativo (cheque especial)
            </label>
          )}
        </div>
        {tipo === 'cartao' && (
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Dia do fechamento" dica="Compras a partir desse dia vão para a próxima fatura.">
              <input className="input" type="number" min={1} max={31} value={fechamento} onChange={(e) => setFechamento(e.target.value ? Number(e.target.value) : '')} />
            </Campo>
            <Campo label="Dia do vencimento">
              <input className="input" type="number" min={1} max={31} value={vencimento} onChange={(e) => setVencimento(e.target.value ? Number(e.target.value) : '')} />
            </Campo>
          </div>
        )}
        <Campo label="Cor">
          <div className="flex flex-wrap gap-2">
            {Object.entries(CORES).map(([k, c]) => (
              <button
                key={k}
                type="button"
                onClick={() => setCor(k)}
                className={`h-8 w-8 cursor-pointer rounded-full ${c.barra} ${cor === k ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`}
                aria-label={c.label}
                title={c.label}
              />
            ))}
          </div>
        </Campo>
        {inicial && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 accent-azul-600" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
            Conta ativa (desmarque para esconder sem apagar o histórico)
          </label>
        )}
        <Erro>{erro}</Erro>
      </form>
    </Modal>
  )
}

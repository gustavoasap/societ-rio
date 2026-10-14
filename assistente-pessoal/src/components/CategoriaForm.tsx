import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { excluir, salvar } from '../lib/dados'
import { NATUREZAS, type Categoria, type Natureza } from '../tipos'
import { Campo, CampoValor, Erro, Modal, Segmentado } from './ui'
import { CORES, ICONES } from './visual'

/** Cria/edita categoria. `onSalva` recebe a categoria gravada (o lançamento usa para já selecioná-la). */
export function CategoriaForm({
  inicial,
  tipoPadrao,
  onClose,
  onSalva,
}: {
  inicial: Categoria | null
  tipoPadrao: 'despesa' | 'receita'
  onClose: () => void
  onSalva?: (c: Categoria) => void
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [tipo, setTipo] = useState(inicial?.tipo ?? tipoPadrao)
  const [icone, setIcone] = useState(inicial?.icone ?? 'tag')
  const [cor, setCor] = useState(inicial?.cor ?? 'azul')
  const [limite, setLimite] = useState<number | null>(inicial?.orcamento_mensal ?? null)
  const [natureza, setNatureza] = useState<Natureza>(inicial?.natureza ?? 'variavel')
  const [essencial, setEssencial] = useState(inicial?.essencial ?? false)
  const [ativa, setAtiva] = useState(inicial?.ativa ?? true)
  const [erro, setErro] = useState<string | null>(null)

  async function gravar(e: FormEvent) {
    e.preventDefault()
    try {
      const c = await salvar('pes_categorias', inicial?.id, { nome: nome.trim(), tipo, icone, cor, ativa, natureza, essencial: tipo === 'despesa' && essencial, orcamento_mensal: tipo === 'despesa' && limite && limite > 0 ? limite : null })
      onSalva?.(c as unknown as Categoria)
      onClose()
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setErro(m.includes('duplicate') ? 'Já existe uma categoria com esse nome.' : m)
    }
  }

  async function apagar() {
    if (!inicial || !window.confirm(`Excluir a categoria “${inicial.nome}”? Os lançamentos dela ficam “sem categoria”.`)) return
    await excluir('pes_categorias', inicial.id).then(onClose, (e: Error) => setErro(e.message))
  }

  return (
    <Modal
      titulo={inicial ? 'Editar categoria' : 'Nova categoria'}
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
          <button className="btn-primary" form="form-categoria">
            Salvar
          </button>
        </>
      }
    >
      <form id="form-categoria" onSubmit={gravar} className="space-y-4">
        {!inicial && (
          <Segmentado
            valor={tipo}
            onChange={setTipo}
            opcoes={[
              { value: 'despesa', label: 'Despesa' },
              { value: 'receita', label: 'Receita' },
            ]}
          />
        )}
        <Campo label="Nome">
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus={!inicial} />
        </Campo>
        <Campo label="Classificação" dica={tipo === 'despesa' ? 'Fixa: todo mês, mesmo valor (aluguel). Variável: todo mês, valor muda (mercado). Eventual: de vez em quando (viagem, IPVA).' : 'Fixa: salário/pró-labore. Variável: lucros, comissões. Eventual: 13º, venda de bem.'}>
          <Segmentado valor={natureza} onChange={setNatureza} opcoes={NATUREZAS} />
        </Campo>
        {tipo === 'despesa' && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-rose-600" checked={essencial} onChange={(e) => setEssencial(e.target.checked)} />
            <span>
              <b className="text-slate-800">Gasto essencial</b>
              <span className="block text-xs text-slate-500">Não dá para cortar (moradia, mercado, saúde...). Entra na renda mínima e na reserva de emergência.</span>
            </span>
          </label>
        )}
        {tipo === 'despesa' && (
          <Campo label="Limite mensal (orçamento, opcional)">
            <CampoValor valor={limite} onChange={setLimite} />
          </Campo>
        )}
        <Campo label="Ícone">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ICONES).map(([k, I]) => (
              <button
                key={k}
                type="button"
                onClick={() => setIcone(k)}
                className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg ${icone === k ? 'bg-azul-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <I className="h-4.5 w-4.5" />
              </button>
            ))}
          </div>
        </Campo>
        <Campo label="Cor">
          <div className="flex flex-wrap gap-2">
            {Object.entries(CORES).map(([k, c]) => (
              <button key={k} type="button" onClick={() => setCor(k)} className={`h-8 w-8 cursor-pointer rounded-full ${c.barra} ${cor === k ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`} aria-label={c.label} />
            ))}
          </div>
        </Campo>
        {inicial && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 accent-azul-600" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
            Categoria ativa
          </label>
        )}
        <Erro>{erro}</Erro>
      </form>
    </Modal>
  )
}

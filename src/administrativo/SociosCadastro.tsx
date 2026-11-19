import { useState } from 'react'
import { Pencil, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SociosEditor } from './SociosEditor'
import { enviarArquivoDrive } from './drive'
import { cpfValido } from './socios'
import type { Cliente, SocioCadastro } from './tipos'

const enderecoLinha = (s: SocioCadastro) =>
  [[s.rua, s.numero].filter(Boolean).join(', '), s.complemento, s.bairro, [s.cidade, s.uf].filter(Boolean).join('/'), s.cep ? `CEP ${s.cep}` : '']
    .filter(Boolean)
    .join(' - ')

/** Sócios do cadastro (Base de Clientes) nos Detalhes da Empresa: resumo e edição. */
export function SociosCadastro({ cliente, onSalvo }: { cliente: Cliente; onSalvo: (s: SocioCadastro[]) => void }) {
  const salvos = cliente.socios ?? []
  const [editando, setEditando] = useState(false)
  const [lista, setLista] = useState<SocioCadastro[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [avisoDrive, setAvisoDrive] = useState<string | null>(null)

  async function salvarNoDrive(f: File) {
    setAvisoDrive(`Salvando “${f.name}” no Drive...`)
    const r = await enviarArquivoDrive(cliente.codigo, f, { clienteId: cliente.id, tipo: 'contrato' })
    setAvisoDrive(r.ok ? `“${f.name}” ${r.duplicado ? 'já estava' : 'salvo'} no Drive: ${r.pasta}.` : `Drive: ${r.erro}`)
  }

  async function salvar() {
    const limpos = lista
      .map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) as SocioCadastro)
      .filter((x) => x.nome || x.cpf)
    const semNome = limpos.find((x) => !x.nome)
    if (semNome) return setErro(`Informe o nome do sócio do CPF ${semNome.cpf}.`)
    const invalido = limpos.find((x) => x.cpf && !cpfValido(x.cpf))
    if (invalido) return setErro(`CPF inválido para ${invalido.nome}: ${invalido.cpf}. Confira os números.`)
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.from('adm_clientes').update({ socios: limpos }).eq('id', cliente.id)
    setSalvando(false)
    if (error) return setErro(error.message)
    setEditando(false)
    onSalvo(limpos)
  }

  return (
    <div className="mb-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold tracking-wide text-slate-500 uppercase">Sócios no cadastro (Base de Clientes)</h4>
        {!editando && (
          <button
            className="btn-secondary btn-sm"
            onClick={() => {
              setLista(salvos.map((s) => ({ ...s })))
              setErro(null)
              setEditando(true)
            }}
          >
            {salvos.length ? <Pencil className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
            {salvos.length ? 'Editar sócios' : 'Incluir sócios'}
          </button>
        )}
      </div>

      {!editando &&
        (salvos.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="py-1.5 pr-3">Nome</th>
                  <th className="px-3 py-1.5">CPF</th>
                  <th className="px-3 py-1.5">Documento</th>
                  <th className="px-3 py-1.5">Endereço</th>
                  <th className="py-1.5 pl-3">Cor/Raça</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {salvos.map((s, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-slate-800">{s.nome}</div>
                      {s.qualificacao && <div className="text-xs text-slate-500">{s.qualificacao}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-slate-700">{s.cpf || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">
                      {s.doc_numero ? (
                        <>
                          {s.doc_tipo || 'Doc.'} <span className="font-mono">{s.doc_numero}</span>
                          {s.doc_orgao ? ` · ${s.doc_orgao}` : ''}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700">{enderecoLinha(s) || '—'}</td>
                    <td className="py-2 pl-3 text-xs text-slate-700">{s.cor_raca || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Nenhum sócio informado no cadastro. Clique em “Incluir sócios”.</p>
        ))}

      {editando && (
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200/70">
          <SociosEditor
            socios={lista}
            onChange={setLista}
            cnpj={cliente.cnpj}
            razaoSocial={cliente.razao_social}
            onContrato={salvarNoDrive}
            avisoDrive={avisoDrive}
          />
          {erro && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{erro}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setEditando(false)} disabled={salvando}>
              Cancelar
            </button>
            <button className="btn-primary btn-sm" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar sócios'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

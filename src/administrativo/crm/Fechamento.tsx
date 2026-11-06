import { useState } from 'react'
import { Check, Trophy, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { lerNumeroBR, moedaDigitada } from '../../lib/format'
import { Field, Modal, Select } from '../../components/ui'
import { hojeISO } from '../tipos'
import { MOTIVOS_PERDA, type Oportunidade } from './tipos'
import { CampoData } from '../../components/CampoData'

export function PerdaModal({ oportunidade, onClose, onFeito }: { oportunidade: Oportunidade; onClose: () => void; onFeito: () => void }) {
  const [motivo, setMotivo] = useState(oportunidade.motivo_perda ?? '')
  const [detalhe, setDetalhe] = useState(oportunidade.motivo_perda_detalhe ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function confirmar() {
    if (!motivo) return setErro('Escolha o motivo: é ele que mostra no painel onde estamos perdendo vendas.')
    setSalvando(true)
    const { error } = await supabase
      .from('crm_oportunidades')
      .update({ etapa: 'perdido', motivo_perda: motivo, motivo_perda_detalhe: detalhe.trim() || null })
      .eq('id', oportunidade.id)
    setSalvando(false)
    if (error) return setErro(error.message)
    onFeito()
  }

  return (
    <Modal
      title="Marcar como perdida"
      subtitulo={oportunidade.empresa}
      onClose={onClose}
      largura="max-w-lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-danger" onClick={confirmar} disabled={salvando}>
            <XCircle className="h-4 w-4" />
            Confirmar perda
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      <Field label="Por que não fechou? *">
        <Select value={motivo} onChange={setMotivo} opcoes={MOTIVOS_PERDA} vazio="Selecione o motivo" />
      </Field>
      <Field label="Detalhes (opcional)">
        <textarea className="input min-h-20" placeholder="Ex.: fechou com escritório X por R$ 450/mês" value={detalhe} onChange={(e) => setDetalhe(e.target.value)} />
      </Field>
      <p className="text-xs text-slate-500">Dá para reabrir depois: abra a oportunidade e clique na etapa para onde ela deve voltar.</p>
    </Modal>
  )
}

export function GanhoModal({
  oportunidade,
  nomeResponsavel,
  onClose,
  onFeito,
}: {
  oportunidade: Oportunidade
  nomeResponsavel: string
  onClose: () => void
  onFeito: () => void
}) {
  const jaCliente = !!oportunidade.cliente_id
  const [cadastrar, setCadastrar] = useState(!jaCliente)
  const [lancarHonorario, setLancarHonorario] = useState(!!oportunidade.valor_mensal)
  const [valor, setValor] = useState(oportunidade.valor_mensal ? moedaDigitada(String(oportunidade.valor_mensal).replace('.', ',')) : '')
  const [inicio, setInicio] = useState(hojeISO())
  const [dia, setDia] = useState('10')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function confirmar() {
    setErro(null)
    const v = lerNumeroBR(valor)
    if (cadastrar && lancarHonorario && !v) return setErro('Informe o valor do honorário mensal ou desmarque essa opção.')
    setSalvando(true)
    let clienteId = oportunidade.cliente_id
    try {
      if (cadastrar) {
        // Se já existe cliente com o mesmo CNPJ, só vincula
        if (oportunidade.cnpj) {
          const { data } = await supabase.from('adm_clientes').select('id').eq('cnpj', oportunidade.cnpj).maybeSingle()
          clienteId = data?.id ?? null
        }
        if (!clienteId) {
          const { data, error } = await supabase
            .from('adm_clientes')
            .insert({
              razao_social: oportunidade.empresa,
              cnpj: oportunidade.cnpj,
              status: 'pendente',
              responsavel: oportunidade.contato_nome,
              email: oportunidade.email,
              telefone: oportunidade.telefone,
              parceiro_id: oportunidade.parceiro_id,
              regime_tributario: oportunidade.regime_tributario,
              segmento: oportunidade.segmento,
              observacoes: `Cliente vindo do CRM${nomeResponsavel ? ` (vendido por ${nomeResponsavel})` : ''}.${oportunidade.observacoes ? `\n${oportunidade.observacoes}` : ''}`,
            })
            .select('id')
            .single()
          if (error) throw error
          clienteId = data.id
        }
        if (lancarHonorario && v) {
          const { error } = await supabase.rpc('adm_reajustar_honorario', {
            p_cliente: clienteId,
            p_valor: v,
            p_inicio: inicio,
            p_dia: Number(dia) || null,
            p_descricao: 'Honorário inicial (CRM)',
          })
          if (error) throw error
        }
      }
      const { error } = await supabase
        .from('crm_oportunidades')
        .update({ etapa: 'ganho', motivo_perda: null, motivo_perda_detalhe: null, cliente_id: clienteId, ...(v ? { valor_mensal: v } : {}) })
        .eq('id', oportunidade.id)
      if (error) throw error
      onFeito()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String((e as { message?: string }).message ?? e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      title="Venda fechada! 🎉"
      subtitulo={oportunidade.empresa}
      onClose={onClose}
      largura="max-w-xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary from-emerald-500 to-emerald-600" onClick={confirmar} disabled={salvando}>
            <Trophy className="h-4 w-4" />
            {salvando ? 'Salvando...' : 'Confirmar ganho'}
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      {jaCliente ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Esta oportunidade já está vinculada a um cliente da Base de Clientes.</p>
      ) : (
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" checked={cadastrar} onChange={(e) => setCadastrar(e.target.checked)} />
            <span className="text-sm">
              <b className="text-slate-800">Cadastrar na Base de Clientes</b>
              <span className="block text-xs text-slate-500">Cria o cliente com situação “Aguardando assinatura”, já com contato, parceiro, regime e segmento.</span>
            </span>
          </label>
          {cadastrar && (
            <>
              <label className="flex cursor-pointer items-start gap-3 border-t border-slate-100 pt-3">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" checked={lancarHonorario} onChange={(e) => setLancarHonorario(e.target.checked)} />
                <span className="text-sm">
                  <b className="text-slate-800">Lançar o honorário mensal</b>
                  <span className="block text-xs text-slate-500">Fica registrado no histórico de honorários do cliente.</span>
                </span>
              </label>
              {lancarHonorario && (
                <div className="grid gap-3 pl-7 sm:grid-cols-3">
                  <Field label="Valor mensal">
                    <input className="input tabular-nums" value={valor} onChange={(e) => setValor(e.target.value)} onBlur={(e) => setValor(moedaDigitada(e.target.value))} />
                  </Field>
                  <Field label="A partir de">
                    <CampoData className="input" value={inicio} onChange={(v) => setInicio(v)} />
                  </Field>
                  <Field label="Dia do vencimento">
                    <input type="number" min={1} max={31} className="input" value={dia} onChange={(e) => setDia(e.target.value)} />
                  </Field>
                </div>
              )}
            </>
          )}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Check className="h-3.5 w-3.5 text-emerald-600" />
        A oportunidade vai para “Ganho” e entra nos indicadores do painel.
      </p>
    </Modal>
  )
}

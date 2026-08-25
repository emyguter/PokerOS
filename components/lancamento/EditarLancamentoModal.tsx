'use client'
import { useState, useEffect } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { TIPOS, CATEGORIAS_SEGURANCA, ehTipoSeguranca } from './ExtratoView'

export interface LancamentoEditavel {
  id: string
  tipo: string
  natureza: 'credito' | 'debito'
  valor: number
  descricao: string | null
  data_lancamento: string
  categoria_seguranca?: string | null
  clube_id: string
  acerto_id: string | null
}

interface AcertoOpcao {
  id: string
  valor_acerto: number
  period_start: string | null
  period_end: string | null
}

function formatPeriodoAcerto(a: AcertoOpcao) {
  const fmtM = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (!a.period_start) return `R$ ${fmtM(a.valor_acerto)}`
  const fmtD = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const periodo = a.period_end ? `${fmtD(a.period_start)}–${fmtD(a.period_end)}` : fmtD(a.period_start)
  return `${periodo} · R$ ${fmtM(a.valor_acerto)}`
}

interface Props {
  open: boolean
  lancamento: LancamentoEditavel | null
  onClose: () => void
  onSaved: () => void
}

export function EditarLancamentoModal({ open, lancamento, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const [tipo, setTipo] = useState('')
  const [natureza, setNatureza] = useState<'credito' | 'debito'>('credito')
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_SEGURANCA[0].value)
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [data, setData] = useState('')
  const [acertoId, setAcertoId] = useState('')
  const [acertosClube, setAcertosClube] = useState<AcertoOpcao[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!lancamento) return
    setTipo(lancamento.tipo)
    setNatureza(lancamento.natureza)
    setCategoria(lancamento.categoria_seguranca ?? CATEGORIAS_SEGURANCA[0].value)
    setValor(String(lancamento.valor).replace('.', ','))
    setDescricao(lancamento.descricao ?? '')
    setData(lancamento.data_lancamento)
    setAcertoId(lancamento.acerto_id ?? '')
    setError(null)
  }, [lancamento])

  // Lista de Acertos do clube do lançamento — pra poder corrigir/preencher
  // "Qual Acerto está sendo pago?" num Pagamento/Antecipação que ainda não
  // tinha esse vínculo (lançado antes desse campo existir, por exemplo).
  useEffect(() => {
    if (!lancamento?.clube_id) { setAcertosClube([]); return }
    supabase
      .from('acertos')
      .select('id, valor_acerto, imports(period_start, period_end)')
      .eq('club_id', lancamento.clube_id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const lista = ((data ?? []) as unknown as { id: string; valor_acerto: number; imports: { period_start: string | null; period_end: string | null } | null }[])
          .map((a) => ({ id: a.id, valor_acerto: a.valor_acerto, period_start: a.imports?.period_start ?? null, period_end: a.imports?.period_end ?? null }))
        setAcertosClube(lista)
      })
  }, [lancamento?.clube_id])

  if (!open || !lancamento) return null

  // Um lançamento de Segurança sempre nasceu como Bloqueio ou Reembolso — a
  // edição mantém essa natureza fixa (não vira um Bônus, por exemplo) e
  // troca o Tipo/Natureza genéricos pela mesma Ação + Categoria da tela de
  // Segurança, pra não deixar salvar uma combinação incoerente.
  const seguranca = ehTipoSeguranca(lancamento.tipo)
  // Mesmo critério do LancarForm — só Pagamento precisa mesmo apontar pra um
  // Acerto (quita uma Diferença específica, alimenta Controle de
  // Pagamentos). Antecipação não paga Acerto — só aumenta o Stoploss quando
  // concilia com a Genia — então o campo continua disponível mas opcional.
  const ehPagamentoComAcerto = !seguranca && (tipo === 'pagamento' || tipo === 'antecipacao')
  const acertoObrigatorio = !seguranca && tipo === 'pagamento'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const valorNum = Number(valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) { setError('Informe um valor válido.'); return }
    if (acertoObrigatorio && !acertoId) { setError(t('pagamentos.qual_acerto_obrigatorio')); return }
    setSaving(true); setError(null)
    try {
      const payload = seguranca
        ? { tipo, natureza, categoria_seguranca: categoria, valor: valorNum, descricao: descricao || null, data_lancamento: data }
        : { tipo, natureza, valor: valorNum, descricao: descricao || null, data_lancamento: data, acerto_id: ehPagamentoComAcerto && acertoId ? acertoId : null }
      const { error: updErr } = await supabase.from('lancamentos').update(payload).eq('id', lancamento!.id)
      if (updErr) throw updErr
      onSaved()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">{t('lancamento.editar_titulo')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {seguranca ? (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">{t('seguranca.acao')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setTipo('seguranca_bloqueio'); setNatureza('debito') }}
                    className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${tipo === 'seguranca_bloqueio' ? 'border-alert/50 bg-alert/10 text-alert' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
                  >
                    {t('seguranca.bloqueio')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTipo('seguranca_reembolso'); setNatureza('credito') }}
                    className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${tipo === 'seguranca_reembolso' ? 'border-success/50 bg-success/10 text-success' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
                  >
                    {t('seguranca.reembolso')}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">{t('seguranca.categoria')}</label>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
                    {CATEGORIAS_SEGURANCA.map((c) => <option key={c.value} value={c.value}>{t(c.labelKey)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.data')}</label>
                  <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.valor')}</label>
                <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.tipo')}</label>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
                    {TIPOS.filter((tp) => !ehTipoSeguranca(tp.value)).map((tp) => <option key={tp.value} value={tp.value}>{t(tp.labelKey)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.data')}</label>
                  <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.natureza')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNatureza('credito')}
                      className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${natureza === 'credito' ? 'border-success/50 bg-success/10 text-success' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
                    >
                      {t('lancamento.credito')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNatureza('debito')}
                      className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${natureza === 'debito' ? 'border-alert/50 bg-alert/10 text-alert' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
                    >
                      {t('lancamento.debito')}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.valor')}</label>
                  <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
                </div>
              </div>

              {ehPagamentoComAcerto && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">{t(acertoObrigatorio ? 'pagamentos.qual_acerto' : 'pagamentos.qual_acerto_antecipacao')}</label>
                  <select value={acertoId} onChange={(e) => setAcertoId(e.target.value)} className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
                    <option value="">{t('pagamentos.selecione_acerto')}</option>
                    {acertosClube.map((a) => <option key={a.id} value={a.id}>{formatPeriodoAcerto(a)}</option>)}
                  </select>
                  {acertosClube.length === 0 && <p className="text-xs text-gray-500 mt-1.5">{t('pagamentos.nenhum_acerto_do_clube')}</p>}
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.descricao')}</label>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={t('lancamento.descricao_placeholder')} className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
          </div>

          {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">{t('common.cancelar')}</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}{t('common.salvar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

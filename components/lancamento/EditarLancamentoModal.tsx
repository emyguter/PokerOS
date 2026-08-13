'use client'
import { useState, useEffect } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { TIPOS } from './ExtratoView'

export interface LancamentoEditavel {
  id: string
  tipo: string
  natureza: 'credito' | 'debito'
  valor: number
  descricao: string | null
  data_lancamento: string
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
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [data, setData] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!lancamento) return
    setTipo(lancamento.tipo)
    setNatureza(lancamento.natureza)
    setValor(String(lancamento.valor).replace('.', ','))
    setDescricao(lancamento.descricao ?? '')
    setData(lancamento.data_lancamento)
    setError(null)
  }, [lancamento])

  if (!open || !lancamento) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const valorNum = Number(valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) { setError('Informe um valor válido.'); return }
    setSaving(true); setError(null)
    try {
      const { error: updErr } = await supabase
        .from('lancamentos')
        .update({ tipo, natureza, valor: valorNum, descricao: descricao || null, data_lancamento: data })
        .eq('id', lancamento!.id)
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">{t('lancamento.editar_titulo')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.tipo')}</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
                {TIPOS.map((tp) => <option key={tp.value} value={tp.value}>{t(tp.labelKey)}</option>)}
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

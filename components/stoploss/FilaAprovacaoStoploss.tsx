'use client'
import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { aprovarAjusteSuporte } from '@/lib/stoploss'
import type { StoplossAjuste, StoplossEscopo } from '@/lib/types'

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Todo ajuste do Suporte (qualquer justificativa) passa por aqui como
// double-check do Admin antes de mexer no Stoploss Atual do clube.
export function FilaAprovacaoStoploss() {
  const { t } = useI18n()
  const [pendentes, setPendentes] = useState<StoplossAjuste[]>([])
  const [loading, setLoading] = useState(true)
  const [processandoId, setProcessandoId] = useState<string | null>(null)
  const [escopoPorAjuste, setEscopoPorAjuste] = useState<Record<string, StoplossEscopo>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('stoploss_ajustes')
      .select('*, clubs(name)')
      .eq('status', 'pendente')
      .order('criado_em', { ascending: true })
    setPendentes((data ?? []) as unknown as StoplossAjuste[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function aprovar(a: StoplossAjuste) {
    const escopo = escopoPorAjuste[a.id]
    if (!escopo) { setError(t('stoploss.escopo_obrigatorio')); return }
    setProcessandoId(a.id); setError(null)
    try {
      await aprovarAjusteSuporte(a, escopo)
      setEscopoPorAjuste(m => {
        const resto = { ...m }
        delete resto[a.id]
        return resto
      })
      await load()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setProcessandoId(null)
    }
  }

  async function rejeitar(a: StoplossAjuste) {
    setProcessandoId(a.id); setError(null)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const { error: updErr } = await supabase.from('stoploss_ajustes').update({
        status: 'rejeitado', aprovado_por: userData.user?.id ?? null, aprovado_em: new Date().toISOString(),
      }).eq('id', a.id)
      if (updErr) throw updErr
      await load()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setProcessandoId(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
        ) : pendentes.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('stoploss.fila_vazia')}</div>
        ) : (
          <div className="divide-y divide-white/5">
            {pendentes.map(a => {
              const escopo = escopoPorAjuste[a.id]
              return (
                <div key={a.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div>
                    <p className="text-sm text-white">{a.clubs?.name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{a.justificativa}</p>
                    <p className="text-xs text-gray-600">{new Date(a.criado_em).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm font-medium ${a.natureza === 'credito' ? 'text-success' : 'text-alert'}`}>{a.natureza === 'credito' ? '+' : '−'}{formatMoeda(a.valor)}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEscopoPorAjuste(m => ({ ...m, [a.id]: 'permanente' }))}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${escopo === 'permanente' ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
                      >{t('stoploss.escopo_permanente')}</button>
                      <button
                        type="button"
                        onClick={() => setEscopoPorAjuste(m => ({ ...m, [a.id]: 'semanal' }))}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${escopo === 'semanal' ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
                      >{t('stoploss.escopo_semanal')}</button>
                    </div>
                    <button onClick={() => rejeitar(a)} disabled={processandoId === a.id} className="flex items-center gap-1.5 px-3 py-1.5 border border-alert/30 text-alert rounded-lg text-xs font-semibold hover:bg-alert/10 disabled:opacity-50 transition-colors">
                      <XCircle size={12} />{t('stoploss.rejeitar')}
                    </button>
                    <button onClick={() => aprovar(a)} disabled={processandoId === a.id || !escopo} className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-surface rounded-lg text-xs font-semibold hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      {processandoId === a.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}{t('stoploss.aprovar')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { getStoplossAtual } from '@/lib/stoploss'
import type { StoplossAjuste } from '@/lib/types'

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
    setProcessandoId(a.id); setError(null)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const atual = await getStoplossAtual(a.clube_id)
      const delta = a.natureza === 'credito' ? a.valor : -a.valor
      const resultante = atual + delta

      const { error: updErr } = await supabase.from('stoploss_ajustes').update({
        status: 'aprovado', aprovado_por: userData.user?.id ?? null, aprovado_em: new Date().toISOString(),
      }).eq('id', a.id)
      if (updErr) throw updErr

      const { error: histErr } = await supabase.from('stoploss_historico').insert({
        clube_id: a.clube_id, tipo: 'ajuste_suporte', valor_delta: delta, valor_resultante: resultante,
        motivo: a.justificativa, ajuste_id: a.id, criado_por: a.criado_por,
      })
      if (histErr) throw histErr

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
            {pendentes.map(a => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div>
                  <p className="text-sm text-white">{a.clubs?.name ?? '—'}</p>
                  <p className="text-xs text-gray-500">{a.justificativa}</p>
                  <p className="text-xs text-gray-600">{new Date(a.criado_em).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-medium ${a.natureza === 'credito' ? 'text-success' : 'text-alert'}`}>{a.natureza === 'credito' ? '+' : '−'}{formatMoeda(a.valor)}</span>
                  <button onClick={() => rejeitar(a)} disabled={processandoId === a.id} className="flex items-center gap-1.5 px-3 py-1.5 border border-alert/30 text-alert rounded-lg text-xs font-semibold hover:bg-alert/10 disabled:opacity-50 transition-colors">
                    <XCircle size={12} />{t('stoploss.rejeitar')}
                  </button>
                  <button onClick={() => aprovar(a)} disabled={processandoId === a.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-surface rounded-lg text-xs font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
                    {processandoId === a.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}{t('stoploss.aprovar')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

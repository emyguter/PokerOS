'use client'
import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { TIPOS } from './ExtratoView'

interface Pendente {
  id: string
  tipo: string
  natureza: 'credito' | 'debito'
  valor: number
  descricao: string | null
  data_lancamento: string
  origem: 'suporte' | 'genia'
  clube_id: string
  clubs: { name: string; caucao_atual: number | null; stoploss_atual: number | null; ratio_caucao_stoploss: number | null } | null
}

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const LABEL_ORIGEM: Record<string, string> = { suporte: 'Suporte', genia: 'Financeiro' }

export function FilaValidacao({ refreshKey }: { refreshKey?: number } = {}) {
  const { t } = useI18n()
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [loading, setLoading] = useState(true)
  const [validandoId, setValidandoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('lancamentos')
      .select('id, tipo, natureza, valor, descricao, data_lancamento, origem, clube_id, clubs(name, caucao_atual, stoploss_atual, ratio_caucao_stoploss)')
      .eq('status', 'em_validacao')
      .order('data_lancamento', { ascending: true })
    setPendentes((data ?? []) as unknown as Pendente[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  async function validar(p: Pendente) {
    setValidandoId(p.id); setError(null)
    try {
      const { error: updErr } = await supabase.from('lancamentos').update({ status: 'pago' }).eq('id', p.id)
      if (updErr) throw updErr

      // Caução só vira saldo do clube quando a Genia confirma — antes disso
      // é só uma promessa registrada pelo Suporte.
      if (p.tipo === 'caucao') {
        const atual = p.clubs?.caucao_atual ?? 0
        const delta = p.natureza === 'credito' ? p.valor : -p.valor
        const { error: clubErr } = await supabase.from('clubs').update({ caucao_atual: atual + delta }).eq('id', p.clube_id)
        if (clubErr) throw clubErr

        // Ratio Caução → Stoploss: só entra se o clube tiver o ratio
        // configurado, e só pra Caução mesmo (não qualquer lançamento).
        const ratio = p.clubs?.ratio_caucao_stoploss
        if (ratio != null) {
          const stoplossAtual = p.clubs?.stoploss_atual ?? 0
          const stoplossDelta = delta * ratio
          const stoplossResultante = stoplossAtual + stoplossDelta
          const { error: stoplossErr } = await supabase.from('clubs').update({ stoploss_atual: stoplossResultante }).eq('id', p.clube_id)
          if (stoplossErr) throw stoplossErr

          const { data: userData } = await supabase.auth.getUser()
          const { error: histErr } = await supabase.from('stoploss_historico').insert({
            clube_id: p.clube_id,
            tipo: 'caucao',
            valor_delta: stoplossDelta,
            valor_resultante: stoplossResultante,
            motivo: `Caução confirmada (ratio ${ratio}x)`,
            lancamento_id: p.id,
            criado_por: userData.user?.id ?? null,
          })
          if (histErr) throw histErr
        }
      }

      await load()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setValidandoId(null)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('lancamento.genia.fila_validacao')} {pendentes.length > 0 && `(${pendentes.length})`}</p>
      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
        ) : pendentes.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('lancamento.genia.nenhuma_pendencia')}</div>
        ) : (
          <div className="divide-y divide-white/5">
            {pendentes.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div>
                  <p className="text-sm text-white">
                    {p.clubs?.name ?? '—'} <span className="text-gray-500">· {t(TIPOS.find((tp) => tp.value === p.tipo)?.labelKey ?? p.tipo)}</span>
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full border border-white/10 text-gray-400">{LABEL_ORIGEM[p.origem]}</span>
                  </p>
                  <p className="text-xs text-gray-500">{new Date(p.data_lancamento + 'T00:00:00').toLocaleDateString('pt-BR')}{p.descricao ? ` · ${p.descricao}` : ''}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-medium ${p.natureza === 'credito' ? 'text-success' : 'text-alert'}`}>
                    {p.natureza === 'credito' ? '+' : '−'}{formatMoeda(p.valor)}
                  </span>
                  <button
                    onClick={() => validar(p)}
                    disabled={validandoId === p.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-surface rounded-lg text-xs font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors"
                  >
                    {validandoId === p.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    {t('lancamento.genia.validar')}
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

'use client'
import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp, Loader2, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { BuscaSelect } from '@/components/BuscaSelect'
import type { StoplossAjuste } from '@/lib/types'

interface ClubeOpcao { id: string; name: string }
interface ClubeResumo { name: string; stoploss_inicial: number | null; stoploss_atual: number | null; caucao_atual: number | null; ratio_caucao_stoploss: number | null }

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUS_CLS: Record<string, string> = {
  pendente: 'border-gold/30 bg-gold/10 text-gold',
  aprovado: 'border-success/30 bg-success/10 text-success',
  rejeitado: 'border-alert/30 bg-alert/10 text-alert',
}

export function ResumoStoploss() {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [clubeId, setClubeId] = useState('')
  const [clube, setClube] = useState<ClubeResumo | null>(null)
  const [ajustes, setAjustes] = useState<StoplossAjuste[]>([])
  const [loading, setLoading] = useState(false)

  const [aberto, setAberto] = useState(false)
  const [natureza, setNatureza] = useState<'credito' | 'debito'>('debito')
  const [valor, setValor] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  useEffect(() => {
    supabase.from('clubs').select('id, name').order('name').then(({ data }) => setClubes(data ?? []))
  }, [])

  const load = useCallback(async () => {
    if (!clubeId) { setClube(null); setAjustes([]); return }
    setLoading(true)
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from('clubs').select('name, stoploss_inicial, stoploss_atual, caucao_atual, ratio_caucao_stoploss').eq('id', clubeId).single(),
      supabase.from('stoploss_ajustes').select('*').eq('clube_id', clubeId).order('criado_em', { ascending: false }).limit(20),
    ])
    setClube(c ?? null)
    setAjustes((a ?? []) as StoplossAjuste[])
    setLoading(false)
  }, [clubeId])

  useEffect(() => { load() }, [load])

  async function enviarSolicitacao(e: React.FormEvent) {
    e.preventDefault()
    const valorNum = Number(valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) { setError('Informe um valor válido.'); return }
    if (!justificativa.trim()) { setError('Informe a justificativa.'); return }
    setSaving(true); setError(null); setSucesso(false)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const { error: insErr } = await supabase.from('stoploss_ajustes').insert({
        clube_id: clubeId,
        natureza,
        valor: valorNum,
        justificativa: justificativa.trim(),
        status: 'pendente',
        criado_por: userData.user?.id ?? null,
      })
      if (insErr) throw insErr
      setValor(''); setJustificativa(''); setSucesso(true); setAberto(false)
      await load()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="max-w-xs">
        <label className="block text-xs text-gray-500 mb-1.5">{t('stoploss.clube')}</label>
        <BuscaSelect
          value={clubeId}
          onChange={v => { setClubeId(v); setSucesso(false) }}
          opcoes={clubes.map(c => ({ id: c.id, nome: c.name }))}
          placeholder={t('common.selecione')}
        />
      </div>

      {!clubeId ? (
        <div className="p-8 text-center text-gray-500 text-sm rounded-xl border border-white/10">{t('stoploss.selecione_clube')}</div>
      ) : loading ? (
        <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-surface2 p-4">
              <p className="text-xs text-gray-500">{t('stoploss.stoploss_inicial')}</p>
              <p className="text-lg font-semibold text-white">{clube?.stoploss_inicial != null ? formatMoeda(clube.stoploss_inicial) : '—'}</p>
            </div>
            <div className="rounded-xl border border-gold/30 bg-gold/5 p-4">
              <p className="text-xs text-gray-500">{t('stoploss.stoploss_atual')}</p>
              <p className="text-lg font-semibold text-gold">{clube?.stoploss_atual != null ? formatMoeda(clube.stoploss_atual) : '—'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-surface2 p-4">
              <p className="text-xs text-gray-500">{t('stoploss.caucao_atual')}</p>
              <p className="text-lg font-semibold text-white">{clube?.caucao_atual != null ? formatMoeda(clube.caucao_atual) : '—'}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {t('stoploss.ratio_ativo', { ratio: clube?.ratio_caucao_stoploss ?? 1 })}
          </p>

          <div className="rounded-xl border border-white/10 bg-surface2/50 p-5 space-y-4">
            <button type="button" onClick={() => setAberto(v => !v)} className="flex items-center gap-2 text-sm font-medium text-gold hover:text-gold/80 transition-colors">
              {aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{t('stoploss.solicitar_ajuste')}
            </button>
            {sucesso && <p className="text-xs text-success">{t('stoploss.solicitacao_enviada')}</p>}
            {aberto && (
              <form onSubmit={enviarSolicitacao} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">{t('stoploss.natureza')}</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setNatureza('credito')} className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${natureza === 'credito' ? 'border-success/50 bg-success/10 text-success' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>{t('lancamento.credito')}</button>
                      <button type="button" onClick={() => setNatureza('debito')} className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${natureza === 'debito' ? 'border-alert/50 bg-alert/10 text-alert' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>{t('lancamento.debito')}</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">{t('stoploss.valor')}</label>
                    <input type="text" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">{t('stoploss.justificativa')}</label>
                  <input type="text" value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder={t('stoploss.justificativa_placeholder')} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
                </div>
                {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
                <div className="flex justify-end">
                  <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{t('stoploss.enviar_solicitacao')}
                  </button>
                </div>
              </form>
            )}
          </div>

          {ajustes.length > 0 && (
            <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
              {ajustes.map(a => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-white">{a.justificativa}</p>
                    <p className="text-xs text-gray-500">{new Date(a.criado_em).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${a.natureza === 'credito' ? 'text-success' : 'text-alert'}`}>{a.natureza === 'credito' ? '+' : '−'}{formatMoeda(a.valor)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CLS[a.status]}`}>{t(`stoploss.status.${a.status}`)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

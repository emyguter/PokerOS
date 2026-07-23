'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { TIPOS } from './ExtratoView'

interface ClubeOpcao { id: string; name: string }

interface LancamentoRecente {
  id: string
  tipo: string
  natureza: 'credito' | 'debito'
  valor: number
  descricao: string | null
  data_lancamento: string
  clubs: { name: string } | null
}

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

export function LancarForm() {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [clubeId, setClubeId] = useState('')
  const [tipo, setTipo] = useState<string>(TIPOS[0].value)
  const [natureza, setNatureza] = useState<'credito' | 'debito'>('credito')
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [data, setData] = useState(hoje())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [recentes, setRecentes] = useState<LancamentoRecente[]>([])
  const [loadingRecentes, setLoadingRecentes] = useState(true)

  useEffect(() => {
    supabase.from('clubs').select('id, name').order('name').then(({ data }) => setClubes(data ?? []))
  }, [])

  const loadRecentes = useCallback(async () => {
    setLoadingRecentes(true)
    const { data } = await supabase
      .from('lancamentos')
      .select('id, tipo, natureza, valor, descricao, data_lancamento, clubs(name)')
      .order('created_at', { ascending: false })
      .limit(10)
    setRecentes((data ?? []) as unknown as LancamentoRecente[])
    setLoadingRecentes(false)
  }, [])

  useEffect(() => { loadRecentes() }, [loadRecentes])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clubeId) { setError('Escolha o clube.'); return }
    const valorNum = Number(valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) { setError('Informe um valor válido.'); return }
    setSaving(true); setError(null)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const { error: insErr } = await supabase.from('lancamentos').insert({
        clube_id: clubeId,
        tipo,
        natureza,
        valor: valorNum,
        descricao: descricao || null,
        data_lancamento: data,
        criado_por: userData.user?.id ?? null,
      })
      if (insErr) throw insErr
      setValor('')
      setDescricao('')
      setData(hoje())
      await loadRecentes()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-surface2 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.clube')}</label>
            <select value={clubeId} onChange={(e) => setClubeId(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
              <option value="">{t('common.selecione')}</option>
              {clubes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.tipo')}</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
              {TIPOS.map((tp) => <option key={tp.value} value={tp.value}>{t(tp.labelKey)}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
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
            <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.data')}</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.descricao')}</label>
          <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={t('lancamento.descricao_placeholder')} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>

        {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}{t('lancamento.lancar')}
          </button>
        </div>
      </form>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('lancamento.ultimos_lancamentos')}</p>
        <div className="rounded-xl border border-white/10 overflow-hidden">
          {loadingRecentes ? (
            <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
          ) : recentes.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">{t('lancamento.nenhum_lancamento')}</div>
          ) : (
            <div className="divide-y divide-white/5">
              {recentes.map((l) => (
                <div key={l.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-white">{l.clubs?.name ?? '—'} <span className="text-gray-500">· {t(TIPOS.find((tp) => tp.value === l.tipo)?.labelKey ?? l.tipo)}</span></p>
                    <p className="text-xs text-gray-500">{new Date(l.data_lancamento + 'T00:00:00').toLocaleDateString('pt-BR')}{l.descricao ? ` · ${l.descricao}` : ''}</p>
                  </div>
                  <span className={`text-sm font-medium ${l.natureza === 'credito' ? 'text-success' : 'text-alert'}`}>
                    {l.natureza === 'credito' ? '+' : '−'}{formatMoeda(l.valor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

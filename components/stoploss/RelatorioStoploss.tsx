'use client'
import { useState, useEffect, useMemo } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

interface ClubeLinha {
  id: string
  name: string
  stoploss_inicial: number | null
  stoploss_atual: number | null
  caucao_atual: number | null
  ratio_caucao_stoploss: number | null
  leagues: { name: string } | null
}

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function RelatorioStoploss() {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeLinha[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    supabase
      .from('clubs')
      .select('id, name, stoploss_inicial, stoploss_atual, caucao_atual, ratio_caucao_stoploss, leagues(name)')
      .order('name')
      .then(({ data }) => { setClubes((data ?? []) as unknown as ClubeLinha[]); setLoading(false) })
  }, [])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return clubes
    return clubes.filter(c => c.name.toLowerCase().includes(q) || c.leagues?.name.toLowerCase().includes(q))
  }, [clubes, busca])

  const totais = useMemo(() => filtrados.reduce((acc, c) => ({
    stoploss: acc.stoploss + (c.stoploss_atual ?? 0),
    caucao: acc.caucao + (c.caucao_atual ?? 0),
  }), { stoploss: 0, caucao: 0 }), [filtrados])

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder={t('stoploss.buscar_clube')}
          className="w-full bg-surface border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
        />
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-surface2">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('stoploss.clube')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('stoploss.liga')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('stoploss.stoploss_inicial')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('stoploss.stoploss_atual')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('stoploss.caucao_atual')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('stoploss.ratio')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">{t('common.carregando')}</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">{t('common.nenhum_registro')}</td></tr>
              ) : (
                filtrados.map(c => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 text-white">{c.name}</td>
                    <td className="px-4 py-3 text-gray-400">{c.leagues?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{c.stoploss_inicial != null ? formatMoeda(c.stoploss_inicial) : '—'}</td>
                    <td className="px-4 py-3 text-right text-gold font-medium">{c.stoploss_atual != null ? formatMoeda(c.stoploss_atual) : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{c.caucao_atual != null ? formatMoeda(c.caucao_atual) : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{c.ratio_caucao_stoploss ?? 1}x</td>
                  </tr>
                ))
              )}
            </tbody>
            {filtrados.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 bg-surface2">
                  <td className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider" colSpan={3}>{t('stoploss.total')} ({filtrados.length})</td>
                  <td className="px-4 py-3 text-right text-gold font-semibold">{formatMoeda(totais.stoploss)}</td>
                  <td className="px-4 py-3 text-right text-gray-300 font-semibold">{formatMoeda(totais.caucao)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

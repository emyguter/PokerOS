'use client'
import { useState, useEffect, useMemo } from 'react'
import { Search } from 'lucide-react'
import { usePermissions } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import { buscarPeriodosAcerto, type PeriodoAcerto } from '@/lib/relatorio-resumo-acertos'
import { resolverClubesVisiveis } from '@/lib/acesso-hierarquia'
import { buscarMeusAcertos, type LinhaMeuAcerto } from '@/lib/meus-acertos'
import { ClubAcertoCard } from './ClubAcertoCard'

function formatPeriodo(p: PeriodoAcerto): string {
  const fmtD = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${fmtD(p.inicio)} → ${fmtD(p.fim)}`
}

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function MeusAcertosView() {
  const { profile } = usePermissions()
  const { t } = useI18n()
  const [periodos, setPeriodos] = useState<PeriodoAcerto[]>([])
  const [periodoFiltro, setPeriodoFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [linhas, setLinhas] = useState<LinhaMeuAcerto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aberto, setAberto] = useState<LinhaMeuAcerto | null>(null)

  useEffect(() => {
    buscarPeriodosAcerto().then((lista) => {
      setPeriodos(lista)
      if (lista.length > 0) setPeriodoFiltro(lista[0].fim)
      else setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!periodoFiltro) return
    setLoading(true); setError(null)
    resolverClubesVisiveis(profile)
      .then((clubeIds) => buscarMeusAcertos(periodoFiltro, clubeIds))
      .then(setLinhas)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [periodoFiltro, profile])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return linhas.filter((l) => !q || l.acerto.club_name.toLowerCase().includes(q) || l.acerto.club_external_id.includes(q))
  }, [linhas, busca])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('acertos.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('acertos.subtitulo')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t('acertos.buscar_placeholder')}
            className="w-full bg-surface border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
          />
        </div>
        {periodos.length > 0 && (
          <select
            value={periodoFiltro}
            onChange={(e) => setPeriodoFiltro(e.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
          >
            {periodos.map((p) => <option key={p.fim} value={p.fim}>{t('acertos.semana')}: {formatPeriodo(p)}</option>)}
          </select>
        )}
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-surface2">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos.col_clube')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos.col_liga')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos.col_valor')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500 text-sm">{t('common.carregando')}</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500 text-sm">{t('acertos.nenhum')}</td></tr>
              ) : (
                filtradas.map((l) => (
                  <tr
                    key={l.acerto.id}
                    onClick={() => setAberto(l)}
                    className="border-b border-white/5 hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-white">
                      {l.acerto.club_name}
                      <span className="block text-gray-600 text-xs">{l.acerto.club_external_id}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{l.ligaNome}</td>
                    <td className={`px-4 py-3 text-right font-medium ${l.valorFinal > 0 ? 'text-emerald-400' : l.valorFinal < 0 ? 'text-alert' : 'text-gray-300'}`}>{fmt(l.valorFinal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {aberto && (
        <ClubAcertoCard
          acerto={aberto.acerto}
          ligaNome={aberto.ligaNome}
          periodStart={aberto.periodStart}
          periodEnd={aberto.periodEnd}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  )
}

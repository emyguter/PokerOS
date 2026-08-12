'use client'
import { useState, useEffect, useMemo } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { getStoplossAtualBatch, getBasesClubesAsOf } from '@/lib/stoploss'

interface ClubeLinha {
  id: string
  name: string
  projeto: string | null
  stoploss_inicial: number | null
  caucao_atual: number | null
  ratio_caucao_stoploss: number | null
  leagues: {
    name: string
    projeto: string | null
    super_leagues: { projeto: string | null; mega_ligas: { projeto: string | null } | null } | null
  } | null
}

interface Periodo {
  // Chave de seleção do dropdown = period_end (data em que a semana daquele
  // import termina) — é o que vira o corte "como estava até essa data".
  fim: string
  inicio: string
}

function formatPeriodo(p: Periodo): string {
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${fmt(p.inicio)} → ${fmt(p.fim)}`
}

// Projeto é marcado na raiz da hierarquia (Mega Liga, Superliga, Liga ou
// Clube) e herda pra tudo que está embaixo — o clube usa o próprio, senão
// sobe até achar um definido.
function projetoEfetivo(c: ClubeLinha): string | null {
  return c.projeto
    ?? c.leagues?.projeto
    ?? c.leagues?.super_leagues?.projeto
    ?? c.leagues?.super_leagues?.mega_ligas?.projeto
    ?? null
}

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function RelatorioStoploss() {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeLinha[]>([])
  const [stoplossAtualPorClube, setStoplossAtualPorClube] = useState<Map<string, number>>(new Map())
  const [basesAsOf, setBasesAsOf] = useState<Map<string, { caucao_atual: number | null; ratio_caucao_stoploss: number | null; stoploss_inicial: number | null }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [projetoFiltro, setProjetoFiltro] = useState('')
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [periodoFiltro, setPeriodoFiltro] = useState('')

  useEffect(() => {
    supabase
      .from('clubs')
      .select('id, name, projeto, stoploss_inicial, caucao_atual, ratio_caucao_stoploss, leagues(name, projeto, super_leagues(projeto, mega_ligas(projeto)))')
      .order('name')
      .then(({ data }) => { setClubes((data ?? []) as unknown as ClubeLinha[]); setLoading(false) })

    // Período = as semanas já importadas (imports.period_start/period_end),
    // pra poder ver como o Stoploss estava naquela semana, não só hoje.
    supabase
      .from('imports')
      .select('period_start, period_end')
      .not('period_end', 'is', null)
      .order('period_end', { ascending: false })
      .then(({ data }) => {
        const vistos = new Set<string>()
        const lista: Periodo[] = []
        for (const row of (data ?? []) as { period_start: string | null; period_end: string }[]) {
          if (vistos.has(row.period_end)) continue
          vistos.add(row.period_end)
          lista.push({ fim: row.period_end, inicio: row.period_start ?? row.period_end })
        }
        setPeriodos(lista)
      })
  }, [])

  useEffect(() => {
    if (clubes.length === 0) return
    const ids = clubes.map(c => c.id)
    const asOf = periodoFiltro ? new Date(`${periodoFiltro}T23:59:59-03:00`) : undefined
    // Mantém os números antigos na tela até os novos chegarem (troca de
    // Período costuma ser rápida) em vez de piscar um loading a cada troca.
    Promise.all([
      getStoplossAtualBatch(ids, asOf),
      asOf ? getBasesClubesAsOf(ids, asOf) : Promise.resolve(new Map()),
    ]).then(([stoploss, bases]) => {
      setStoplossAtualPorClube(stoploss)
      setBasesAsOf(bases)
    })
  }, [clubes, periodoFiltro])

  const projetos = useMemo(() => {
    const nomes = new Set(clubes.map(c => projetoEfetivo(c)).filter((p): p is string => !!p))
    return [...nomes].sort()
  }, [clubes])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return clubes
      .filter(c => !projetoFiltro || projetoEfetivo(c) === projetoFiltro)
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.leagues?.name.toLowerCase().includes(q))
      .sort((a, b) => (projetoEfetivo(a) ?? '￿').localeCompare(projetoEfetivo(b) ?? '￿') || a.name.localeCompare(b.name))
  }, [clubes, busca, projetoFiltro])

  // Com Período selecionado, Caução/Ratio/Stoploss Inicial exibidos também
  // vêm do snapshot daquela data — senão a linha ficaria inconsistente
  // (Stoploss Atual histórico ao lado de Caução de hoje).
  function baseDe(c: ClubeLinha) {
    if (!periodoFiltro) return { caucao_atual: c.caucao_atual, ratio_caucao_stoploss: c.ratio_caucao_stoploss, stoploss_inicial: c.stoploss_inicial }
    const snap = basesAsOf.get(c.id)
    return snap ?? { caucao_atual: c.caucao_atual, ratio_caucao_stoploss: c.ratio_caucao_stoploss, stoploss_inicial: c.stoploss_inicial }
  }

  const totais = useMemo(() => filtrados.reduce((acc, c) => {
    const caucao = periodoFiltro ? (basesAsOf.get(c.id)?.caucao_atual ?? c.caucao_atual) : c.caucao_atual
    return {
      stoploss: acc.stoploss + (stoplossAtualPorClube.get(c.id) ?? 0),
      caucao: acc.caucao + (caucao ?? 0),
    }
  }, { stoploss: 0, caucao: 0 }), [filtrados, stoplossAtualPorClube, basesAsOf, periodoFiltro])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder={t('stoploss.buscar_clube')}
            className="w-full bg-surface border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
          />
        </div>
        <select
          value={projetoFiltro}
          onChange={e => setProjetoFiltro(e.target.value)}
          className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
        >
          <option value="">{t('stoploss.todos_projetos')}</option>
          {projetos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {periodos.length > 0 && (
          <select
            value={periodoFiltro}
            onChange={e => setPeriodoFiltro(e.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
          >
            <option value="">{t('stoploss.periodo')}: {t('stoploss.periodo_atual')}</option>
            {periodos.map(p => <option key={p.fim} value={p.fim}>{t('stoploss.periodo')}: {formatPeriodo(p)}</option>)}
          </select>
        )}
      </div>

      {periodoFiltro && (
        <p className="text-xs text-gray-500 italic">
          {t('stoploss.periodo_aviso', { periodo: formatPeriodo(periodos.find(p => p.fim === periodoFiltro) ?? { fim: periodoFiltro, inicio: periodoFiltro }) })}
        </p>
      )}

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-surface2">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('stoploss.projeto')}</th>
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
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">{t('common.carregando')}</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">{t('common.nenhum_registro')}</td></tr>
              ) : (
                filtrados.map(c => {
                  const base = baseDe(c)
                  return (
                    <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-3 text-gray-400">{projetoEfetivo(c) ?? '—'}</td>
                      <td className="px-4 py-3 text-white">{c.name}</td>
                      <td className="px-4 py-3 text-gray-400">{c.leagues?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{base.stoploss_inicial != null ? formatMoeda(base.stoploss_inicial) : '—'}</td>
                      <td className="px-4 py-3 text-right text-gold font-medium">{formatMoeda(stoplossAtualPorClube.get(c.id) ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{base.caucao_atual != null ? formatMoeda(base.caucao_atual) : '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{base.ratio_caucao_stoploss ?? 1}x</td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {filtrados.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 bg-surface2">
                  <td className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider" colSpan={4}>{t('stoploss.total')} ({filtrados.length})</td>
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

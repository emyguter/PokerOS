'use client'
import { useState, useEffect, useMemo } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { buscarPeriodosAcerto, type PeriodoAcerto } from '@/lib/relatorio-resumo-acertos'

interface ImportJogadorRow {
  jogador_id: string
  clube_id: string | null
  agente_id: string | null
  rake_total: number
  player_result: number
  jogadores: { nome: string } | null
  clubs: { name: string } | null
  agentes: { nome: string } | null
}

interface JogadorAgregado {
  jogador_id: string
  jogador_nome: string
  clubes: Set<string>
  agentes: Set<string>
  rake_total: number
  player_result: number
  rakeback_pct: number | null
  valor_rakeback: number
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PAGE_SIZE = 50

function formatPeriodo(p: PeriodoAcerto): string {
  const fmtD = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${fmtD(p.inicio)} → ${fmtD(p.fim)}`
}

// Sub-menu "Jogadores" dentro de Acertos (pedido do Cássio, junto com Super
// Agentes/Agentes) — visão cruzando todos os clubes, fonte diferente da
// tabela de Agentes (import_jogadores, que tem granularidade por jogador;
// acertos_agentes só soma por Agente). Lista tudo com paginação (cliente),
// igual pedido: muitos jogadores, mas sem exigir busca antes de listar.
export function JogadoresAcertosView() {
  const { t } = useI18n()
  const [rows, setRows] = useState<ImportJogadorRow[]>([])
  const [rakebackPorAgenteClube, setRakebackPorAgenteClube] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [periodos, setPeriodos] = useState<PeriodoAcerto[]>([])
  const [periodoFiltro, setPeriodoFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [clubeFiltro, setClubeFiltro] = useState('')
  const [agenteFiltro, setAgenteFiltro] = useState('')
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    buscarPeriodosAcerto().then((lista) => {
      setPeriodos(lista)
      if (lista.length > 0) setPeriodoFiltro(lista[0].fim)
      else setLoading(false)
    })
  }, [])

  useEffect(() => {
    // import_jogadores já passa de 10 mil linhas no total — buscar sem
    // filtro (como essa tela fazia antes) esbarra no limite de 1000 linhas
    // que o Supabase devolve de uma vez, numa ordem arbitrária (achado pelo
    // Cássio: "não tá trazendo os agentes", resultado "muito estranho" com
    // filtro de data — o período escolhido podia nem estar nessas 1000).
    // Busca só os imports do período selecionado primeiro, filtra por
    // import_id — nunca mais que uma semana de cada vez.
    if (!periodoFiltro) return
    setLoading(true)
    supabase.from('imports').select('id').eq('period_end', periodoFiltro).then(({ data: importsData }) => {
      const importIds = (importsData ?? []).map((i) => i.id as string)
      if (importIds.length === 0) { setRows([]); setRakebackPorAgenteClube(new Map()); setLoading(false); return }
      Promise.all([
        supabase
          .from('import_jogadores')
          .select('jogador_id, clube_id, agente_id, rake_total, player_result, jogadores(nome), clubs(name), agentes(nome)')
          .in('import_id', importIds),
        supabase.from('acertos_agentes').select('agente_id, clube_id, rakeback_pct').in('import_id', importIds),
      ]).then(([{ data }, { data: rbData }]) => {
        setRows((data ?? []) as unknown as ImportJogadorRow[])
        const mapa = new Map<string, number>()
        for (const r of (rbData ?? []) as { agente_id: string; clube_id: string | null; rakeback_pct: number }[]) {
          mapa.set(`${r.agente_id}:${r.clube_id ?? 'sem_clube'}`, r.rakeback_pct)
        }
        setRakebackPorAgenteClube(mapa)
        setLoading(false)
      })
    })
  }, [periodoFiltro])

  const clubesDisponiveis = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.clubs?.name) set.add(r.clubs.name)
    return [...set].sort()
  }, [rows])

  const agentesDisponiveis = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.agentes?.nome) set.add(r.agentes.nome)
    return [...set].sort()
  }, [rows])

  const filtradas = useMemo(() => {
    return rows.filter((r) => {
      if (busca && !(r.jogadores?.nome ?? '').toLowerCase().includes(busca.toLowerCase())) return false
      if (clubeFiltro && r.clubs?.name !== clubeFiltro) return false
      if (agenteFiltro && r.agentes?.nome !== agenteFiltro) return false
      return true
    })
  }, [rows, busca, clubeFiltro, agenteFiltro])

  const porJogador = useMemo(() => {
    const mapa = new Map<string, JogadorAgregado>()
    for (const r of filtradas) {
      const jg = mapa.get(r.jogador_id) ?? { jogador_id: r.jogador_id, jogador_nome: r.jogadores?.nome ?? t('jogadores_acertos_view.sem_nome'), clubes: new Set<string>(), agentes: new Set<string>(), rake_total: 0, player_result: 0, rakeback_pct: null, valor_rakeback: 0 }
      jg.rake_total += r.rake_total ?? 0
      jg.player_result += r.player_result ?? 0
      if (r.clubs?.name) jg.clubes.add(r.clubs.name)
      if (r.agentes?.nome) jg.agentes.add(r.agentes.nome)
      // RB do jogador = % do Agente dele (mesmo clube/import) sobre o Rake
      // DELE — não é o rateio do Agente inteiro. Jogador sem Agente com %RB
      // configurado fica sem RB (pedido do Cássio: "só aparecer se tiver").
      if (r.agente_id) {
        const pct = rakebackPorAgenteClube.get(`${r.agente_id}:${r.clube_id ?? 'sem_clube'}`)
        if (pct) {
          jg.rakeback_pct = pct
          jg.valor_rakeback += (r.rake_total ?? 0) * (pct / 100)
        }
      }
      mapa.set(r.jogador_id, jg)
    }
    return [...mapa.values()].sort((a, b) => b.rake_total - a.rake_total)
  }, [filtradas, rakebackPorAgenteClube, t])

  useEffect(() => { setPagina(1) }, [periodoFiltro, busca, clubeFiltro, agenteFiltro])

  const totalPaginas = Math.max(1, Math.ceil(porJogador.length / PAGE_SIZE))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = porJogador.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE)
  const rakeTotalGeral = porJogador.reduce((s, j) => s + j.rake_total, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('acertos_menu.aba_jogadores')}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t('jogadores_acertos_view.buscar_jogador_placeholder')}
            className="w-full bg-surface border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
          />
        </div>
        {clubesDisponiveis.length > 0 && (
          <select value={clubeFiltro} onChange={(e) => setClubeFiltro(e.target.value)} className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50">
            <option value="">{t('jogadores_acertos_view.todos_clubes')}</option>
            {clubesDisponiveis.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {agentesDisponiveis.length > 0 && (
          <select value={agenteFiltro} onChange={(e) => setAgenteFiltro(e.target.value)} className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50">
            <option value="">{t('jogadores_acertos_view.todos_agentes')}</option>
            {agentesDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {periodos.length > 0 && (
          <select value={periodoFiltro} onChange={(e) => setPeriodoFiltro(e.target.value)} className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50">
            {periodos.map((p) => <option key={p.fim} value={p.fim}>{t('acertos.semana')}: {formatPeriodo(p)}</option>)}
          </select>
        )}
        <div className="px-5 py-2.5 rounded-lg border border-white/10 bg-surface">
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-0.5">{t('jogadores_acertos_view.rake_total_label')}</p>
          <p className="text-lg font-semibold text-gold">{fmt(rakeTotalGeral)}</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/10 p-6 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
      ) : porJogador.length === 0 ? (
        <div className="rounded-xl border border-white/10 p-8 text-center">
          <p className="text-gray-500 text-sm">{t('jogadores_acertos_view.nenhum_jogador_desc')}</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-surface2">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('jogadores_acertos_view.col_jogador')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('jogadores_acertos_view.col_clube')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('jogadores_acertos_view.col_agente')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('jogadores_acertos_view.col_rake')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('jogadores_acertos_view.col_ganhos')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('jogadores_acertos_view.col_pct_rb')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('jogadores_acertos_view.col_rb')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((j) => (
                    <tr key={j.jogador_id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-3 text-gold">{j.jogador_nome}</td>
                      <td className="px-4 py-3 text-gray-300">{[...j.clubes].join(', ') || '—'}</td>
                      <td className="px-4 py-3 text-gray-300">{[...j.agentes].join(', ') || '—'}</td>
                      <td className="px-4 py-3 text-right text-white">{fmt(j.rake_total)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${j.player_result >= 0 ? 'text-success' : 'text-alert'}`}>{fmt(j.player_result)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{j.rakeback_pct != null ? `${fmt(j.rakeback_pct)}%` : '—'}</td>
                      <td className="px-4 py-3 text-right text-success">{j.rakeback_pct != null ? fmt(j.valor_rakeback) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaAtual <= 1}
              className="px-3.5 py-1.5 border border-white/10 rounded-lg text-xs text-gray-300 hover:border-gold/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('jogadores_acertos_view.pagina_anterior')}
            </button>
            <span className="text-xs text-gray-500">{t('jogadores_acertos_view.pagina_contador', { atual: paginaAtual, total: totalPaginas })}</span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaAtual >= totalPaginas}
              className="px-3.5 py-1.5 border border-white/10 rounded-lg text-xs text-gray-300 hover:border-gold/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('jogadores_acertos_view.proxima_pagina')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

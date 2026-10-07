'use client'
import { useState, useEffect, useMemo } from 'react'
import { Search, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { buscarPeriodosAcerto, type PeriodoAcerto } from '@/lib/relatorio-resumo-acertos'

interface AcertoAgenteRow {
  id: string
  agente_id: string
  agente_nome: string
  clube_id: string | null
  clube_nome: string | null
  rake_total: number
  player_result: number
  rakeback_pct: number
  valor_rakeback: number
  imports: { period_start: string | null; period_end: string | null } | null
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatPeriodo(p: PeriodoAcerto): string {
  const fmtD = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${fmtD(p.inicio)} → ${fmtD(p.fim)}`
}

// `modo` separa Super Agente de Agente comum, mesma definição já usada em
// app/admin/cadastro/super-agentes/page.tsx: "Super Agente = agente que
// aparece como superagente_id de pelo menos um outro" — não é um jeito
// diferente de calcular rakeback (acertos_agentes já trata Superagente
// igual Agente normal, com repasse do rake dos agentes abaixo somado na
// própria linha dele, ver processarAcertosAgentes), só filtra quem entra
// em qual sub-menu (pedido do Cássio: Sub Menus separados pra Super
// Agentes, Agentes e Jogadores dentro de Acertos).
export function AgentesAcertosView({ agenteIdFixo, modo }: { agenteIdFixo?: string; modo?: 'super_agentes' | 'agentes' } = {}) {
  const { t } = useI18n()
  const [rows, setRows] = useState<AcertoAgenteRow[]>([])
  const [superagenteIds, setSuperagenteIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [periodos, setPeriodos] = useState<PeriodoAcerto[]>([])
  const [periodoFiltro, setPeriodoFiltro] = useState('')
  // Extrato do próprio Agente (agenteIdFixo) continua com range de data livre
  // — escopo já é só um agente (nunca esbarra no limite de 1000 linhas do
  // Supabase que afeta a tela cheia de Admin, ver efeito abaixo).
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [busca, setBusca] = useState('')
  // Lista de Clubes pro filtro vem do cadastro inteiro, não das linhas já
  // carregadas do período — achado pelo Cássio ("faltou filtro de CLUBE SA
  // AGENTE" na tela de Jogadores, mesmo padrão aqui): num período sem
  // nenhum acerto de Agente, as opções do filtro (antes derivadas só das
  // linhas do próprio período) ficavam vazias e o select sumia da tela.
  const [clubesCadastro, setClubesCadastro] = useState<{ id: string; name: string }[]>([])
  const [clubeFiltro, setClubeFiltro] = useState('')
  const [expandido, setExpandido] = useState<Set<string>>(new Set(agenteIdFixo ? [agenteIdFixo] : []))

  useEffect(() => {
    supabase.from('clubs').select('id, name').order('name').then(({ data }) => setClubesCadastro((data ?? []) as { id: string; name: string }[]))
  }, [])

  useEffect(() => {
    if (agenteIdFixo) return
    buscarPeriodosAcerto().then((lista) => {
      setPeriodos(lista)
      if (lista.length > 0) setPeriodoFiltro(lista[0].fim)
      else setLoading(false)
    })
  }, [agenteIdFixo])

  useEffect(() => {
    if (agenteIdFixo) {
      setLoading(true)
      supabase
        .from('acertos_agentes')
        .select('id, agente_id, agente_nome, clube_id, clube_nome, rake_total, player_result, rakeback_pct, valor_rakeback, imports(period_start, period_end)')
        .eq('agente_id', agenteIdFixo)
        .then(({ data }) => { setRows((data ?? []) as unknown as AcertoAgenteRow[]); setLoading(false) })
      return
    }
    // Tela cheia de Admin: import_jogadores/acertos_agentes já passam de
    // 1000 linhas no total (achado pelo Cássio: "não tá trazendo os
    // agentes", resultado "muito estranho" com filtro de data) — o Supabase
    // só devolve as primeiras 1000 de uma busca sem filtro, numa ordem
    // arbitrária, então um período específico podia nem aparecer nelas.
    // Busca só os imports do período selecionado primeiro, filtra
    // acertos_agentes por import_id — nunca mais que uma semana de cada vez.
    if (!periodoFiltro) return
    setLoading(true)
    supabase.from('imports').select('id').eq('period_end', periodoFiltro).then(({ data: importsData }) => {
      const importIds = (importsData ?? []).map((i) => i.id as string)
      if (importIds.length === 0) { setRows([]); setSuperagenteIds(new Set()); setLoading(false); return }
      Promise.all([
        supabase
          .from('acertos_agentes')
          .select('id, agente_id, agente_nome, clube_id, clube_nome, rake_total, player_result, rakeback_pct, valor_rakeback, imports(period_start, period_end)')
          .in('import_id', importIds)
          .order('agente_nome'),
        modo ? supabase.from('agentes').select('superagente_id').not('superagente_id', 'is', null) : Promise.resolve({ data: [] }),
      ]).then(([{ data }, { data: superIds }]) => {
        setRows((data ?? []) as unknown as AcertoAgenteRow[])
        setSuperagenteIds(new Set((superIds ?? []).map((s) => s.superagente_id as string)))
        setLoading(false)
      })
    })
  }, [agenteIdFixo, periodoFiltro, modo])

  const filtradas = useMemo(() => {
    return rows.filter((r) => {
      if (modo === 'super_agentes' && !superagenteIds.has(r.agente_id)) return false
      if (modo === 'agentes' && superagenteIds.has(r.agente_id)) return false
      if (agenteIdFixo) {
        const p = r.imports?.period_start
        if (dataInicio && (!p || p < dataInicio)) return false
        if (dataFim && (!p || p > dataFim)) return false
      }
      if (busca && !r.agente_nome.toLowerCase().includes(busca.toLowerCase())) return false
      if (clubeFiltro && r.clube_id !== clubeFiltro) return false
      return true
    })
  }, [rows, modo, superagenteIds, agenteIdFixo, dataInicio, dataFim, busca, clubeFiltro])

  const porAgente = useMemo(() => {
    const mapa = new Map<string, {
      agente_id: string; agente_nome: string; rake_total: number; player_result: number; valor_rakeback: number
      clubes: Map<string, { clube_nome: string; rake_total: number; player_result: number; rakeback_pct: number; valor_rakeback: number }>
    }>()
    for (const r of filtradas) {
      const ag = mapa.get(r.agente_id) ?? { agente_id: r.agente_id, agente_nome: r.agente_nome, rake_total: 0, player_result: 0, valor_rakeback: 0, clubes: new Map() }
      ag.rake_total += r.rake_total
      ag.player_result += r.player_result
      ag.valor_rakeback += r.valor_rakeback
      const chaveClube = r.clube_id ?? 'sem_clube'
      const cl = ag.clubes.get(chaveClube) ?? { clube_nome: r.clube_nome ?? t('agentes_acertos_view.sem_clube'), rake_total: 0, player_result: 0, rakeback_pct: r.rakeback_pct, valor_rakeback: 0 }
      cl.rake_total += r.rake_total
      cl.player_result += r.player_result
      cl.valor_rakeback += r.valor_rakeback
      ag.clubes.set(chaveClube, cl)
      mapa.set(r.agente_id, ag)
    }
    return [...mapa.values()].sort((a, b) => b.valor_rakeback - a.valor_rakeback)
  }, [filtradas, t])

  const totalGeral = porAgente.reduce((s, a) => s + a.valor_rakeback, 0)

  function toggle(id: string) {
    setExpandido((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      {!agenteIdFixo && (
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {t(modo === 'super_agentes' ? 'acertos_menu.aba_super_agentes' : 'acertos_menu.aba_agentes')}
          </h1>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!agenteIdFixo && (
          <div className="relative max-w-xs flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t('agentes_acertos_view.buscar_agente_placeholder')}
              className="w-full bg-surface border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
            />
          </div>
        )}
        {!agenteIdFixo && clubesCadastro.length > 0 && (
          <select
            value={clubeFiltro}
            onChange={(e) => setClubeFiltro(e.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
          >
            <option value="">{t('agentes_acertos_view.todos_clubes')}</option>
            {clubesCadastro.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {agenteIdFixo ? (
          <>
            <input type="date" aria-label={t('agentes_acertos_view.de_label')} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50" />
            <input type="date" aria-label={t('agentes_acertos_view.ate_label')} value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50" />
          </>
        ) : periodos.length > 0 && (
          <select
            value={periodoFiltro}
            onChange={(e) => setPeriodoFiltro(e.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
          >
            {periodos.map((p) => <option key={p.fim} value={p.fim}>{t('acertos.semana')}: {formatPeriodo(p)}</option>)}
          </select>
        )}
        <div className="px-5 py-2.5 rounded-lg border border-white/10 bg-surface">
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-0.5">{t('agentes_acertos_view.total_rakeback_label')}</p>
          <p className="text-lg font-semibold text-gold">{fmt(totalGeral)}</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/10 p-6 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
      ) : porAgente.length === 0 ? (
        <div className="rounded-xl border border-white/10 p-8 text-center">
          <p className="text-gray-500 text-sm">{t('agentes_acertos_view.nenhum_acerto_desc')}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
          {porAgente.map((a) => {
            const aberto = expandido.has(a.agente_id)
            return (
              <div key={a.agente_id}>
                <button
                  type="button"
                  onClick={() => toggle(a.agente_id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {aberto ? <ChevronUp size={14} className="text-gray-500 shrink-0" /> : <ChevronDown size={14} className="text-gray-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-gold text-sm truncate">{a.agente_nome}</p>
                      <p className="text-gray-500 text-xs mt-0.5">
                        {t(a.clubes.size === 1 ? 'agentes_acertos_view.clubes_count_singular' : 'agentes_acertos_view.clubes_count_plural', { n: a.clubes.size })}
                        {' · '}{t('agentes_acertos_view.col_rake')} {fmt(a.rake_total)}
                        {' · '}{t('agentes_acertos_view.col_ganhos')} {fmt(a.player_result)}
                      </p>
                    </div>
                  </div>
                  <p className="text-success text-base font-semibold shrink-0">{fmt(a.valor_rakeback)}</p>
                </button>
                {aberto && (
                  <div className="overflow-x-auto bg-surface2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                          <th className="text-left pl-10 py-2 font-medium">{t('agentes_acertos_view.col_clube')}</th>
                          <th className="text-right py-2 font-medium">{t('agentes_acertos_view.col_rake')}</th>
                          <th className="text-right py-2 font-medium">{t('agentes_acertos_view.col_ganhos')}</th>
                          <th className="text-right py-2 font-medium">{t('agentes_acertos_view.col_pct_rb')}</th>
                          <th className="text-right py-2 pr-4 font-medium">{t('agentes_acertos_view.col_rb')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...a.clubes.values()].map((c) => (
                          <tr key={c.clube_nome} className="border-t border-white/5">
                            <td className="pl-10 py-2 text-gray-300">{c.clube_nome}</td>
                            <td className="text-right py-2 text-white">{fmt(c.rake_total)}</td>
                            <td className={`text-right py-2 ${c.player_result >= 0 ? 'text-success' : 'text-alert'}`}>{fmt(c.player_result)}</td>
                            <td className="text-right py-2 text-gray-500">{fmt(c.rakeback_pct)}%</td>
                            <td className="text-right py-2 pr-4 text-success">{fmt(c.valor_rakeback)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

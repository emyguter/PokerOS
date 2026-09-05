import { supabase } from './supabase'
import { buscarSecurityEDividasPorClube, calcularTotalAcerto } from './relatorio-acerto'
import { buscarPendenciasAntecipacao } from './acertos-engine'
import type { AcertoCard } from '@/components/acertos/ClubAcertoCard'

export interface LinhaMeuAcerto {
  acerto: AcertoCard
  importId: string
  ligaId: string | null
  ligaNome: string
  valorFinal: number
  periodStart: string
  periodEnd: string
}

interface AcertoRow extends AcertoCard {
  import_id: string
  imports: { period_start: string | null; period_end: string } | null
  clubs: { league_id: string | null; leagues: { name: string } | null } | null
}

// Mesma fonte de verdade do Valor do Acerto (calcularTotalAcerto, ver
// lib/relatorio-acerto.ts) — usada pelo novo menu "Acertos" (clube, liga,
// valor, clique abre o card com o layout configurado do clube). Escopo dado
// por `clubeIdsVisiveis` (ver lib/acesso-hierarquia.ts): null = sem
// restrição (staff), [] ou uma lista = só esses clubes.
export async function buscarMeusAcertos(periodoFim: string, clubeIdsVisiveis: string[] | null): Promise<LinhaMeuAcerto[]> {
  if (clubeIdsVisiveis && clubeIdsVisiveis.length === 0) return []

  const { data: imports } = await supabase.from('imports').select('id').eq('period_end', periodoFim)
  const importIds = (imports ?? []).map((i) => i.id as string)
  if (importIds.length === 0) return []

  let query = supabase
    .from('acertos')
    .select('id, club_id, club_name, club_external_id, settlement_type, valor_acerto, rake_mtt, rake_cash, rake_total, player_result, fee_calculado, fee_mtt_valor, fee_cash_valor, fee_operacional_valor, fee_spinup_valor, taxa_liga_valor, taxa_cash_pct_aplicada, rebate_calculado, bilhetes, indicacao_valor, import_id, imports(period_start, period_end), clubs(league_id, leagues(name))')
    .in('import_id', importIds)
  if (clubeIdsVisiveis) query = query.in('club_id', clubeIdsVisiveis)
  const { data, error } = await query
  if (error) throw error
  const linhasBase = (data ?? []) as unknown as AcertoRow[]
  if (linhasBase.length === 0) return []

  const clubIds = [...new Set(linhasBase.map((a) => a.club_id).filter((id): id is string => !!id))]
  const rakeTotalPorClube = new Map(linhasBase.filter((a) => a.club_id).map((a) => [a.club_id as string, a.rake_total]))
  // Pendências/Antecipação ao vivo, não a foto gravada em
  // acertos.pendencias_antecipacao — mesmo ajuste feito no AcertosView/
  // ClubAcertoCard/Controle de Pagamentos (achado pelo Cássio no caso
  // AMORIM PLUS). Agrupa por período (period_start/period_end) porque
  // imports de Ligas diferentes com o mesmo period_end podem, em teoria,
  // ter period_start diferente.
  const gruposPorPeriodo = new Map<string, { periodStart: string; periodEnd: string; clubIds: string[] }>()
  for (const a of linhasBase) {
    if (!a.club_id) continue
    const periodStart = a.imports?.period_start ?? periodoFim
    const periodEnd = a.imports?.period_end ?? periodoFim
    const chave = `${periodStart}|${periodEnd}`
    const grupo = gruposPorPeriodo.get(chave) ?? { periodStart, periodEnd, clubIds: [] }
    grupo.clubIds.push(a.club_id)
    gruposPorPeriodo.set(chave, grupo)
  }
  const [extrasPorClube, { data: lancData }, ...mapasPendencias] = await Promise.all([
    buscarSecurityEDividasPorClube(clubIds, periodoFim, rakeTotalPorClube),
    supabase
      .from('lancamentos')
      .select('clube_id, natureza, valor')
      .in('clube_id', clubIds)
      .in('origem', ['suporte', 'seguranca'])
      .neq('tipo', 'caucao')
      .neq('tipo', 'antecipacao')
      // Pagamento já quita o Acerto certo pelo acerto_id vinculado (ver
      // agregarPagamentos em lib/pagamentos.ts) — contar aqui de novo dobra
      // o valor (mesmo ajuste feito no AcertosView/ClubAcertoCard).
      .neq('tipo', 'pagamento')
      .lte('data_lancamento', periodoFim),
    ...[...gruposPorPeriodo.values()].map((g) => buscarPendenciasAntecipacao(g.clubIds, g.periodStart, g.periodEnd)),
  ])
  const lancPorClube = new Map<string, number>()
  for (const l of (lancData ?? []) as { clube_id: string; natureza: string; valor: number }[]) {
    lancPorClube.set(l.clube_id, (lancPorClube.get(l.clube_id) ?? 0) + (l.natureza === 'credito' ? l.valor : -l.valor))
  }
  const pendenciasPorClube = new Map<string, number>()
  for (const mapa of mapasPendencias) for (const [id, v] of mapa) pendenciasPorClube.set(id, v)

  return linhasBase
    .map((a) => {
      const extras = a.club_id ? extrasPorClube.get(a.club_id) : undefined
      const valorFinal = calcularTotalAcerto(a.valor_acerto, {
        bilhetes: a.bilhetes,
        pendenciasAntecipacao: a.club_id ? pendenciasPorClube.get(a.club_id) ?? 0 : 0,
        security: extras?.security ?? 0,
        indicacaoValor: a.indicacao_valor,
        lancamentosLiquido: a.club_id ? lancPorClube.get(a.club_id) ?? 0 : 0,
        dividasTotal: extras?.dividasTotal ?? 0,
      })
      return {
        acerto: a,
        importId: a.import_id,
        ligaId: a.clubs?.league_id ?? null,
        ligaNome: a.clubs?.leagues?.name ?? '—',
        valorFinal,
        periodStart: a.imports?.period_start ?? periodoFim,
        periodEnd: a.imports?.period_end ?? periodoFim,
      }
    })
    .sort((a, b) => a.acerto.club_name.localeCompare(b.acerto.club_name))
}

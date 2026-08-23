import { supabase } from './supabase'
import { buscarSecurityEDividasPorClube } from './relatorio-acerto'
import { getMultaAplicadaDoClube } from './dividas'

export interface LinhaResumoAcerto {
  clubId: string
  clubExternalId: string
  clubName: string
  projeto: string | null
  ligaNome: string | null
  settlementType: string
  rakeTotal: number
  // Fee cobrado do clube — negativo, mesma convenção de sinal do resto do
  // app (ver feeDisplay em AcertosView).
  unionFee: number
  // % efetivo = |unionFee| / rakeTotal — reconstituído a partir do valor já
  // calculado, não de um % fixo salvo (taxa_dinamica mistura MTT/Cash/
  // Operacional/SpinUp com % possivelmente diferentes entre si; isso aqui é
  // a média ponderada resultante, não um dos percentuais individuais).
  pctUnion: number
  operacional: number
  winnings: number
  tickets: number
  security: number
  extras: number
  fines: number
  spinupPnl: number
  referral: number
}

export interface PeriodoAcerto { inicio: string; fim: string }

// Mesmas semanas já importadas (imports.period_end), pra escolher qual
// Acerto ver — igual ao filtro de Período do Relatório de Stoploss.
export async function buscarPeriodosAcerto(): Promise<PeriodoAcerto[]> {
  const { data } = await supabase
    .from('imports')
    .select('period_start, period_end')
    .not('period_end', 'is', null)
    .order('period_end', { ascending: false })
  const vistos = new Set<string>()
  const lista: PeriodoAcerto[] = []
  for (const row of (data ?? []) as { period_start: string | null; period_end: string }[]) {
    if (vistos.has(row.period_end)) continue
    vistos.add(row.period_end)
    lista.push({ fim: row.period_end, inicio: row.period_start ?? row.period_end })
  }
  return lista
}

interface AcertoRow {
  club_id: string | null
  club_name: string
  club_external_id: string
  settlement_type: string
  rake_total: number
  fee_calculado: number
  fee_operacional_valor: number
  fee_spinup_valor: number
  player_result: number
  bilhetes: number
  indicacao_valor: number
  clubs: {
    projeto: string | null
    leagues: {
      name: string
      projeto: string | null
      super_leagues: { projeto: string | null; mega_ligas: { projeto: string | null } | null } | null
    } | null
  } | null
}

// Visão executiva "1 linha por clube" pra uma semana inteira, cruzando
// todas as Ligas de uma vez — pedido a partir de uma planilha de referência
// do Cássio (o "Settlement Summary" que ele montava manualmente toda
// semana, cruzando várias abas). Junta tudo que já compõe o Valor do
// Acerto em qualquer outra tela (Acertos, ClubAcertoCard, Controle de
// Pagamentos) — mesma fonte de verdade, só que lado a lado pra todo mundo.
// Um clube em mais de 1 import na mesma semana (raro, geralmente engano)
// soma os dois em vez de sumir um.
export async function buscarResumoAcertos(periodoFim: string): Promise<LinhaResumoAcerto[]> {
  const { data: imports } = await supabase.from('imports').select('id').eq('period_end', periodoFim)
  const importIds = (imports ?? []).map((i) => i.id as string)
  if (importIds.length === 0) return []

  const { data: acertosData, error } = await supabase
    .from('acertos')
    .select('club_id, club_name, club_external_id, settlement_type, rake_total, fee_calculado, fee_operacional_valor, fee_spinup_valor, player_result, bilhetes, indicacao_valor, clubs(projeto, leagues(name, projeto, super_leagues(projeto, mega_ligas(projeto))))')
    .in('import_id', importIds)
  if (error) throw error
  const linhasBase = (acertosData ?? []) as unknown as AcertoRow[]
  if (linhasBase.length === 0) return []

  const clubIds = [...new Set(linhasBase.map((a) => a.club_id).filter((id): id is string => !!id))]
  const [extrasPorClube, multaPares] = await Promise.all([
    buscarSecurityEDividasPorClube(clubIds, periodoFim),
    Promise.all(clubIds.map(async (id) => [id, await getMultaAplicadaDoClube(id, periodoFim)] as const)),
  ])
  const multaPorClube = new Map(multaPares)

  // Extras (bônus/promoção/outro) lançados na tela de Lançamento — mesma
  // exclusão de Caução/Antecipação que AcertosView usa (Antecipação já
  // entra separado, Caução não é rake semanal).
  const { data: lancData } = await supabase
    .from('lancamentos')
    .select('clube_id, natureza, valor')
    .in('clube_id', clubIds)
    .in('origem', ['suporte', 'seguranca'])
    .neq('tipo', 'caucao')
    .neq('tipo', 'antecipacao')
    .lte('data_lancamento', periodoFim)
  const extrasLancPorClube = new Map<string, number>()
  for (const l of (lancData ?? []) as { clube_id: string; natureza: string; valor: number }[]) {
    extrasLancPorClube.set(l.clube_id, (extrasLancPorClube.get(l.clube_id) ?? 0) + (l.natureza === 'credito' ? l.valor : -l.valor))
  }

  const porClube = new Map<string, LinhaResumoAcerto>()
  for (const a of linhasBase) {
    const clubId = a.club_id
    const key = clubId ?? a.club_external_id
    const existente = porClube.get(key)
    const rakeTotal = (existente?.rakeTotal ?? 0) + (a.rake_total ?? 0)
    const unionFee = (existente?.unionFee ?? 0) - Math.abs(a.fee_calculado ?? 0)
    const projeto = a.clubs?.projeto
      ?? a.clubs?.leagues?.projeto
      ?? a.clubs?.leagues?.super_leagues?.projeto
      ?? a.clubs?.leagues?.super_leagues?.mega_ligas?.projeto
      ?? null
    porClube.set(key, {
      clubId: clubId ?? '',
      clubExternalId: a.club_external_id,
      clubName: a.club_name,
      projeto,
      ligaNome: a.clubs?.leagues?.name ?? null,
      settlementType: a.settlement_type,
      rakeTotal,
      unionFee,
      pctUnion: rakeTotal > 0 ? (Math.abs(unionFee) / rakeTotal) * 100 : 0,
      operacional: (existente?.operacional ?? 0) + (a.fee_operacional_valor ?? 0),
      winnings: (existente?.winnings ?? 0) + (a.player_result ?? 0),
      tickets: (existente?.tickets ?? 0) + (a.bilhetes ?? 0),
      security: clubId ? extrasPorClube.get(clubId)?.security ?? 0 : 0,
      extras: clubId ? extrasLancPorClube.get(clubId) ?? 0 : 0,
      fines: clubId ? multaPorClube.get(clubId) ?? 0 : 0,
      spinupPnl: (existente?.spinupPnl ?? 0) + (a.fee_spinup_valor ?? 0),
      referral: (existente?.referral ?? 0) + (a.indicacao_valor ?? 0),
    })
  }

  return [...porClube.values()].sort((a, b) => a.clubName.localeCompare(b.clubName))
}

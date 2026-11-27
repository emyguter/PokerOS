import { supabase } from './supabase'
import { buscarSecurityEDividasPorClube, calcularTotalAcerto } from './relatorio-acerto'
import { buscarPendenciasEAntecipacaoAoVivo, buscarRakebackAgentesPorClube, buscarAcertoComoAgente } from './acertos-engine'
import type { AcertoCard } from '@/components/acertos/ClubAcertoCard'

export interface LinhaMeuAcerto {
  acerto: AcertoCard
  importId: string
  ligaId: string | null
  ligaNome: string
  valorFinal: number
  periodStart: string
  periodEnd: string
  // true = clube sem Acerto de clube nessa semana (import "só-Geral" tipo
  // Superagente/Agente/Jogador, ver parsePPPoker — não gera linha em
  // `acertos` de propósito, só alimenta o rateio de Agentes). Synthetic
  // entry montada em lib/arvore-acertos.ts (buscarClubesSoRateio), não vem
  // daqui — default undefined = Acerto de clube de verdade.
  semAcerto?: boolean
  // true = clube ativo da Liga sem NENHUM movimento nessa semana (nem
  // Acerto, nem rateio de Agentes) — synthetic entry montada em
  // lib/arvore-acertos.ts (buscarClubesZerados). `valorFinal` ainda reflete
  // Pendências/Antecipação/Dívidas/Multa de verdade (pedido do Cássio: um
  // clube sem movimento não pode "esconder" o que ele já deve ou tem a
  // receber) — só o Rake/Ganhos/Fee é que ficam zerados.
  zerado?: boolean
  // Quebra de valorFinal pro card "zerado" mostrar cada parte separada
  // (igual o ClubAcertoCard já faz pro Acerto normal) — antes só aparecia o
  // Total junto, sem dar pra ver quanto vinha de Pendências/Antecipação vs
  // Multa vs Segurança/Dívidas (achado pelo Cássio, comparando o Total ao
  // vivo com a planilha de referência dele: "que nao tem tipo o card
  // explicando como ta chegando nesse valor"). Só preenchido quando
  // zerado=true.
  detalheZerado?: {
    pendenciasAntecipacao: number
    multa: { valor: number; pct: number } | null
    security: number
    dividasTotal: number
  }
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
    .select('id, club_id, club_name, club_external_id, settlement_type, valor_acerto, rake_mtt, rake_cash, rake_total, player_result, fee_calculado, fee_mtt_valor, fee_cash_valor, fee_operacional_valor, fee_spinup_valor, taxa_liga_valor, taxa_cash_pct_aplicada, fee_mtt_pct_aplicado, rebate_calculado, bilhetes, indicacao_valor, cotacao, dividas_valor, import_id, imports(period_start, period_end), clubs(league_id, leagues(name))')
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
  // AMORIM PLUS). Agrupa por import_id (não por data) porque clubes na
  // mesma `linhasBase` podem vir de imports diferentes mesmo com o mesmo
  // period_end (duplicidade histórica de imports).
  const gruposPorImport = new Map<string, { periodStart: string; periodEnd: string; clubIds: string[] }>()
  for (const a of linhasBase) {
    if (!a.club_id) continue
    const periodStart = a.imports?.period_start ?? periodoFim
    const periodEnd = a.imports?.period_end ?? periodoFim
    const grupo = gruposPorImport.get(a.import_id) ?? { periodStart, periodEnd, clubIds: [] }
    grupo.clubIds.push(a.club_id)
    gruposPorImport.set(a.import_id, grupo)
  }
  // period_start de cada clube (pelo import a que o Acerto dele pertence) —
  // usado abaixo pra filtrar os Lançamentos do período na mão, cliente a
  // cliente, já que a query é em lote (todos os clubIds de uma vez, cada um
  // podendo ter uma semana diferente).
  const periodStartPorClube = new Map<string, string>()
  for (const a of linhasBase) {
    if (a.club_id) periodStartPorClube.set(a.club_id, a.imports?.period_start ?? periodoFim)
  }

  const [extrasPorClube, rakebackAgentesPorChave, { data: lancData }, { data: clubesVinculoData }, { data: membrosData }, ...mapasPendencias] = await Promise.all([
    buscarSecurityEDividasPorClube(clubIds, periodoFim, rakeTotalPorClube),
    buscarRakebackAgentesPorClube(linhasBase.filter((a) => a.club_id).map((a) => ({ clubeId: a.club_id as string, importId: a.import_id }))),
    supabase
      .from('lancamentos')
      .select('clube_id, natureza, valor, data_lancamento')
      .in('clube_id', clubIds)
      .in('origem', ['suporte', 'seguranca'])
      .neq('tipo', 'caucao')
      .neq('tipo', 'antecipacao')
      // Pagamento já quita o Acerto certo pelo acerto_id vinculado (ver
      // agregarPagamentos em lib/pagamentos.ts) — contar aqui de novo dobra
      // o valor (mesmo ajuste feito no AcertosView/ClubAcertoCard).
      .neq('tipo', 'pagamento')
      // Só conta no Acerto depois de Liberado (pedido do Cássio) — antes
      // disso é só um lançamento pendente na tela de Lançamento.
      .eq('liberado', true)
      .lte('data_lancamento', periodoFim),
    // Vínculo de Acerto (clube vinculado) e Agente vinculado de cada clube
    // dessa semana — ver comentário mais abaixo (achado no Club Particular:
    // "o valor total mostra somente o total do clube e não o total final,
    // tem q aparecer sempre o final").
    supabase.from('clubs').select('id, vinculo_acerto_grupo_id, agente_vinculado_id').in('id', clubIds),
    supabase.from('clubs').select('id, moeda_conversao, cotacao, vinculo_acerto_grupo_id').in('vinculo_acerto_grupo_id', clubIds),
    ...[...gruposPorImport.values()].map((g) => buscarPendenciasEAntecipacaoAoVivo(g.clubIds, g.periodStart, g.periodEnd)),
  ])
  const lancPorClube = new Map<string, number>()
  for (const l of (lancData ?? []) as { clube_id: string; natureza: string; valor: number; data_lancamento: string }[]) {
    // Faltava o limite de baixo (só tinha `.lte(periodoFim)` acima) — sem
    // isso, um Bônus/Promoção/Outro de uma semana anterior somava de novo
    // aqui pra sempre, em toda semana seguinte (achado no AMORIM PLUS: o
    // Total dessa tela batia diferente do ClubAcertoCard porque um VIP
    // Cashback de 10-16 continuava contando também em 17-23).
    const periodStart = periodStartPorClube.get(l.clube_id) ?? periodoFim
    if (l.data_lancamento < periodStart) continue
    lancPorClube.set(l.clube_id, (lancPorClube.get(l.clube_id) ?? 0) + (l.natureza === 'credito' ? l.valor : -l.valor))
  }
  const pendenciasPorClube = new Map<string, number>()
  for (const mapa of mapasPendencias) for (const [id, v] of mapa) pendenciasPorClube.set(id, v)

  const totalProprioPorClube = new Map<string, number>()
  for (const a of linhasBase) {
    if (!a.club_id || totalProprioPorClube.has(a.club_id)) continue
    const extras = extrasPorClube.get(a.club_id)
    totalProprioPorClube.set(a.club_id, calcularTotalAcerto(a.valor_acerto, {
      bilhetes: a.bilhetes,
      pendenciasAntecipacao: pendenciasPorClube.get(a.club_id) ?? 0,
      security: extras?.security ?? 0,
      indicacaoValor: a.indicacao_valor,
      lancamentosLiquido: lancPorClube.get(a.club_id) ?? 0,
      // Lido direto da coluna gravada (AcertoCard.dividas_valor), não de
      // `extras.dividasTotal` (ao vivo) — mesma troca de ClubAcertoCard/
      // valorAcertoCompletoPorRow: a essa altura o item já foi marcado
      // pago/quitado no momento do cálculo (ver marcarDividasQuitadas).
      dividasTotal: a.dividas_valor,
      rakebackAgentes: rakebackAgentesPorChave.get(`${a.club_id}:${a.import_id}`) ?? 0,
    }))
  }

  // Acerto por clube vinculado (grupo de moedas) — mesma regra do
  // ClubAcertoCard (e do mesmo fix feito em valorAcertoCompletoPorRow,
  // lib/pagamentos.ts): o Total do clube "líder" soma o próprio (cru, na
  // moeda nativa dele) + o de cada vinculado JÁ convertido pra essa moeda
  // (usando a cotação cadastrada em CADA vinculado, nunca a do líder — ela é
  // só pra linha pessoal "Total {moeda}" dele). Vinculado sem Acerto nessa
  // semana entra com total 0 (zero-fill), mesmo comportamento do card.
  const membrosPorLeader = new Map<string, { id: string; moeda_conversao: string | null; cotacao: number | null }[]>()
  for (const m of (membrosData ?? []) as { id: string; moeda_conversao: string | null; cotacao: number | null; vinculo_acerto_grupo_id: string }[]) {
    const lista = membrosPorLeader.get(m.vinculo_acerto_grupo_id) ?? []
    lista.push({ id: m.id, moeda_conversao: m.moeda_conversao, cotacao: m.cotacao })
    membrosPorLeader.set(m.vinculo_acerto_grupo_id, lista)
  }
  const grupoExtraPorClube = new Map<string, number>()
  for (const [leaderId, membros] of membrosPorLeader) {
    const extra = membros.reduce((s, m) => {
      const totalMembro = totalProprioPorClube.get(m.id) ?? 0
      return s + (m.moeda_conversao && m.cotacao ? totalMembro * m.cotacao : totalMembro)
    }, 0)
    grupoExtraPorClube.set(leaderId, Math.round(extra * 100) / 100)
  }

  // Acerto como Agente (clube que também é Agente/Super Agente vinculado em
  // outro Clube/Liga, ver clubs.agente_vinculado_id) — mesma soma do
  // ClubAcertoCard (`total + acertoComoAgente.total`), sempre fora do corpo
  // do Acerto em si.
  const agenteVinculadoPorClube = new Map(
    ((clubesVinculoData ?? []) as { id: string; vinculo_acerto_grupo_id: string | null; agente_vinculado_id: string | null }[])
      .filter((c) => c.agente_vinculado_id)
      .map((c) => [c.id, c.agente_vinculado_id as string])
  )
  const agenteIdsUnicos = [...new Set(agenteVinculadoPorClube.values())]
  const totalComoAgentePorAgenteId = new Map(
    await Promise.all(agenteIdsUnicos.map(async (agenteId) => [agenteId, (await buscarAcertoComoAgente(agenteId, periodoFim)).total] as const))
  )

  return linhasBase
    .map((a) => {
      const totalProprio = a.club_id ? totalProprioPorClube.get(a.club_id) ?? 0 : calcularTotalAcerto(a.valor_acerto, {
        bilhetes: a.bilhetes,
        pendenciasAntecipacao: 0,
        security: 0,
        indicacaoValor: a.indicacao_valor,
        lancamentosLiquido: 0,
        dividasTotal: a.dividas_valor,
        rakebackAgentes: 0,
      })
      const grupoExtra = a.club_id ? grupoExtraPorClube.get(a.club_id) ?? 0 : 0
      const agenteId = a.club_id ? agenteVinculadoPorClube.get(a.club_id) : undefined
      const agenteExtra = agenteId ? totalComoAgentePorAgenteId.get(agenteId) ?? 0 : 0
      const valorFinal = Math.round((totalProprio + grupoExtra + agenteExtra) * 100) / 100
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

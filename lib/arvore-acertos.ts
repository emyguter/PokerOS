import { supabase } from './supabase'
import { buscarMeusAcertos, type LinhaMeuAcerto } from './meus-acertos'

// ─── Árvore de Acertos: Liga → Clube → Super Agente → Agente → Jogador ────
// Cada nível reusa a mesma fonte de verdade dos outros lugares (Valor do
// Acerto vem de buscarMeusAcertos/calcularTotalAcerto — nunca recalculado
// aqui) — só agrupa/organiza pra navegação em árvore. Super Agente/Agente
// são Rakeback (acertos_agentes), não têm as mesmas linhas (Bilhetes, Fee,
// Dívidas...) do Acerto de Clube — não é um Acerto completo, é um cálculo
// mais simples que já existe hoje (ver AgentesAcertosView).

export interface LigaNode {
  id: string
  nome: string
  clubes: LinhaMeuAcerto[]
}

export interface ArvoreRaiz {
  ligas: LigaNode[]
  semLiga: LinhaMeuAcerto[]
}

// clubeIdsVisiveis: null = sem restrição (staff/admin); lista = escopo de
// resolverClubesVisiveis (login de Liga/Clube/SuperLiga/MegaLiga).
export async function buscarArvoreRaiz(periodoFim: string, clubeIdsVisiveis: string[] | null): Promise<ArvoreRaiz> {
  const linhas = await buscarMeusAcertos(periodoFim, clubeIdsVisiveis)
  const porLiga = new Map<string, LigaNode>()
  const semLiga: LinhaMeuAcerto[] = []
  for (const l of linhas) {
    if (!l.ligaId) { semLiga.push(l); continue }
    const node = porLiga.get(l.ligaId) ?? { id: l.ligaId, nome: l.ligaNome, clubes: [] }
    node.clubes.push(l)
    porLiga.set(l.ligaId, node)
  }
  return {
    ligas: [...porLiga.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
    semLiga: semLiga.sort((a, b) => a.acerto.club_name.localeCompare(b.acerto.club_name)),
  }
}

export interface ClubePendente {
  nome: string
  externalId: string
  ligaNome: string
  importId: string
}

// "Falta calcular" = já tem import harmonizado (linhas cruas gravadas) mas
// ainda sem Acerto pra esse clube nesse import — bate exatamente com o que
// o botão Calcular/Recalcular resolve. Calcular um pendente roda
// processarAcertos no import inteiro (todos os clubes juntos), então
// selecionar vários pendentes do MESMO arquivo só processa ele uma vez.
export async function buscarClubesPendentes(periodoFim: string, clubeIdsVisiveis: string[] | null): Promise<ClubePendente[]> {
  if (clubeIdsVisiveis && clubeIdsVisiveis.length === 0) return []

  const { data: imports } = await supabase.from('imports').select('id').eq('period_end', periodoFim).eq('harmonization_status', 'harmonizado')
  const importIds = (imports ?? []).map((i) => i.id as string)
  if (importIds.length === 0) return []

  const [{ data: rows }, { data: acertos }] = await Promise.all([
    supabase.from('import_rows').select('club_name, club_external_id, import_id').in('import_id', importIds),
    supabase.from('acertos').select('club_external_id, import_id').in('import_id', importIds),
  ])
  const jaCalculado = new Set((acertos ?? []).map((a) => `${a.import_id}|${a.club_external_id}`))

  let clubQuery = supabase.from('clubs').select('id, name, external_id, leagues(name)').eq('ativo', true)
  if (clubeIdsVisiveis) clubQuery = clubQuery.in('id', clubeIdsVisiveis)
  const { data: clubesCadastrados } = await clubQuery
  const porExtId = new Map(
    ((clubesCadastrados ?? []) as unknown as { id: string; name: string; external_id: string | null; leagues: { name: string } | null }[])
      .map((c) => [c.external_id, c])
  )

  const vistos = new Set<string>()
  const pendentes: ClubePendente[] = []
  for (const r of (rows ?? []) as { club_name: string; club_external_id: string; import_id: string }[]) {
    const chave = `${r.import_id}|${r.club_external_id}`
    if (jaCalculado.has(chave) || vistos.has(chave)) continue
    vistos.add(chave)
    const cadastrado = porExtId.get(r.club_external_id)
    if (clubeIdsVisiveis && !cadastrado) continue // fora do escopo visível
    pendentes.push({
      nome: cadastrado?.name ?? r.club_name,
      externalId: r.club_external_id,
      ligaNome: cadastrado?.leagues?.name ?? '—',
      importId: r.import_id,
    })
  }
  return pendentes.sort((a, b) => a.nome.localeCompare(b.nome))
}

// Acha o import da semana ao qual o Acerto de um clube pertence — usado pra
// "Recalcular" reprocessar o arquivo inteiro (todos os clubes desse
// import), não só esse clube isolado (mesmo comportamento de sempre,
// processarAcertos já roda em cima do import inteiro).
export async function acharImportIdDoClube(clubeId: string, periodoFim: string): Promise<string | null> {
  const { data: imports } = await supabase.from('imports').select('id').eq('period_end', periodoFim)
  const importIds = (imports ?? []).map((i) => i.id as string)
  if (importIds.length === 0) return null
  const { data } = await supabase
    .from('acertos')
    .select('import_id')
    .eq('club_id', clubeId)
    .in('import_id', importIds)
    .limit(1)
    .maybeSingle()
  return (data?.import_id as string | undefined) ?? null
}

export interface NoJogador {
  id: string
  nome: string
  rake: number
  resultado: number
}

export interface NoAgente {
  id: string
  nome: string
  rakeTotal: number
  rakebackPct: number
  valorRakeback: number
}

export interface NoSuperAgente {
  id: string
  nome: string
  agentes: NoAgente[]
}

export interface ArvoreClube {
  superAgentes: NoSuperAgente[]
  agentesSoltos: NoAgente[]
}

// Super Agente/Agente de um Clube num período — mesma fonte que
// AgentesAcertosView (acertos_agentes), só reorganizada em árvore por
// agentes.superagente_id. Um Agente sem Super Agente vinculado entra em
// "agentesSoltos", direto no Clube.
export async function buscarArvoreClube(clubeId: string, periodoFim: string): Promise<ArvoreClube> {
  const { data: imports } = await supabase.from('imports').select('id').eq('period_end', periodoFim)
  const importIds = (imports ?? []).map((i) => i.id as string)
  if (importIds.length === 0) return { superAgentes: [], agentesSoltos: [] }

  const { data } = await supabase
    .from('acertos_agentes')
    .select('agente_id, agente_nome, rake_total, rakeback_pct, valor_rakeback, agentes!agente_id(superagente_id, superagente:agentes!superagente_id(id, nome))')
    .eq('clube_id', clubeId)
    .in('import_id', importIds)

  type Row = {
    agente_id: string
    agente_nome: string
    rake_total: number
    rakeback_pct: number
    valor_rakeback: number
    agentes: { superagente_id: string | null; superagente: { id: string; nome: string } | null } | null
  }

  const porAgente = new Map<string, NoAgente>()
  const superagentePorAgente = new Map<string, { id: string; nome: string } | null>()
  for (const r of (data ?? []) as unknown as Row[]) {
    const atual = porAgente.get(r.agente_id) ?? { id: r.agente_id, nome: r.agente_nome, rakeTotal: 0, rakebackPct: r.rakeback_pct, valorRakeback: 0 }
    atual.rakeTotal += r.rake_total ?? 0
    atual.valorRakeback += r.valor_rakeback ?? 0
    porAgente.set(r.agente_id, atual)
    superagentePorAgente.set(r.agente_id, r.agentes?.superagente ?? null)
  }

  const superAgentesPorId = new Map<string, NoSuperAgente>()
  const agentesSoltos: NoAgente[] = []
  for (const agente of porAgente.values()) {
    const sa = superagentePorAgente.get(agente.id)
    if (!sa) { agentesSoltos.push(agente); continue }
    const node = superAgentesPorId.get(sa.id) ?? { id: sa.id, nome: sa.nome, agentes: [] }
    node.agentes.push(agente)
    superAgentesPorId.set(sa.id, node)
  }

  return {
    superAgentes: [...superAgentesPorId.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
    agentesSoltos: agentesSoltos.sort((a, b) => a.nome.localeCompare(b.nome)),
  }
}

// Clubes em moeda estrangeira desse import que ainda não têm Cotação
// cadastrada — precisa perguntar antes de calcular (mesma checagem de
// sempre em AcertosView, só reaproveitada aqui pro fluxo da árvore).
export async function buscarClubesCotacaoDoImport(importId: string): Promise<{ id: string; name: string }[]> {
  const { data: rows } = await supabase.from('import_rows').select('club_external_id').eq('import_id', importId)
  const extIds = [...new Set((rows ?? []).map((r) => r.club_external_id as string))]
  if (extIds.length === 0) return []
  const { data: clubes } = await supabase.from('clubs').select('id, name, cotacao, moeda').in('external_id', extIds)
  return ((clubes ?? []) as { id: string; name: string; cotacao: number | null; moeda: string | null }[])
    .filter((c) => c.moeda && c.moeda !== 'BRL' && c.cotacao == null)
    .map((c) => ({ id: c.id, name: c.name }))
}

// Jogadores de um Agente, dentro de um Clube, num período — ponta da
// árvore, sem Acerto próprio (só estatística: rake gerado e resultado),
// confirmado que não existe rakeback por jogador individual no sistema.
export async function buscarJogadoresDoAgente(agenteId: string, clubeId: string, periodoFim: string): Promise<NoJogador[]> {
  const { data: imports } = await supabase.from('imports').select('id').eq('period_end', periodoFim)
  const importIds = (imports ?? []).map((i) => i.id as string)
  if (importIds.length === 0) return []

  const { data } = await supabase
    .from('import_jogadores')
    .select('jogador_id, player_result, rake_total, jogadores(nome)')
    .eq('agente_id', agenteId)
    .eq('clube_id', clubeId)
    .in('import_id', importIds)

  type Row = { jogador_id: string; player_result: number | null; rake_total: number | null; jogadores: { nome: string } | null }
  const porJogador = new Map<string, NoJogador>()
  for (const r of (data ?? []) as unknown as Row[]) {
    const atual = porJogador.get(r.jogador_id) ?? { id: r.jogador_id, nome: r.jogadores?.nome ?? '—', rake: 0, resultado: 0 }
    atual.rake += r.rake_total ?? 0
    atual.resultado += r.player_result ?? 0
    porJogador.set(r.jogador_id, atual)
  }
  return [...porJogador.values()].sort((a, b) => a.nome.localeCompare(b.nome))
}

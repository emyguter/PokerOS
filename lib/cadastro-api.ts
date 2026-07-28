import { createClient } from '@supabase/supabase-js'
import type {
  Plataforma, PlataformaForm,
  MegaLiga, MegaLigaForm,
  SuperLeague, SuperLeagueForm,
  League, LeagueForm,
  Club, ClubForm,
  Agente, AgenteForm, AgentePlataforma,
  Jogador, JogadorForm,
  AgenteJogador, ClubeAgente,
  Regra, RegraCondicaoForm, RegraVinculo, EntidadeTipo,
} from './types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── PLATAFORMAS ─────────────────────────────────────────────

export async function getPlataformas(): Promise<Plataforma[]> {
  const { data, error } = await supabase.from('plataformas').select('*').order('nome')
  if (error) throw error
  return data
}
export async function createPlataforma(form: PlataformaForm): Promise<Plataforma> {
  const { data, error } = await supabase.from('plataformas').insert(form).select().single()
  if (error) throw error
  return data
}
export async function updatePlataforma(id: string, form: PlataformaForm): Promise<Plataforma> {
  const { data, error } = await supabase.from('plataformas').update(form).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deletePlataforma(id: string): Promise<void> {
  const { error } = await supabase.from('plataformas').delete().eq('id', id)
  if (error) throw error
}

// ─── MEGA LIGAS ──────────────────────────────────────────────

export async function getMegaLigas(): Promise<MegaLiga[]> {
  const { data, error } = await supabase.from('mega_ligas').select('*').order('nome')
  if (error) throw error
  return data
}
export async function createMegaLiga(form: MegaLigaForm): Promise<MegaLiga> {
  const { data, error } = await supabase.from('mega_ligas').insert(form).select().single()
  if (error) throw error
  return data
}
export async function updateMegaLiga(id: string, form: MegaLigaForm): Promise<MegaLiga> {
  const { data, error } = await supabase.from('mega_ligas').update(form).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteMegaLiga(id: string): Promise<void> {
  const { error } = await supabase.from('mega_ligas').delete().eq('id', id)
  if (error) throw error
}

// ─── SUPER LEAGUES ───────────────────────────────────────────

export async function getSuperLeagues(): Promise<SuperLeague[]> {
  const { data, error } = await supabase
    .from('super_leagues')
    .select('*, plataformas(id, nome, moeda), mega_ligas(id, nome, moeda)')
    .order('name')
  if (error) throw error
  return data
}
export async function createSuperLeague(form: SuperLeagueForm): Promise<SuperLeague> {
  const { data, error } = await supabase
    .from('super_leagues').insert(form)
    .select('*, plataformas(id, nome, moeda), mega_ligas(id, nome, moeda)').single()
  if (error) throw error
  return data
}
export async function updateSuperLeague(id: string, form: SuperLeagueForm): Promise<SuperLeague> {
  const { data, error } = await supabase
    .from('super_leagues').update(form).eq('id', id)
    .select('*, plataformas(id, nome, moeda), mega_ligas(id, nome, moeda)').single()
  if (error) throw error
  return data
}
export async function deleteSuperLeague(id: string): Promise<void> {
  const { error } = await supabase.from('super_leagues').delete().eq('id', id)
  if (error) throw error
}

// ─── LEAGUES ─────────────────────────────────────────────────

export async function getLeagues(): Promise<League[]> {
  const { data, error } = await supabase
    .from('leagues')
    .select('*, super_leagues(id, name, moeda, plataformas(id, nome, moeda))')
    .order('name')
  if (error) throw error
  return data
}
export async function createLeague(form: LeagueForm): Promise<League> {
  const { data, error } = await supabase
    .from('leagues').insert(form)
    .select('*, super_leagues(id, name, moeda, plataformas(id, nome, moeda))').single()
  if (error) throw error
  return data
}
export async function updateLeague(id: string, form: LeagueForm): Promise<League> {
  const { data, error } = await supabase
    .from('leagues').update(form).eq('id', id)
    .select('*, super_leagues(id, name, moeda, plataformas(id, nome, moeda))').single()
  if (error) throw error
  return data
}
export async function deleteLeague(id: string): Promise<void> {
  const { error } = await supabase.from('leagues').delete().eq('id', id)
  if (error) throw error
}

// ─── CLUBS ───────────────────────────────────────────────────

export async function getClubs(leagueId?: string): Promise<Club[]> {
  let query = supabase
    .from('clubs')
    .select('*, leagues(id, name, moeda, super_leagues(id, name, plataformas(id, nome)))')
    .order('name')
  if (leagueId) query = query.eq('league_id', leagueId)
  const { data, error } = await query
  if (error) throw error
  return data
}
export async function createClub(form: ClubForm): Promise<Club> {
  const { data, error } = await supabase
    .from('clubs').insert(form)
    .select('*, leagues(id, name, moeda, super_leagues(id, name, plataformas(id, nome)))').single()
  if (error) throw error
  return data
}
export async function updateClub(id: string, form: ClubForm): Promise<Club> {
  const { data, error } = await supabase
    .from('clubs').update(form).eq('id', id)
    .select('*, leagues(id, name, moeda, super_leagues(id, name, plataformas(id, nome)))').single()
  if (error) throw error
  return data
}
export async function deleteClub(id: string): Promise<void> {
  const { error } = await supabase.from('clubs').delete().eq('id', id)
  if (error) throw error
}

// ─── AGENTES ─────────────────────────────────────────────────

export async function getAgentes(filter?: string): Promise<Agente[]> {
  let query = supabase
    .from('agentes')
    .select(`
      *,
      plataformas(id, nome, moeda),
      agente_plataformas(id, plataforma_id, external_id, nickname, plataformas(nome)),
      clube_agentes(id, clube_id, rakeback_pct, clubs(id, name, external_id, plataforma_id, league_id, leagues(name)))
    `)
    .order('nome')
  if (filter) query = query.ilike('nome', `%${filter}%`)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createAgente(form: AgenteForm): Promise<Agente> {
  const { data, error } = await supabase
    .from('agentes').insert(form)
    .select('*, plataformas(id, nome, moeda), agente_plataformas(id, plataforma_id, external_id, nickname, plataformas(nome))')
    .single()
  if (error) throw error
  return data
}

export async function updateAgente(id: string, form: AgenteForm): Promise<Agente> {
  const { data, error } = await supabase
    .from('agentes').update(form).eq('id', id)
    .select('*, plataformas(id, nome, moeda), agente_plataformas(id, plataforma_id, external_id, nickname, plataformas(nome))')
    .single()
  if (error) throw error
  return data
}

export async function deleteAgente(id: string): Promise<void> {
  // agente_plataformas e clube_agentes caem junto via ON DELETE CASCADE
  const { error } = await supabase.from('agentes').delete().eq('id', id)
  if (error) throw error
}

export async function syncAgentePlataformas(
  agenteId: string,
  vinculos: AgentePlataforma[],
  iniciais: AgentePlataforma[]
): Promise<void> {
  const idsAtuais = vinculos.filter(v => v.id).map(v => v.id)
  const idsRemovidos = iniciais.filter(v => v.id && !idsAtuais.includes(v.id)).map(v => v.id!)

  if (idsRemovidos.length > 0) {
    const { error } = await supabase.from('agente_plataformas').delete().in('id', idsRemovidos)
    if (error) throw error
  }

  for (const v of vinculos) {
    if (!v.plataforma_id || !v.external_id.trim()) continue
    if (v.id) {
      const { error } = await supabase
        .from('agente_plataformas')
        .update({ external_id: v.external_id.trim(), nickname: v.nickname })
        .eq('id', v.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('agente_plataformas')
        .insert({ agente_id: agenteId, plataforma_id: v.plataforma_id, external_id: v.external_id.trim(), nickname: v.nickname })
      if (error) throw error
    }
  }

  const principal = vinculos[0]
  if (principal?.plataforma_id && principal.external_id.trim()) {
    const { error } = await supabase
      .from('agentes')
      .update({ external_id: principal.external_id.trim(), plataforma_id: principal.plataforma_id })
      .eq('id', agenteId)
    if (error) throw error
  }
}

// Sub-agentes = outros registros de `agentes` que apontam pra este via superagente_id.
// Compara lista atual vs inicial e aplica só o diff (adiciona/remove o vínculo, nunca deleta o agente).
export async function syncSubAgentes(
  superAgenteId: string,
  subAgenteIdsAtuais: string[],
  subAgenteIdsIniciais: string[]
): Promise<void> {
  const paraAdicionar = subAgenteIdsAtuais.filter(id => !subAgenteIdsIniciais.includes(id))
  const paraRemover = subAgenteIdsIniciais.filter(id => !subAgenteIdsAtuais.includes(id))

  if (paraAdicionar.length > 0) {
    const { error } = await supabase.from('agentes').update({ superagente_id: superAgenteId }).in('id', paraAdicionar)
    if (error) throw error
  }
  if (paraRemover.length > 0) {
    const { error } = await supabase.from('agentes').update({ superagente_id: null }).in('id', paraRemover)
    if (error) throw error
  }
}

// ─── JOGADORES ───────────────────────────────────────────────

export async function getJogadores(plataformaId?: string): Promise<Jogador[]> {
  let query = supabase.from('jogadores').select('*, plataformas(id, nome, moeda)').order('nome')
  if (plataformaId) query = query.eq('plataforma_id', plataformaId)
  const { data, error } = await query
  if (error) throw error
  return data
}
export async function createJogador(form: JogadorForm): Promise<Jogador> {
  const { data, error } = await supabase.from('jogadores').insert(form).select('*, plataformas(id, nome, moeda)').single()
  if (error) throw error
  return data
}
export async function updateJogador(id: string, form: JogadorForm): Promise<Jogador> {
  const { data, error } = await supabase.from('jogadores').update(form).eq('id', id).select('*, plataformas(id, nome, moeda)').single()
  if (error) throw error
  return data
}
export async function deleteJogador(id: string): Promise<void> {
  const { error } = await supabase.from('jogadores').delete().eq('id', id)
  if (error) throw error
}

// ─── AGENTE <-> JOGADOR ──────────────────────────────────────

export async function getJogadoresByAgente(agenteId: string): Promise<AgenteJogador[]> {
  const { data, error } = await supabase
    .from('agente_jogadores')
    .select('*, jogadores(id, nome, external_id, plataformas(id, nome))')
    .eq('agente_id', agenteId)
  if (error) throw error
  return data
}
export async function addJogadorToAgente(agenteId: string, jogadorId: string): Promise<void> {
  const { error } = await supabase.from('agente_jogadores').insert({ agente_id: agenteId, jogador_id: jogadorId })
  if (error) throw error
}
export async function removeJogadorFromAgente(agenteId: string, jogadorId: string): Promise<void> {
  const { error } = await supabase.from('agente_jogadores').delete().eq('agente_id', agenteId).eq('jogador_id', jogadorId)
  if (error) throw error
}

// ─── CLUBE <-> AGENTE ────────────────────────────────────────

export async function getAgentesByClube(clubeId: string): Promise<ClubeAgente[]> {
  const { data, error } = await supabase
    .from('clube_agentes')
    .select('*, agentes(id, nome, external_id, plataformas(id, nome))')
    .eq('clube_id', clubeId)
  if (error) throw error
  return data
}
export async function addAgenteToClube(clubeId: string, agenteId: string): Promise<void> {
  const { error } = await supabase.from('clube_agentes').insert({ clube_id: clubeId, agente_id: agenteId })
  if (error) throw error
}
export async function removeAgenteFromClube(clubeId: string, agenteId: string): Promise<void> {
  const { error } = await supabase.from('clube_agentes').delete().eq('clube_id', clubeId).eq('agente_id', agenteId)
  if (error) throw error
}
export async function setRakebackClubeAgente(clubeId: string, agenteId: string, rakebackPct: number | null): Promise<void> {
  const { error } = await supabase.from('clube_agentes').update({ rakeback_pct: rakebackPct }).eq('clube_id', clubeId).eq('agente_id', agenteId)
  if (error) throw error
}

export async function syncClubeAgentes(
  agenteId: string,
  clubesAtuais: { id: string; rakeback_pct: number | null }[],
  clubeIdsIniciais: string[]
): Promise<void> {
  const clubeIdsAtuais = clubesAtuais.map(c => c.id)
  const adicionados = clubeIdsAtuais.filter(id => !clubeIdsIniciais.includes(id))
  const removidos = clubeIdsIniciais.filter(id => !clubeIdsAtuais.includes(id))
  for (const clubeId of adicionados) await addAgenteToClube(clubeId, agenteId)
  for (const clubeId of removidos) await removeAgenteFromClube(clubeId, agenteId)
  for (const c of clubesAtuais) await setRakebackClubeAgente(c.id, agenteId, c.rakeback_pct)
}

// ─── REGRAS (reutilizáveis — nascem soltas, e são vinculadas a Liga/Clube/
// Agente/Super Agente depois, em vez de recriadas dentro de cada cadastro) ─

type CondicaoRow = {
  operador: string
  valor: number | null
  resultado_pct: number | null
  is_fallback: boolean
  regra_condicao_termos?: { indicador_id: string; ordem: number }[]
}

function mapCondicaoRow(c: CondicaoRow): RegraCondicaoForm {
  const termos = (c.regra_condicao_termos ?? []).slice().sort((a, b) => a.ordem - b.ordem)
  return {
    indicador_ids: termos.length > 0 ? termos.map(t => t.indicador_id) : [''],
    operador: c.operador,
    valor: c.valor,
    resultado_pct: c.resultado_pct,
    is_fallback: c.is_fallback,
  }
}

export async function getRegras(): Promise<Regra[]> {
  const { data, error } = await supabase
    .from('regras')
    .select('id, nome, created_at, regra_condicoes(operador, valor, resultado_pct, is_fallback, regra_condicao_termos(indicador_id, ordem)), regra_entidades(id)')
    .order('nome')
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id,
    nome: r.nome,
    created_at: r.created_at,
    condicoes: (r.regra_condicoes ?? []).map(mapCondicaoRow),
    vinculoCount: (r.regra_entidades ?? []).length,
  }))
}

async function salvarCondicoes(regraId: string, condicoes: RegraCondicaoForm[]): Promise<void> {
  if (condicoes.length === 0) return
  const { data: condRows, error: condErr } = await supabase.from('regra_condicoes').insert(
    condicoes.map((c, i) => ({
      regra_id: regraId,
      ordem: i + 1,
      operador: c.is_fallback ? '>=' : c.operador,
      valor: c.is_fallback ? 0 : c.valor,
      resultado_pct: c.resultado_pct,
      is_fallback: c.is_fallback,
    }))
  ).select('id')
  if (condErr) throw condErr
  const termos = condicoes.flatMap((c, i) =>
    c.is_fallback ? [] : c.indicador_ids
      .filter(Boolean)
      .map((indicadorId, ti) => ({ regra_condicao_id: condRows![i].id, indicador_id: indicadorId, ordem: ti + 1 }))
  )
  if (termos.length > 0) {
    const { error: termosErr } = await supabase.from('regra_condicao_termos').insert(termos)
    if (termosErr) throw termosErr
  }
}

export async function createRegra(nome: string, condicoes: RegraCondicaoForm[]): Promise<string> {
  const { data: nova, error } = await supabase.from('regras').insert({ nome }).select().single()
  if (error) throw error
  await salvarCondicoes(nova.id, condicoes)
  return nova.id
}

export async function updateRegra(id: string, nome: string, condicoes: RegraCondicaoForm[]): Promise<void> {
  const { error } = await supabase.from('regras').update({ nome }).eq('id', id)
  if (error) throw error
  const { error: delErr } = await supabase.from('regra_condicoes').delete().eq('regra_id', id)
  if (delErr) throw delErr
  await salvarCondicoes(id, condicoes)
}

export async function deleteRegra(id: string): Promise<void> {
  const { error } = await supabase.from('regras').delete().eq('id', id)
  if (error) throw error
}

const TABELA_ENTIDADE: Record<EntidadeTipo, { tabela: string; coluna: string }> = {
  plataforma: { tabela: 'plataformas', coluna: 'nome' },
  mega_liga: { tabela: 'mega_ligas', coluna: 'nome' },
  superliga: { tabela: 'super_leagues', coluna: 'name' },
  liga: { tabela: 'leagues', coluna: 'name' },
  clube: { tabela: 'clubs', coluna: 'name' },
  agente: { tabela: 'agentes', coluna: 'nome' },
  jogador: { tabela: 'jogadores', coluna: 'nome' },
}

type VinculoRow = {
  id: string
  regra_id: string
  entidade_tipo: EntidadeTipo
  entidade_id: string
  de_tipo: EntidadeTipo | null
  de_id: string | null
  prioridade: number
}

export async function getVinculos(regraId: string): Promise<RegraVinculo[]> {
  const { data, error } = await supabase
    .from('regra_entidades')
    .select('id, regra_id, entidade_tipo, entidade_id, de_tipo, de_id, prioridade')
    .eq('regra_id', regraId)
  if (error) throw error
  const vinculos = (data ?? []) as VinculoRow[]

  const idsPorTipo = new Map<EntidadeTipo, Set<string>>()
  const registra = (tipo: EntidadeTipo | null, id: string | null) => {
    if (!tipo || !id) return
    idsPorTipo.set(tipo, (idsPorTipo.get(tipo) ?? new Set()).add(id))
  }
  for (const v of vinculos) { registra(v.entidade_tipo, v.entidade_id); registra(v.de_tipo, v.de_id) }

  const nomesPorId = new Map<string, string>()
  for (const [tipo, ids] of idsPorTipo) {
    const { tabela, coluna } = TABELA_ENTIDADE[tipo]
    const { data: rows } = await supabase.from(tabela).select(`id, ${coluna}`).in('id', [...ids])
    for (const r of (rows ?? []) as any[]) nomesPorId.set(r.id, r[coluna])
  }

  return vinculos.map(v => ({
    id: v.id,
    regra_id: v.regra_id,
    para_tipo: v.entidade_tipo,
    para_id: v.entidade_id,
    para_nome: nomesPorId.get(v.entidade_id) ?? '—',
    de_tipo: v.de_tipo,
    de_id: v.de_id,
    de_nome: v.de_id ? nomesPorId.get(v.de_id) ?? '—' : null,
    prioridade: v.prioridade,
  }))
}

export async function addVinculo(
  regraId: string,
  para: { tipo: EntidadeTipo; id: string },
  de: { tipo: EntidadeTipo; id: string } | null
): Promise<void> {
  const { error } = await supabase.from('regra_entidades').insert({
    regra_id: regraId,
    entidade_tipo: para.tipo,
    entidade_id: para.id,
    de_tipo: de?.tipo ?? null,
    de_id: de?.id ?? null,
    prioridade: 0,
  })
  if (error) throw error
}

export async function removeVinculo(vinculoId: string): Promise<void> {
  const { error } = await supabase.from('regra_entidades').delete().eq('id', vinculoId)
  if (error) throw error
}

export async function buscarEntidades(tipo: EntidadeTipo, query: string): Promise<{ id: string; nome: string }[]> {
  const { tabela, coluna } = TABELA_ENTIDADE[tipo]
  let q = supabase.from(tabela).select(`id, ${coluna}`).order(coluna).limit(20)
  if (query.trim()) q = q.ilike(coluna, `%${query.trim()}%`)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r: any) => ({ id: r.id, nome: r[coluna] }))
}
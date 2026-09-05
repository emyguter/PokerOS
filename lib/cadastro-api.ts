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
  Regra, RegraForm, RegraCondicaoForm, RegraVinculo, EntidadeTipo, CampoClube, FaixaMultaForm, LayoutCampoForm,
} from './types'
import { resolverLayout, LABEL_CAMPO as LABEL_CAMPO_ACERTO } from './relatorio-acerto'

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

export async function getClubs(leagueId?: string, incluirInativos = false): Promise<Club[]> {
  let query = supabase
    .from('clubs')
    .select('*, leagues(id, name, moeda, super_leagues(id, name, plataformas(id, nome)))')
    .order('name')
  if (leagueId) query = query.eq('league_id', leagueId)
  if (!incluirInativos) query = query.eq('ativo', true)
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
// Excluir de verdade quebra assim que o clube já tem acerto calculado (FK
// sem cascade, de propósito). "Excluir" um clube na tela na real só marca
// ativo = false — some da lista, mas cadastro e histórico continuam
// intactos e reversível (reativarClub).
export async function desativarClub(id: string): Promise<void> {
  const { error } = await supabase.from('clubs').update({ ativo: false }).eq('id', id)
  if (error) throw error
}
export async function reativarClub(id: string): Promise<void> {
  const { error } = await supabase.from('clubs').update({ ativo: true }).eq('id', id)
  if (error) throw error
}

// ─── INDICAÇÕES (um clube indica outro; o vínculo em si não tem taxa — quem
// indicou ganha um bônus sobre o rake do CLUBE INDICADO, sempre que tiver
// pelo menos uma indicação: % digitado por vínculo
// (club_indicacoes.taxa_indicacao_pct — coluna antiga, tinha saído de uso
// quando a Indicação virou o bônus fixo por Elite; agora volta a ser lida),
// sem teto — ver o cálculo em lib/acertos-engine.ts. Se o clube tiver mais de
// uma indicação, os valores em R$ de cada uma somam (cada uma usa o rake do
// seu próprio indicado). Confirmado com o Cássio: nada de programa VIP/Elite
// aqui — é só o vínculo + a % combinada) ──

export interface IndicacaoRow {
  id: string
  club_indicado_id: string
  nome: string
  taxaIndicacaoPct: number
}

export async function getIndicacoes(clubeId: string): Promise<IndicacaoRow[]> {
  const { data, error } = await supabase
    .from('club_indicacoes')
    .select('id, club_indicado_id, taxa_indicacao_pct')
    .eq('club_id', clubeId)
  if (error) throw error
  const linhas = data ?? []
  if (linhas.length === 0) return []
  const ids = [...new Set(linhas.map(l => l.club_indicado_id))]
  const { data: clubesData, error: clubesErr } = await supabase.from('clubs').select('id, name').in('id', ids)
  if (clubesErr) throw clubesErr
  const nomePorId = new Map((clubesData ?? []).map(c => [c.id, c.name]))
  return linhas.map(l => ({
    id: l.id,
    club_indicado_id: l.club_indicado_id,
    nome: nomePorId.get(l.club_indicado_id) ?? '—',
    taxaIndicacaoPct: l.taxa_indicacao_pct ?? 0,
  }))
}

export async function addIndicacao(clubeId: string, clubeIndicadoId: string, taxaIndicacaoPct: number): Promise<void> {
  const { error } = await supabase.from('club_indicacoes').insert({
    club_id: clubeId, club_indicado_id: clubeIndicadoId, taxa_indicacao_pct: taxaIndicacaoPct,
  })
  if (error) throw error
}

export async function atualizarPercentualIndicacao(id: string, taxaIndicacaoPct: number): Promise<void> {
  const { error } = await supabase.from('club_indicacoes').update({ taxa_indicacao_pct: taxaIndicacaoPct }).eq('id', id)
  if (error) throw error
}

export async function removeIndicacao(id: string): Promise<void> {
  const { error } = await supabase.from('club_indicacoes').delete().eq('id', id)
  if (error) throw error
}

// ─── VÍNCULO DE ACERTO (mesmo clube em mais de uma plataforma — ex: ClubGG
// + Sul HG — precisa somar num Acerto só no Resumo de Acertos, ver
// lib/relatorio-resumo-acertos.ts). Grupo aberto: cada clube aponta pro id
// de outro clube do mesmo grupo em clubs.vinculo_acerto_grupo_id (a
// "âncora"); null = ainda não vinculado a ninguém (âncora do próprio grupo
// de 1) ──

export interface VinculoAcertoRow {
  id: string
  nome: string
}

async function buscarAncora(clubeId: string): Promise<{ id: string; vinculo_acerto_grupo_id: string | null }> {
  const { data, error } = await supabase.from('clubs').select('id, vinculo_acerto_grupo_id').eq('id', clubeId).single()
  if (error) throw error
  return data
}

export async function getVinculosAcerto(clubeId: string): Promise<VinculoAcertoRow[]> {
  const clube = await buscarAncora(clubeId)
  const ancora = clube.vinculo_acerto_grupo_id ?? clube.id
  const { data, error } = await supabase
    .from('clubs')
    .select('id, name')
    .or(`id.eq.${ancora},vinculo_acerto_grupo_id.eq.${ancora}`)
    .neq('id', clubeId)
  if (error) throw error
  return (data ?? []).map((c) => ({ id: c.id, nome: c.name }))
}

export async function addVinculoAcerto(clubeId: string, outroClubeId: string): Promise<void> {
  const [a, b] = await Promise.all([buscarAncora(clubeId), buscarAncora(outroClubeId)])
  const ancoraA = a.vinculo_acerto_grupo_id ?? a.id
  const ancoraB = b.vinculo_acerto_grupo_id ?? b.id
  if (ancoraA === ancoraB) return
  const { error } = await supabase
    .from('clubs')
    .update({ vinculo_acerto_grupo_id: ancoraA })
    .or(`id.eq.${ancoraB},vinculo_acerto_grupo_id.eq.${ancoraB}`)
  if (error) throw error
}

export async function removeVinculoAcerto(clubeIdParaRemover: string): Promise<void> {
  const clube = await buscarAncora(clubeIdParaRemover)
  if (clube.vinculo_acerto_grupo_id != null) {
    const { error } = await supabase.from('clubs').update({ vinculo_acerto_grupo_id: null }).eq('id', clubeIdParaRemover)
    if (error) throw error
    return
  }
  // Esse clube é a âncora do grupo — promove outro membro antes de soltar,
  // senão o resto do grupo perde o vínculo entre si.
  const { data: membros, error: membrosErr } = await supabase
    .from('clubs')
    .select('id')
    .eq('vinculo_acerto_grupo_id', clube.id)
  if (membrosErr) throw membrosErr
  const [novaAncora, ...resto] = (membros ?? []).map((m) => m.id)
  if (!novaAncora) return
  const { error: err1 } = await supabase.from('clubs').update({ vinculo_acerto_grupo_id: null }).eq('id', novaAncora)
  if (err1) throw err1
  if (resto.length > 0) {
    const { error: err2 } = await supabase.from('clubs').update({ vinculo_acerto_grupo_id: novaAncora }).in('id', resto)
    if (err2) throw err2
  }
}

// Primeira vez que o Stoploss Inicial é definido (cadastro trava depois
// disso — ver ClubModal): abre a primeira linha do histórico, pra sempre dar
// pra ver de onde o clube partiu (Stoploss Atual é calculado ao vivo a
// partir de clubs.stoploss_inicial, não precisa espelhar em outro campo).
export async function initStoplossAtual(clubeId: string, valor: number): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const { error: histErr } = await supabase.from('stoploss_historico').insert({
    clube_id: clubeId,
    tipo: 'inicial',
    valor_delta: valor,
    valor_resultante: valor,
    motivo: 'Stoploss inicial do clube',
    criado_por: userData.user?.id ?? null,
  })
  if (histErr) throw histErr
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
  ordem: number
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
    .select('id, nome, created_at, tipo, campo, regra_pai_id, regra_condicoes(operador, valor, resultado_pct, is_fallback, ordem, regra_condicao_termos(indicador_id, ordem)), regra_multa_faixas(quantidade, unidade, percentual), regra_layout_campos(campo, ordem, visivel), regra_entidades(id)')
    .order('nome')
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id,
    nome: r.nome,
    created_at: r.created_at,
    tipo: (r.tipo ?? 'faixa') as Regra['tipo'],
    campo: (r.campo ?? null) as Regra['campo'],
    // Sem ordenar por `ordem` aqui, a tela de edição de Regras mostrava as
    // condições em ordem arbitrária (regra_condicoes.id é uuid aleatório) —
    // e como salvarCondicoes reatribui `ordem` pela posição no array no
    // momento de salvar, editar e salvar QUALQUER regra (mesmo mudança não
    // relacionada) embaralhava a ordem de avaliação de verdade. Foi assim
    // que a regra do Agreste_poker acabou avaliando "< -1" antes de "< -1,5".
    condicoes: [...(r.regra_condicoes ?? [])].sort((a: CondicaoRow, b: CondicaoRow) => a.ordem - b.ordem).map(mapCondicaoRow),
    faixasMulta: (r.regra_multa_faixas ?? []).map((f: any) => ({ quantidade: f.quantidade, unidade: f.unidade, percentual: f.percentual })),
    layoutCampos: (r.regra_layout_campos ?? []).map((c: any) => ({ campo: c.campo, ordem: c.ordem, visivel: c.visivel })),
    vinculoCount: (r.regra_entidades ?? []).length,
    regraPaiId: (r.regra_pai_id ?? null) as string | null,
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

async function salvarFaixasMulta(regraId: string, faixas: FaixaMultaForm[]): Promise<void> {
  const validas = faixas.filter((f) => f.quantidade != null && f.percentual != null)
  if (validas.length === 0) return
  const { error } = await supabase.from('regra_multa_faixas').insert(
    validas.map((f) => ({ regra_id: regraId, quantidade: f.quantidade, unidade: f.unidade, percentual: f.percentual }))
  )
  if (error) throw error
}

async function salvarLayoutCampos(regraId: string, campos: LayoutCampoForm[]): Promise<void> {
  if (campos.length === 0) return
  const { error } = await supabase.from('regra_layout_campos').insert(
    campos.map((c) => ({ regra_id: regraId, campo: c.campo, ordem: c.ordem, visivel: c.visivel }))
  )
  if (error) throw error
}

// regraPaiId: só faz sentido pra Layout (sempre) e Multa (quando nasce
// junto com um Cálculo, ver RegraModal/handleSave) — anexa a Regra nova
// como filha, sem vínculo (regra_entidades) próprio: o vínculo da mãe já
// cobre a filha também.
export async function createRegra(form: RegraForm, regraPaiId?: string | null): Promise<string> {
  const { data: nova, error } = await supabase.from('regras').insert({ nome: form.nome, tipo: form.tipo, campo: form.tipo === 'faixa' ? form.campo : null, regra_pai_id: regraPaiId ?? null }).select().single()
  if (error) throw error
  if (form.tipo === 'faixa') await salvarCondicoes(nova.id, form.condicoes)
  else if (form.tipo === 'multa_atraso') await salvarFaixasMulta(nova.id, form.faixasMulta)
  else await salvarLayoutCampos(nova.id, form.layoutCampos)
  return nova.id
}

// regra_condicao_termos (indicadores compostos) referencia regra_condicoes
// sem "on delete cascade" — precisa ser limpo antes, senão o delete abaixo
// falha com erro de FK (violação de chave estrangeira do Postgres) sempre
// que a condição usar mais de 1 indicador.
async function limparCondicoes(regraId: string): Promise<void> {
  const { data: condicoes, error: selErr } = await supabase.from('regra_condicoes').select('id').eq('regra_id', regraId)
  if (selErr) throw selErr
  const condIds = (condicoes ?? []).map((c) => c.id as string)
  if (condIds.length > 0) {
    const { error: termosErr } = await supabase.from('regra_condicao_termos').delete().in('regra_condicao_id', condIds)
    if (termosErr) throw termosErr
  }
  const { error: delErr } = await supabase.from('regra_condicoes').delete().eq('regra_id', regraId)
  if (delErr) throw delErr
}

export async function updateRegra(id: string, form: RegraForm): Promise<void> {
  const { error } = await supabase.from('regras').update({ nome: form.nome, tipo: form.tipo, campo: form.tipo === 'faixa' ? form.campo : null }).eq('id', id)
  if (error) throw error
  await limparCondicoes(id)
  const { error: delMultaErr } = await supabase.from('regra_multa_faixas').delete().eq('regra_id', id)
  if (delMultaErr) throw delMultaErr
  const { error: delLayoutErr } = await supabase.from('regra_layout_campos').delete().eq('regra_id', id)
  if (delLayoutErr) throw delLayoutErr
  if (form.tipo === 'faixa') await salvarCondicoes(id, form.condicoes)
  else if (form.tipo === 'multa_atraso') await salvarFaixasMulta(id, form.faixasMulta)
  else await salvarLayoutCampos(id, form.layoutCampos)
}

// regra_entidades (vínculos) também referencia regras sem cascade — sem
// limpar antes, excluir uma Regra que já foi vinculada a algum Clube/Liga/
// Agente falha com erro de FK em vez de excluir de verdade. Os Acertos já
// calculados não são afetados: guardam os valores finais (valor_acerto,
// fee_*_valor etc.) prontos, não recalculam nada a partir da Regra.
export async function deleteRegra(id: string): Promise<void> {
  await limparCondicoes(id)
  const { error: vincErr } = await supabase.from('regra_entidades').delete().eq('regra_id', id)
  if (vincErr) throw vincErr
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
  campo: CampoClube | null
  prioridade: number
}

export async function getVinculos(regraId: string): Promise<RegraVinculo[]> {
  const { data, error } = await supabase
    .from('regra_entidades')
    .select('id, regra_id, entidade_tipo, entidade_id, de_tipo, de_id, campo, prioridade')
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
    campo: v.campo,
    prioridade: v.prioridade,
  }))
}

export async function addVinculo(
  regraId: string,
  para: { tipo: EntidadeTipo; id: string },
  de: { tipo: EntidadeTipo; id: string } | null,
  campo?: CampoClube | null
): Promise<void> {
  const { error } = await supabase.from('regra_entidades').insert({
    regra_id: regraId,
    entidade_tipo: para.tipo,
    entidade_id: para.id,
    de_tipo: de?.tipo ?? null,
    de_id: de?.id ?? null,
    campo: para.tipo === 'clube' ? (campo ?? null) : null,
    prioridade: 0,
  })
  if (error) throw error
}

export async function updateVinculo(
  vinculoId: string,
  para: { tipo: EntidadeTipo; id: string },
  de: { tipo: EntidadeTipo; id: string } | null,
  campo?: CampoClube | null
): Promise<void> {
  const { error } = await supabase.from('regra_entidades').update({
    entidade_tipo: para.tipo,
    entidade_id: para.id,
    de_tipo: de?.tipo ?? null,
    de_id: de?.id ?? null,
    campo: para.tipo === 'clube' ? (campo ?? null) : null,
  }).eq('id', vinculoId)
  if (error) throw error
}

export async function removeVinculo(vinculoId: string): Promise<void> {
  const { error } = await supabase.from('regra_entidades').delete().eq('id', vinculoId)
  if (error) throw error
}

export async function buscarEntidades(tipo: EntidadeTipo, query: string, limit = 20): Promise<{ id: string; nome: string }[]> {
  const { tabela, coluna } = TABELA_ENTIDADE[tipo]
  let q = supabase.from(tabela).select(`id, ${coluna}`).order(coluna).limit(limit)
  if (query.trim()) q = q.ilike(coluna, `%${query.trim()}%`)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r: any) => ({ id: r.id, nome: r[coluna] }))
}

// Usado na tela de Vínculos pra avisar quando o campo escolhido não tem
// efeito no tipo de cobrança do clube (ver lib/types.ts CAMPOS_POR_SETTLEMENT).
export async function buscarSettlementTypesClubes(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('clubs').select('id, settlement_type').in('id', ids)
  if (error) throw error
  return new Map((data ?? []).map((r: any) => [r.id as string, r.settlement_type as string]))
}

export interface RegraAplicada {
  regra_id: string
  regra_nome: string
  de_tipo: EntidadeTipo | null
  de_nome: string | null
  campo: CampoClube | null
  linhas: string[]
}

// Painel read-only de "qual regra vale pra essa entidade" — usado nos
// cadastros de Liga/Clube/Agente, que não criam mais regra embutida: a
// criação/edição em si vive só na tela de Regras, aqui é só leitura do
// vínculo (Para = essa entidade). Pra Clube, um vínculo pode valer só pra
// um campo específico (Fee MTT/Cash/Operacional/SpinUp) — vem junto no `campo`.
const SELECT_REGRA_APLICADA = 'id, nome, tipo, regra_condicoes(operador, valor, resultado_pct, is_fallback, ordem, regra_condicao_termos(indicadores(nome, descricao))), regra_multa_faixas(quantidade, unidade, percentual), regra_layout_campos(campo, ordem, visivel)'

function linhasDaRegra(regra: any): string[] {
  if (regra?.tipo === 'multa_atraso') return ((regra?.regra_multa_faixas ?? []) as any[]).map((f) => `${f.quantidade} ${f.unidade} → ${f.percentual}%`)
  if (regra?.tipo === 'layout_acerto') return resolverLayout(regra?.regra_layout_campos ?? null).map((c) => `${LABEL_CAMPO_ACERTO[c.campo]}${c.visivel ? '' : ' (oculto)'}`)
  // Mesmo motivo do getRegras/buscarCondicoesPorClube: sem ordenar por
  // `ordem`, esse painel podia mostrar (e o motor de cálculo avaliar) as
  // condições numa sequência diferente da pretendida.
  return ([...(regra?.regra_condicoes ?? [])] as any[]).sort((a, b) => a.ordem - b.ordem).map(c => {
    if (c.is_fallback) return `SENÃO → ${c.resultado_pct}%`
    const termos = (c.regra_condicao_termos ?? []).map((t: any) => t.indicadores?.descricao || t.indicadores?.nome || '?').join(' + ')
    return `SE ${termos} ${c.operador} ${c.valor} → ${c.resultado_pct}%`
  })
}

export async function getRegrasDaEntidade(tipo: EntidadeTipo, id: string): Promise<RegraAplicada[]> {
  const { data, error } = await supabase
    .from('regra_entidades')
    .select(`regra_id, de_tipo, de_id, campo, regras(${SELECT_REGRA_APLICADA})`)
    .eq('entidade_tipo', tipo)
    .eq('entidade_id', id)
  if (error) throw error
  const rows = (data ?? []) as any[]

  const deIdsPorTipo = new Map<EntidadeTipo, Set<string>>()
  for (const r of rows) {
    if (r.de_tipo && r.de_id) deIdsPorTipo.set(r.de_tipo, (deIdsPorTipo.get(r.de_tipo) ?? new Set()).add(r.de_id))
  }
  const deNomesPorId = new Map<string, string>()
  for (const [deTipo, ids] of deIdsPorTipo) {
    const { tabela, coluna } = TABELA_ENTIDADE[deTipo]
    const { data: entRows } = await supabase.from(tabela).select(`id, ${coluna}`).in('id', [...ids])
    for (const e of (entRows ?? []) as any[]) deNomesPorId.set(e.id, e[coluna])
  }

  const diretas: RegraAplicada[] = rows.map(r => ({
    regra_id: r.regra_id as string,
    regra_nome: (r.regras?.nome as string) ?? '—',
    de_tipo: r.de_tipo,
    de_nome: r.de_id ? deNomesPorId.get(r.de_id) ?? '—' : null,
    campo: r.campo ?? null,
    linhas: linhasDaRegra(r.regras),
  }))

  // Layout/Multa anexados (regra_pai_id) a uma Regra de Cálculo vinculada
  // aqui valem junto, mesmo sem vínculo (regra_entidades) próprio — o
  // vínculo da mãe já cobre a filha (ver migração regra_pai_id).
  const calculoIds = rows.filter(r => r.regras?.tipo === 'faixa').map(r => r.regras!.id as string)
  if (calculoIds.length === 0) return diretas

  const { data: filhas } = await supabase.from('regras').select(SELECT_REGRA_APLICADA).in('regra_pai_id', calculoIds)
  const anexadas: RegraAplicada[] = ((filhas ?? []) as any[]).map(f => ({
    regra_id: f.id as string,
    regra_nome: (f.nome as string) ?? '—',
    de_tipo: null,
    de_nome: null,
    campo: null,
    linhas: linhasDaRegra(f),
  }))

  return [...diretas, ...anexadas]
}
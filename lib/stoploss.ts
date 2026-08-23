import { supabase } from './supabase'
import type { StoplossAjuste, StoplossEscopo } from './types'

// Tipos de stoploss_historico que entram na soma do Stoploss Atual —
// 'inicial' e 'caucao' ficam de fora de propósito: 'inicial' já é a base
// (clubs.stoploss_inicial) e 'caucao' virou recálculo ao vivo (caucao_atual
// × ratio), não soma incremental por evento.
const TIPOS_QUE_SOMAM = ['antecipacao', 'ajuste_suporte', 'margem_monitoria', 'bug_ppp'] as const

export interface ClubeBaseStoploss {
  id: string
  stoploss_inicial: number | null
  caucao_atual: number | null
  ratio_caucao_stoploss: number | null
  hora_virada_semana: number | null
}

export interface HistoricoRow {
  clube_id: string
  valor_delta: number
  escopo: StoplossEscopo
  criado_em: string
}

const SELECT_BASE = 'id, stoploss_inicial, caucao_atual, ratio_caucao_stoploss, hora_virada_semana'

// Início da semana corrente desse clube: a segunda-feira mais recente às
// `horaVirada` (0-23), sempre em horário de Brasília (UTC-3 fixo, sem
// horário de verão). Antes disso, ainda é a semana passada.
export function inicioSemanaAtual(horaVirada: number, agora: Date = new Date()): Date {
  const brl = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  const diaSemana = brl.getUTCDay() // 0=domingo, 1=segunda, ... 6=sábado
  const horaBrl = brl.getUTCHours()
  let diasDesdeSegunda = (diaSemana + 6) % 7
  if (diaSemana === 1 && horaBrl < horaVirada) diasDesdeSegunda = 7 // segunda, mas ainda não virou hoje
  const inicioBrl = new Date(Date.UTC(brl.getUTCFullYear(), brl.getUTCMonth(), brl.getUTCDate() - diasDesdeSegunda, horaVirada, 0, 0))
  return new Date(inicioBrl.getTime() + 3 * 60 * 60 * 1000)
}

// Ajuste 'semanal' só soma no Stoploss Atual enquanto estiver dentro da
// semana em que foi criado — depois da virada, some sozinho da conta (mas
// continua no Extrato pra sempre, só não conta mais no total ao vivo).
// `asOf` simula "agora" pra poder reconstruir como o total estava numa data
// passada: ignora lançamento que ainda não tinha acontecido naquela data, e
// usa a semana daquela data (não a de hoje) pra decidir se um 'semanal' já
// tinha expirado.
export function somarHistorico(rows: HistoricoRow[], horaVirada: number, asOf: Date = new Date()): number {
  const inicioSemana = inicioSemanaAtual(horaVirada, asOf)
  return rows.reduce((soma, h) => {
    const criadoEm = new Date(h.criado_em)
    if (criadoEm > asOf) return soma
    if (h.escopo === 'semanal' && criadoEm < inicioSemana) return soma
    return soma + (h.valor_delta ?? 0)
  }, 0)
}

export function calcularStoplossAtual(club: ClubeBaseStoploss, somaHistorico: number): number {
  const inicial = club.stoploss_inicial ?? 0
  const ratio = club.ratio_caucao_stoploss ?? 1
  const contribuicaoCaucao = (club.caucao_atual ?? 0) * ratio
  return inicial + contribuicaoCaucao + somaHistorico
}

const SELECT_HISTORICO_BASE = 'club_id, caucao_atual, ratio_caucao_stoploss, stoploss_inicial, hora_virada_semana, alterado_em'

// Snapshot de clubs_historico mais recente até `asOf` (a "foto" do clube
// naquela data) — cai pro valor ao vivo de `clubs` só se o clube não tiver
// nenhum snapshot antes dessa data (não deveria acontecer depois do backfill
// da migração, mas é uma rede de segurança).
async function baseClubeAsOf(clubeId: string, asOf: Date): Promise<ClubeBaseStoploss> {
  const { data } = await supabase
    .from('clubs_historico')
    .select(SELECT_HISTORICO_BASE)
    .eq('club_id', clubeId)
    .lte('alterado_em', asOf.toISOString())
    .order('alterado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (data) return { id: clubeId, caucao_atual: data.caucao_atual, ratio_caucao_stoploss: data.ratio_caucao_stoploss, stoploss_inicial: data.stoploss_inicial, hora_virada_semana: data.hora_virada_semana }
  const { data: live } = await supabase.from('clubs').select(SELECT_BASE).eq('id', clubeId).single()
  return live ?? { id: clubeId, stoploss_inicial: 0, caucao_atual: 0, ratio_caucao_stoploss: 1, hora_virada_semana: 2 }
}

async function basesClubesAsOf(clubeIds: string[], asOf: Date): Promise<Map<string, ClubeBaseStoploss>> {
  const mapa = new Map<string, ClubeBaseStoploss>()
  const { data } = await supabase
    .from('clubs_historico')
    .select(SELECT_HISTORICO_BASE)
    .in('club_id', clubeIds)
    .lte('alterado_em', asOf.toISOString())
    .order('alterado_em', { ascending: false })
  for (const row of (data ?? [])) {
    if (!mapa.has(row.club_id)) {
      mapa.set(row.club_id, { id: row.club_id, caucao_atual: row.caucao_atual, ratio_caucao_stoploss: row.ratio_caucao_stoploss, stoploss_inicial: row.stoploss_inicial, hora_virada_semana: row.hora_virada_semana })
    }
  }
  const faltantes = clubeIds.filter(id => !mapa.has(id))
  if (faltantes.length > 0) {
    const { data: live } = await supabase.from('clubs').select(SELECT_BASE).in('id', faltantes)
    for (const c of (live ?? []) as ClubeBaseStoploss[]) mapa.set(c.id, c)
  }
  return mapa
}

// `asOf`: quando informado, reconstrói o Stoploss Atual como ele estava
// naquela data (caução/ratio/inicial vêm de `clubs_historico`, e só entram
// lançamentos que já tinham acontecido até ali) — usado pelo filtro de
// Período do Relatório de Stoploss. Sem `asOf`, é o valor ao vivo de sempre.
export async function getStoplossAtual(clubeId: string, asOf?: Date): Promise<number> {
  const [baseClube, { data: historico }] = await Promise.all([
    asOf ? baseClubeAsOf(clubeId, asOf) : supabase.from('clubs').select(SELECT_BASE).eq('id', clubeId).single().then(r => r.data ?? { id: clubeId, stoploss_inicial: 0, caucao_atual: 0, ratio_caucao_stoploss: 1, hora_virada_semana: 2 }),
    supabase.from('stoploss_historico').select('valor_delta, escopo, criado_em').eq('clube_id', clubeId).in('tipo', TIPOS_QUE_SOMAM),
  ])
  const soma = somarHistorico((historico ?? []) as HistoricoRow[], baseClube.hora_virada_semana ?? 2, asOf)
  return calcularStoplossAtual(baseClube, soma)
}

export async function getStoplossAtualBatch(clubeIds: string[], asOf?: Date): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (clubeIds.length === 0) return mapa
  const [basesPorClube, { data: historico }] = await Promise.all([
    asOf ? basesClubesAsOf(clubeIds, asOf) : supabase.from('clubs').select(SELECT_BASE).in('id', clubeIds).then(r => new Map(((r.data ?? []) as ClubeBaseStoploss[]).map(c => [c.id, c]))),
    supabase.from('stoploss_historico').select('clube_id, valor_delta, escopo, criado_em').in('clube_id', clubeIds).in('tipo', TIPOS_QUE_SOMAM),
  ])
  const linhasPorClube = new Map<string, HistoricoRow[]>()
  for (const h of (historico ?? []) as HistoricoRow[]) {
    const lista = linhasPorClube.get(h.clube_id) ?? []
    lista.push(h)
    linhasPorClube.set(h.clube_id, lista)
  }
  for (const [id, c] of basesPorClube) {
    const soma = somarHistorico(linhasPorClube.get(id) ?? [], c.hora_virada_semana ?? 2, asOf)
    mapa.set(id, calcularStoplossAtual(c, soma))
  }
  return mapa
}

// Só a fatia de 1 tipo do Stoploss Atual, por clube — cada "coluna própria"
// da planilha manual do Cássio (Pre Payment, Bug PPPoker, Liberado pela
// Gerência, Margem de Monitoria) é uma fatia dessas, sem duplicar o total.
// Mesma lógica de asOf/soma que getStoplossAtualBatch, só filtrando 1 tipo
// em vez de todos os TIPOS_QUE_SOMAM.
async function getSomaTipoBatch(clubeIds: string[], tipo: string, asOf?: Date): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (clubeIds.length === 0) return mapa
  const [basesPorClube, { data: historico }] = await Promise.all([
    asOf ? basesClubesAsOf(clubeIds, asOf) : supabase.from('clubs').select(SELECT_BASE).in('id', clubeIds).then(r => new Map(((r.data ?? []) as ClubeBaseStoploss[]).map(c => [c.id, c]))),
    supabase.from('stoploss_historico').select('clube_id, valor_delta, escopo, criado_em').in('clube_id', clubeIds).eq('tipo', tipo),
  ])
  const linhasPorClube = new Map<string, HistoricoRow[]>()
  for (const h of (historico ?? []) as HistoricoRow[]) {
    const lista = linhasPorClube.get(h.clube_id) ?? []
    lista.push(h)
    linhasPorClube.set(h.clube_id, lista)
  }
  for (const [id, c] of basesPorClube) {
    mapa.set(id, somarHistorico(linhasPorClube.get(id) ?? [], c.hora_virada_semana ?? 2, asOf))
  }
  return mapa
}

export async function getAntecipacaoBatch(clubeIds: string[], asOf?: Date): Promise<Map<string, number>> {
  return getSomaTipoBatch(clubeIds, 'antecipacao', asOf)
}

// "Bug PPP" na planilha do Cássio — correções de rake/resultado errado
// reportado pela plataforma (ver aplicarAjusteBugPpp).
export async function getBugPppBatch(clubeIds: string[], asOf?: Date): Promise<Map<string, number>> {
  return getSomaTipoBatch(clubeIds, 'bug_ppp', asOf)
}

// "Liberado pela Gerência" na planilha do Cássio — ajuste do Suporte já
// aprovado pelo comitê/gerência (ver aprovarAjusteSuporte). Só o que já foi
// aprovado entra em stoploss_historico (pendente fica só em
// stoploss_ajustes), então essa soma já é exatamente "o que foi liberado".
export async function getLiberadoGerenciaBatch(clubeIds: string[], asOf?: Date): Promise<Map<string, number>> {
  return getSomaTipoBatch(clubeIds, 'ajuste_suporte', asOf)
}

// "Stop loss Margem Monitoria" na planilha do Cássio — o +10% de uso único
// (ver aplicarMargemMonitoria/retirarMargemMonitoria).
export async function getMargemMonitoriaBatch(clubeIds: string[], asOf?: Date): Promise<Map<string, number>> {
  return getSomaTipoBatch(clubeIds, 'margem_monitoria', asOf)
}

// Snapshot de caução/ratio de cada clube numa data — usado pelo Relatório de
// Stoploss pra mostrar essas colunas também "como estavam" quando o filtro
// de Período não é o atual (evita misturar Stoploss histórico com Caução de
// hoje na mesma linha, o que ficaria inconsistente).
export async function getBasesClubesAsOf(clubeIds: string[], asOf: Date): Promise<Map<string, ClubeBaseStoploss>> {
  return basesClubesAsOf(clubeIds, asOf)
}

// Líder do Suporte aplica direto, sem fila de aprovação — mas só uma vez
// por clube. Quem aprova ajuste normal (stoploss.aprovar) precisa "retirar"
// antes de poder aplicar de novo (ver retirarMargemMonitoria).
export async function aplicarMargemMonitoria(clubeId: string): Promise<void> {
  const { data: club } = await supabase.from('clubs').select('margem_monitoria_ativa').eq('id', clubeId).single()
  if (club?.margem_monitoria_ativa) {
    throw new Error('Margem de Monitoria já está em uso nesse clube — precisa ser retirada antes de aplicar de novo.')
  }
  const stoplossAtual = await getStoplossAtual(clubeId)
  const delta = Math.round(stoplossAtual * 0.10 * 100) / 100
  const { data: userData } = await supabase.auth.getUser()

  const { error: histErr } = await supabase.from('stoploss_historico').insert({
    clube_id: clubeId,
    tipo: 'margem_monitoria',
    escopo: 'permanente',
    valor_delta: delta,
    valor_resultante: stoplossAtual + delta,
    motivo: 'Margem de Monitoria (+10%, sem aprovação)',
    criado_por: userData.user?.id ?? null,
  })
  if (histErr) throw histErr

  const { error: clubErr } = await supabase.from('clubs').update({ margem_monitoria_ativa: true }).eq('id', clubeId)
  if (clubErr) throw clubErr
}

// "Bug do PPPoker": correção manual pra quando a plataforma reporta rake/
// resultado errado. Tratado como já liberado pela gerência — o Suporte
// lança direto, sem fila de aprovação (diferente do Ajuste normal).
export async function aplicarAjusteBugPpp(clubeId: string, natureza: 'credito' | 'debito', valor: number, descricao: string): Promise<void> {
  const stoplossAtual = await getStoplossAtual(clubeId)
  const delta = natureza === 'credito' ? valor : -valor
  const { data: userData } = await supabase.auth.getUser()

  const { error: histErr } = await supabase.from('stoploss_historico').insert({
    clube_id: clubeId,
    tipo: 'bug_ppp',
    escopo: 'permanente',
    valor_delta: delta,
    valor_resultante: stoplossAtual + delta,
    motivo: `Bug do PPPoker: ${descricao}`,
    criado_por: userData.user?.id ?? null,
  })
  if (histErr) throw histErr
}

// Reverte a Margem de Monitoria ativa (soma um delta negativo igual ao que
// foi aplicado) e libera o clube pra poder usar de novo numa próxima vez.
export async function retirarMargemMonitoria(clubeId: string): Promise<void> {
  const { data: historico } = await supabase
    .from('stoploss_historico')
    .select('valor_delta')
    .eq('clube_id', clubeId)
    .eq('tipo', 'margem_monitoria')
  const somaAtiva = (historico ?? []).reduce((s, h) => s + (h.valor_delta ?? 0), 0)
  if (somaAtiva === 0) {
    await supabase.from('clubs').update({ margem_monitoria_ativa: false }).eq('id', clubeId)
    return
  }
  const stoplossAtual = await getStoplossAtual(clubeId)
  const { data: userData } = await supabase.auth.getUser()

  const { error: histErr } = await supabase.from('stoploss_historico').insert({
    clube_id: clubeId,
    tipo: 'margem_monitoria',
    escopo: 'permanente',
    valor_delta: -somaAtiva,
    valor_resultante: stoplossAtual - somaAtiva,
    motivo: 'Margem de Monitoria retirada',
    criado_por: userData.user?.id ?? null,
  })
  if (histErr) throw histErr

  const { error: clubErr } = await supabase.from('clubs').update({ margem_monitoria_ativa: false }).eq('id', clubeId)
  if (clubErr) throw clubErr
}

// Aprovação de ajuste de gerência/comitê (fila normal) — quem aprova
// escolhe se o valor soma no Stoploss Inicial (permanente) ou vale só até a
// virada da semana desse clube (escopo 'semanal').
export async function aprovarAjusteSuporte(ajuste: StoplossAjuste, escopo: StoplossEscopo): Promise<void> {
  const stoplossAtual = await getStoplossAtual(ajuste.clube_id)
  const delta = ajuste.natureza === 'credito' ? ajuste.valor : -ajuste.valor
  const { data: userData } = await supabase.auth.getUser()

  const { error: updErr } = await supabase.from('stoploss_ajustes').update({
    status: 'aprovado', aprovado_por: userData.user?.id ?? null, aprovado_em: new Date().toISOString(),
  }).eq('id', ajuste.id)
  if (updErr) throw updErr

  const { error: histErr } = await supabase.from('stoploss_historico').insert({
    clube_id: ajuste.clube_id,
    tipo: 'ajuste_suporte',
    escopo,
    valor_delta: delta,
    valor_resultante: stoplossAtual + delta,
    motivo: ajuste.justificativa,
    ajuste_id: ajuste.id,
    criado_por: ajuste.criado_por,
  })
  if (histErr) throw histErr
}

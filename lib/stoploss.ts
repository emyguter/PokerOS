import { supabase } from './supabase'
import type { StoplossAjuste, StoplossEscopo } from './types'

// Tipos de stoploss_historico que entram na soma do Stoploss Atual —
// 'inicial' e 'caucao' ficam de fora de propósito: 'inicial' já é a base
// (clubs.stoploss_inicial) e 'caucao' virou recálculo ao vivo (caucao_atual
// × ratio), não soma incremental por evento.
const TIPOS_QUE_SOMAM = ['antecipacao', 'ajuste_suporte', 'margem_monitoria', 'bug_ppp'] as const

interface ClubeBaseStoploss {
  id: string
  stoploss_inicial: number | null
  caucao_atual: number | null
  ratio_caucao_stoploss: number | null
  hora_virada_semana: number | null
}

interface HistoricoRow {
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
function somarHistorico(rows: HistoricoRow[], horaVirada: number): number {
  const inicioSemana = inicioSemanaAtual(horaVirada)
  return rows.reduce((soma, h) => {
    if (h.escopo === 'semanal' && new Date(h.criado_em) < inicioSemana) return soma
    return soma + (h.valor_delta ?? 0)
  }, 0)
}

export function calcularStoplossAtual(club: ClubeBaseStoploss, somaHistorico: number): number {
  const inicial = club.stoploss_inicial ?? 0
  const ratio = club.ratio_caucao_stoploss ?? 1
  const contribuicaoCaucao = (club.caucao_atual ?? 0) * ratio
  return inicial + contribuicaoCaucao + somaHistorico
}

export async function getStoplossAtual(clubeId: string): Promise<number> {
  const [{ data: club }, { data: historico }] = await Promise.all([
    supabase.from('clubs').select(SELECT_BASE).eq('id', clubeId).single(),
    supabase.from('stoploss_historico').select('valor_delta, escopo, criado_em').eq('clube_id', clubeId).in('tipo', TIPOS_QUE_SOMAM),
  ])
  const baseClube = club ?? { id: clubeId, stoploss_inicial: 0, caucao_atual: 0, ratio_caucao_stoploss: 1, hora_virada_semana: 2 }
  const soma = somarHistorico((historico ?? []) as HistoricoRow[], baseClube.hora_virada_semana ?? 2)
  return calcularStoplossAtual(baseClube, soma)
}

export async function getStoplossAtualBatch(clubeIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (clubeIds.length === 0) return mapa
  const [{ data: clubes }, { data: historico }] = await Promise.all([
    supabase.from('clubs').select(SELECT_BASE).in('id', clubeIds),
    supabase.from('stoploss_historico').select('clube_id, valor_delta, escopo, criado_em').in('clube_id', clubeIds).in('tipo', TIPOS_QUE_SOMAM),
  ])
  const linhasPorClube = new Map<string, HistoricoRow[]>()
  for (const h of (historico ?? []) as HistoricoRow[]) {
    const lista = linhasPorClube.get(h.clube_id) ?? []
    lista.push(h)
    linhasPorClube.set(h.clube_id, lista)
  }
  for (const c of (clubes ?? []) as ClubeBaseStoploss[]) {
    const soma = somarHistorico(linhasPorClube.get(c.id) ?? [], c.hora_virada_semana ?? 2)
    mapa.set(c.id, calcularStoplossAtual(c, soma))
  }
  return mapa
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
// escolhe se o valor vira Stoploss Inicial (permanente) ou vale só até a
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

import { supabase } from './supabase'

// Tipos de stoploss_historico que entram na soma do Stoploss Atual —
// 'inicial' e 'caucao' ficam de fora de propósito: 'inicial' já é a base
// (clubs.stoploss_inicial) e 'caucao' virou recálculo ao vivo (caucao_atual
// × ratio), não soma incremental por evento.
const TIPOS_QUE_SOMAM = ['antecipacao', 'ajuste_suporte', 'margem_monitoria'] as const

interface ClubeBaseStoploss {
  id: string
  stoploss_inicial: number | null
  caucao_atual: number | null
  ratio_caucao_stoploss: number | null
}

const SELECT_BASE = 'id, stoploss_inicial, caucao_atual, ratio_caucao_stoploss'

export function calcularStoplossAtual(club: ClubeBaseStoploss, somaHistorico: number): number {
  const inicial = club.stoploss_inicial ?? 0
  const ratio = club.ratio_caucao_stoploss ?? 1
  const contribuicaoCaucao = (club.caucao_atual ?? 0) * ratio
  return inicial + contribuicaoCaucao + somaHistorico
}

export async function getStoplossAtual(clubeId: string): Promise<number> {
  const [{ data: club }, { data: historico }] = await Promise.all([
    supabase.from('clubs').select(SELECT_BASE).eq('id', clubeId).single(),
    supabase.from('stoploss_historico').select('valor_delta').eq('clube_id', clubeId).in('tipo', TIPOS_QUE_SOMAM),
  ])
  const soma = (historico ?? []).reduce((s, h) => s + (h.valor_delta ?? 0), 0)
  return calcularStoplossAtual(club ?? { id: clubeId, stoploss_inicial: 0, caucao_atual: 0, ratio_caucao_stoploss: 1 }, soma)
}

export async function getStoplossAtualBatch(clubeIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (clubeIds.length === 0) return mapa
  const [{ data: clubes }, { data: historico }] = await Promise.all([
    supabase.from('clubs').select(SELECT_BASE).in('id', clubeIds),
    supabase.from('stoploss_historico').select('clube_id, valor_delta').in('clube_id', clubeIds).in('tipo', TIPOS_QUE_SOMAM),
  ])
  const somaPorClube = new Map<string, number>()
  for (const h of historico ?? []) {
    somaPorClube.set(h.clube_id, (somaPorClube.get(h.clube_id) ?? 0) + (h.valor_delta ?? 0))
  }
  for (const c of (clubes ?? []) as ClubeBaseStoploss[]) {
    mapa.set(c.id, calcularStoplossAtual(c, somaPorClube.get(c.id) ?? 0))
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
    valor_delta: delta,
    valor_resultante: stoplossAtual + delta,
    motivo: 'Margem de Monitoria (+10%, sem aprovação)',
    criado_por: userData.user?.id ?? null,
  })
  if (histErr) throw histErr

  const { error: clubErr } = await supabase.from('clubs').update({ margem_monitoria_ativa: true }).eq('id', clubeId)
  if (clubErr) throw clubErr
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
    valor_delta: -somaAtiva,
    valor_resultante: stoplossAtual - somaAtiva,
    motivo: 'Margem de Monitoria retirada',
    criado_por: userData.user?.id ?? null,
  })
  if (histErr) throw histErr

  const { error: clubErr } = await supabase.from('clubs').update({ margem_monitoria_ativa: false }).eq('id', clubeId)
  if (clubErr) throw clubErr
}

import { supabase } from './supabase'
import type { StoplossAjuste, StoplossEscopo } from './types'

// Tipos de stoploss_historico que entram na soma do Stoploss Atual —
// 'inicial' e 'caucao' ficam de fora de propósito: 'inicial' já é a base
// (clubs.stoploss_inicial) e 'caucao' virou recálculo ao vivo (caucao_atual
// × ratio), não soma incremental por evento.
const TIPOS_QUE_SOMAM = ['antecipacao', 'ajuste_suporte', 'margem_monitoria', 'bug_ppp', 'corte_50'] as const

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

// "Ativa nessa semana" é calculado ao vivo (soma só o que ainda conta na
// semana atual, escopo 'semanal') em vez de confiar só na flag
// `clubs.margem_monitoria_ativa` — assim, quando a semana vira, a Margem
// zera sozinha (soma volta a 0) mesmo que ninguém tenha clicado em
// "Retirar" antes. A flag continua sendo atualizada (compatibilidade/
// exibição), mas não é mais a fonte de verdade do gate.
export async function margemMonitoriaAtivaEstaSemana(clubeId: string): Promise<boolean> {
  const soma = (await getSomaTipoBatch([clubeId], 'margem_monitoria')).get(clubeId) ?? 0
  return soma > 0
}

// Líder do Suporte aplica direto, sem fila de aprovação — mas só uma vez
// por semana por clube (ver margemMonitoriaAtivaEstaSemana). Escopo
// 'semanal': soma automaticamente na virada, sem precisar "Retirar" — o
// botão de retirar continua servindo pra cancelar antes da virada, se for engano.
export async function aplicarMargemMonitoria(clubeId: string): Promise<void> {
  if (await margemMonitoriaAtivaEstaSemana(clubeId)) {
    throw new Error('Margem de Monitoria já está em uso nesse clube essa semana — precisa ser retirada antes de aplicar de novo.')
  }
  const stoplossAtual = await getStoplossAtual(clubeId)
  const delta = Math.round(stoplossAtual * 0.10 * 100) / 100
  const { data: userData } = await supabase.auth.getUser()

  const { error: histErr } = await supabase.from('stoploss_historico').insert({
    clube_id: clubeId,
    tipo: 'margem_monitoria',
    escopo: 'semanal',
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
// lança direto, sem fila de aprovação (diferente do Ajuste normal). Escopo
// 'semanal': some sozinho na virada da semana, igual Pre Payment/Margem/
// Liberado pela Gerência. `dataLancamento` (opcional, padrão agora) decide
// EM QUE SEMANA o valor conta — lançar com uma data de semana já virada
// soma lá, não na semana atual (confirmado pelo Cássio).
export async function aplicarAjusteBugPpp(clubeId: string, natureza: 'credito' | 'debito', valor: number, descricao: string, dataLancamento?: Date): Promise<void> {
  const stoplossAtual = await getStoplossAtual(clubeId)
  const delta = natureza === 'credito' ? valor : -valor
  const { data: userData } = await supabase.auth.getUser()

  const { error: histErr } = await supabase.from('stoploss_historico').insert({
    clube_id: clubeId,
    tipo: 'bug_ppp',
    escopo: 'semanal',
    valor_delta: delta,
    valor_resultante: stoplossAtual + delta,
    motivo: `Bug do PPPoker: ${descricao}`,
    criado_por: userData.user?.id ?? null,
    criado_em: (dataLancamento ?? new Date()).toISOString(),
  })
  if (histErr) throw histErr
}

// Reverte a Margem de Monitoria ativa nessa semana (soma um delta negativo
// igual ao que foi aplicado) e libera o clube pra poder usar de novo antes
// da virada. Só soma o que ainda conta essa semana (escopo 'semanal') —
// margens de semanas passadas já saíram da conta sozinhas, não precisam
// (e não devem) ser somadas aqui de novo.
export async function retirarMargemMonitoria(clubeId: string): Promise<void> {
  const somaAtiva = (await getSomaTipoBatch([clubeId], 'margem_monitoria')).get(clubeId) ?? 0
  if (somaAtiva === 0) {
    await supabase.from('clubs').update({ margem_monitoria_ativa: false }).eq('id', clubeId)
    return
  }
  const stoplossAtual = await getStoplossAtual(clubeId)
  const { data: userData } = await supabase.auth.getUser()

  const { error: histErr } = await supabase.from('stoploss_historico').insert({
    clube_id: clubeId,
    tipo: 'margem_monitoria',
    escopo: 'semanal',
    valor_delta: -somaAtiva,
    valor_resultante: stoplossAtual - somaAtiva,
    motivo: 'Margem de Monitoria retirada',
    criado_por: userData.user?.id ?? null,
  })
  if (histErr) throw histErr

  const { error: clubErr } = await supabase.from('clubs').update({ margem_monitoria_ativa: false }).eq('id', clubeId)
  if (clubErr) throw clubErr
}

// "Acerto pendente — Corte 50%": corta o Stoploss Atual pela metade — como
// se fosse um débito de 50% lançado no Stoploss. Fica cortado até alguém
// clicar em "Reverter status" (ver reverterCorte50), que credita de volta o
// mesmo valor — os dois lados ficam registrados no Extrato de Stoploss.
// Igual Bug PPP, aplica direto, sem fila de aprovação.
export async function aplicarCorte50(clubeId: string): Promise<void> {
  const stoplossAtual = await getStoplossAtual(clubeId)
  const delta = -(Math.round(stoplossAtual * 0.5 * 100) / 100)
  const { data: userData } = await supabase.auth.getUser()

  const { error: histErr } = await supabase.from('stoploss_historico').insert({
    clube_id: clubeId,
    tipo: 'corte_50',
    escopo: 'permanente',
    valor_delta: delta,
    valor_resultante: stoplossAtual + delta,
    motivo: 'Acerto pendente: corte de 50% no Stoploss',
    criado_por: userData.user?.id ?? null,
  })
  if (histErr) throw histErr

  const { error: clubErr } = await supabase.from('clubs').update({ corte_50_ativo: true }).eq('id', clubeId)
  if (clubErr) throw clubErr
}

// Reverte o corte: credita de volta no Stoploss exatamente o que o(s)
// débito(s) de corte_50 ainda pendente(s) tiraram (soma líquida de todo o
// histórico tipo corte_50 desse clube — normalmente só 1 débito) e desliga o
// status. Fica registrado no Extrato de Stoploss como um crédito de 50%,
// simétrico ao débito que o corte lançou.
export async function reverterCorte50(clubeId: string): Promise<void> {
  const { data: historico } = await supabase
    .from('stoploss_historico')
    .select('valor_delta')
    .eq('clube_id', clubeId)
    .eq('tipo', 'corte_50')
  const netCorte50 = (historico ?? []).reduce((soma, h) => soma + (h.valor_delta ?? 0), 0)

  if (netCorte50 < 0) {
    const stoplossAtual = await getStoplossAtual(clubeId)
    const delta = -netCorte50
    const { data: userData } = await supabase.auth.getUser()

    const { error: histErr } = await supabase.from('stoploss_historico').insert({
      clube_id: clubeId,
      tipo: 'corte_50',
      escopo: 'permanente',
      valor_delta: delta,
      valor_resultante: stoplossAtual + delta,
      motivo: 'Corte de 50% revertido: crédito de volta no Stoploss',
      criado_por: userData.user?.id ?? null,
    })
    if (histErr) throw histErr
  }

  const { error: clubErr } = await supabase.from('clubs').update({ corte_50_ativo: false }).eq('id', clubeId)
  if (clubErr) throw clubErr
}

// "Acerto pendente — Bloquear": só sinaliza o clube (clubs.bloqueado) —
// não trava nada tecnicamente no sistema, é aviso pro time. Mesma função
// bloqueia/desbloqueia (toggle).
export async function setClubeBloqueado(clubeId: string, bloqueado: boolean): Promise<void> {
  const { error } = await supabase.from('clubs').update({ bloqueado }).eq('id', clubeId)
  if (error) throw error
}

// Aprovação de ajuste de gerência/comitê (fila normal) — quem aprova
// escolhe se o valor soma no Stoploss Inicial (permanente) ou vale só até a
// virada da semana desse clube (escopo 'semanal'). A semana que conta é a
// da DATA DO LANÇAMENTO original (ajuste.criado_em, escolhida por quem
// solicitou) — aprovar não muda isso pra "agora", só efetiva o valor.
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
    criado_em: ajuste.criado_em,
    criado_por: ajuste.criado_por,
  })
  if (histErr) throw histErr
}

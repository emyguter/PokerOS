import { supabase } from './supabase'
import { calcularTotalAcerto, buscarSecurityEDividasPorClube } from './relatorio-acerto'
import { diasDeAtraso, getFaixasMultaDoClube, valorComMulta } from './dividas'

export type TipoEnvio = 'pagamento' | 'antecipacao' | 'caucao'

export interface EnvioPagamento {
  id: string
  valor_assinado: number
  data_lancamento: string
  pago_crypto: boolean
  // Pagamento, Antecipação (conciliada) e Caução aparecem todos itemizados
  // como Envio — pedido do Cássio ("Caucao, pagamento e antecipancao TEM
  // QUE aparecer como envio"). Antes só Pagamento virava Envio de verdade;
  // Antecipação entrava só como um número resumido em Valor Pago e Caução
  // nem entrava na Diferença. `tipo` é só pra UI distinguir/rotular cada
  // coluna — o valor já vem assinado (crédito soma, débito subtrai) igual
  // pra qualquer um dos três.
  tipo: TipoEnvio
}

export interface AcertoPagamento {
  acerto_id: string
  club_id: string | null
  club_external_id: string
  club_name: string
  valor_acerto: number
  envios: EnvioPagamento[]
  valor_pago: number
  diferenca: number
  // Bônus + Promoção + Outro lançados no período — já entram em Valor do
  // Acerto (valorAcertoCompletoPorRow), isso aqui é só pra referência visual
  // separada (pedido do Cássio: "Bônus, promoção e outros aparece em
  // EXTRA"), não soma de novo em nada.
  extra: number
  // Projeto do clube (Mega Liga/Superliga/Liga/Clube — mesmo campo usado no
  // Stoploss) — só pra filtrar a tabela na tela, não entra em cálculo nenhum.
  projeto: string | null
}

interface AcertoRow {
  id: string
  club_external_id: string
  club_name: string
  valor_acerto: number
}

interface AcertoCompletoRow extends AcertoRow {
  club_id: string | null
  bilhetes: number
  indicacao_valor: number
  rake_total: number
}

interface PagamentoRow {
  id: string
  acerto_id: string
  natureza: 'credito' | 'debito'
  valor: number
  data_lancamento: string
  pago_crypto: boolean
  // Opcional só pra não quebrar lib/__tests__/pagamentos.test.ts (que monta
  // esses objetos à mão sem essa chave) — ausente = 'pagamento', o único
  // tipo que existia antes do Antecipação/Caução também virarem Envio.
  tipo?: TipoEnvio
}

interface LancamentoBrutoRow {
  id: string
  clube_id: string
  natureza: 'credito' | 'debito'
  valor: number
  data_lancamento: string
  pago_crypto: boolean
}

// Junta os Acertos de um import com os lançamentos tipo "pagamento" vinculados
// a cada um (os "Envios" da planilha do Cássio — Controle de Pagamentos).
// Mesma regra de sinal usada em todo o resto do app (ExtratoView, AcertosView,
// ClubAcertoCard): crédito soma, débito subtrai. Diferença = Valor do Acerto
// + Valor Pago (confirmado pelo Cássio) — Valor do Acerto já vem negativo
// quando o clube deve, então o Envio (positivo, crédito) soma por cima até
// zerar; usar subtração dobrava a dívida em vez de quitar.
export function agregarPagamentos(acertos: AcertoRow[], pagamentos: PagamentoRow[]): AcertoPagamento[] {
  const enviosPorAcerto = new Map<string, EnvioPagamento[]>()
  for (const p of pagamentos) {
    const lista = enviosPorAcerto.get(p.acerto_id) ?? []
    lista.push({
      id: p.id,
      valor_assinado: p.natureza === 'credito' ? p.valor : -p.valor,
      data_lancamento: p.data_lancamento,
      pago_crypto: p.pago_crypto,
      tipo: p.tipo ?? 'pagamento',
    })
    enviosPorAcerto.set(p.acerto_id, lista)
  }

  return acertos.map((a) => {
    const envios = enviosPorAcerto.get(a.id) ?? []
    const valor_pago = envios.reduce((s, e) => s + e.valor_assinado, 0)
    return {
      acerto_id: a.id,
      club_id: null,
      club_external_id: a.club_external_id,
      club_name: a.club_name,
      valor_acerto: a.valor_acerto,
      envios,
      valor_pago,
      diferenca: Math.round((a.valor_acerto + valor_pago) * 100) / 100,
      extra: 0,
      projeto: null,
    }
  })
}

// Valor do Acerto usado aqui pra calcular a Diferença é o COMPLETO — igual
// ao card "Common Settlement" e a lista de Acertos (lib/relatorio-acerto.ts,
// calcularTotalAcerto): Bilhetes, Segurança, Taxa A-A Home Game, Indicação,
// Lançamentos do período (Bônus/Promoção/Outro) e Dívidas/Acordos entram
// todos — confirmado pelo Cássio, nada pode ficar de fora, senão a Diferença
// de Cobrança/Controle de Pagamentos fica errada. Antecipação e Caução FICAM
// DE FORA daqui de propósito — as duas viram Envio itemizado (ver
// buscarAntecipacaoEnvios/buscarCaucaoEnvios abaixo), não escondidas dentro
// de "Valor do Acerto" — mesma lógica de "o que devia" vs "o que já foi
// adiantado/quitado" que a coluna Valor Pago já usa pra Envio de verdade.
// `extraPorClube` (Bônus+Promoção+Outro, já somado aqui dentro de Valor do
// Acerto) é devolvido separado só pra UI mostrar como referência na coluna
// "Extra" (pedido do Cássio) — não é somado de novo em nada.
async function valorAcertoCompletoPorRow(lista: AcertoCompletoRow[], periodStart: string, periodEnd: string): Promise<{ valorAcertoPorId: Map<string, number>; extraPorClube: Map<string, number> }> {
  const clubIds = [...new Set(lista.map((a) => a.club_id).filter((id): id is string => !!id))]
  const rakeTotalPorClube = new Map(lista.filter((a) => a.club_id).map((a) => [a.club_id as string, a.rake_total]))

  const [{ data: lancamentosData }, extrasPorClube] = await Promise.all([
    clubIds.length > 0 && periodStart
      ? supabase
          .from('lancamentos')
          .select('clube_id, natureza, valor')
          .in('clube_id', clubIds)
          .in('origem', ['suporte', 'seguranca'])
          .neq('tipo', 'caucao')
          // Antecipação já vira Envio itemizado (ver buscarAntecipacaoEnvios)
          // e Pagamento já quita o Acerto certo pelo acerto_id vinculado (ver
          // agregarPagamentos) — contar os dois de novo aqui dobra o valor
          // (mesmo bug do ClubAcertoCard/AcertosView, achado no CHIP COIN:
          // Antecipação de uma semana entrando 2x, e Pagamento que fechou a
          // semana anterior "vazando" pra essa por causa da data).
          .neq('tipo', 'antecipacao')
          .neq('tipo', 'pagamento')
          .gte('data_lancamento', periodStart)
          .lte('data_lancamento', periodEnd || periodStart)
      : Promise.resolve({ data: [] as { clube_id: string; natureza: 'credito' | 'debito'; valor: number }[] }),
    buscarSecurityEDividasPorClube(clubIds, periodEnd || periodStart, rakeTotalPorClube),
  ])

  const extraPorClube = new Map<string, number>()
  for (const l of (lancamentosData ?? []) as { clube_id: string; natureza: 'credito' | 'debito'; valor: number }[]) {
    extraPorClube.set(l.clube_id, (extraPorClube.get(l.clube_id) ?? 0) + (l.natureza === 'credito' ? l.valor : -l.valor))
  }

  const valorAcertoPorId = new Map<string, number>()
  for (const a of lista) {
    const extras = a.club_id ? extrasPorClube.get(a.club_id) : undefined
    valorAcertoPorId.set(a.id, calcularTotalAcerto(a.valor_acerto, {
      bilhetes: a.bilhetes,
      pendenciasAntecipacao: 0,
      security: extras?.security ?? 0,
      indicacaoValor: a.indicacao_valor,
      lancamentosLiquido: a.club_id ? extraPorClube.get(a.club_id) ?? 0 : 0,
      dividasTotal: extras?.dividasTotal ?? 0,
    }))
  }
  return { valorAcertoPorId, extraPorClube }
}

// Antecipação conciliada (mesmo filtro de buscarPendenciasAntecipacao em
// lib/acertos-engine.ts — só a copia aqui pegando as linhas cruas em vez de
// já somar, porque agora ela vira Envio itemizado, não mais um número só
// resumido em Valor Pago) e Caução lançadas no clube dentro do período do
// Acerto — ambas viram Envio (crédito soma, débito subtrai), igual Pagamento
// (pedido do Cássio: "Caucao, pagamento e antecipancao TEM QUE aparecer
// como envio"). Caução agora TAMBÉM quita Diferença (antes não entrava —
// confirmado pelo Cássio que essa é a mudança pretendida). `clube_id` é
// resolvido pro `acerto_id` certo pelo chamador (mapa 1 clube = 1 Acerto no
// período, ver acertoIdPorClube).
async function buscarAntecipacaoEnvios(clubIds: string[], periodStart: string, periodEnd: string): Promise<LancamentoBrutoRow[]> {
  if (clubIds.length === 0 || !periodStart) return []
  const { data } = await supabase
    .from('lancamentos')
    .select('id, clube_id, natureza, valor, data_lancamento, pago_crypto')
    .in('clube_id', clubIds)
    .eq('tipo', 'antecipacao')
    .eq('origem', 'suporte')
    .not('conciliado_com', 'is', null)
    .gte('data_lancamento', periodStart)
    .lte('data_lancamento', periodEnd || periodStart)
  return (data ?? []) as LancamentoBrutoRow[]
}

async function buscarCaucaoEnvios(clubIds: string[], periodStart: string, periodEnd: string): Promise<LancamentoBrutoRow[]> {
  if (clubIds.length === 0 || !periodStart) return []
  const { data } = await supabase
    .from('lancamentos')
    .select('id, clube_id, natureza, valor, data_lancamento, pago_crypto')
    .in('clube_id', clubIds)
    .eq('tipo', 'caucao')
    .gte('data_lancamento', periodStart)
    .lte('data_lancamento', periodEnd || periodStart)
  return (data ?? []) as LancamentoBrutoRow[]
}

// Resolve as linhas cruas de Antecipação/Caução (por clube) pro acerto_id
// certo e empacota como PagamentoRow — mesmo formato que o Pagamento de
// verdade usa, assim agregarPagamentos (puro, testado) nem precisa saber
// que existe Antecipação/Caução, só vê mais Envios chegando.
function converterParaEnvios(rows: LancamentoBrutoRow[], acertoIdPorClube: Map<string, string>, tipo: TipoEnvio): PagamentoRow[] {
  const resultado: PagamentoRow[] = []
  for (const r of rows) {
    const acertoId = acertoIdPorClube.get(r.clube_id)
    if (!acertoId) continue
    resultado.push({ id: r.id, acerto_id: acertoId, natureza: r.natureza, valor: r.valor, data_lancamento: r.data_lancamento, pago_crypto: r.pago_crypto, tipo })
  }
  return resultado
}

export async function buscarPagamentosPorImport(importId: string): Promise<AcertoPagamento[]> {
  const { data: acertos } = await supabase
    .from('acertos')
    .select('id, club_id, club_external_id, club_name, valor_acerto, bilhetes, indicacao_valor, rake_total')
    .eq('import_id', importId)
    .order('club_name')

  const lista = (acertos ?? []) as AcertoCompletoRow[]
  if (lista.length === 0) return []

  const { data: importInfo } = await supabase.from('imports').select('period_start, period_end').eq('id', importId).single()
  const clubIds = [...new Set(lista.map((a) => a.club_id).filter((id): id is string => !!id))]
  const periodStart = importInfo?.period_start ?? ''
  const periodEnd = importInfo?.period_end ?? ''

  const [{ data: pagamentosData }, { valorAcertoPorId, extraPorClube }, antecipacaoRows, caucaoRows, { data: clubesData }] = await Promise.all([
    supabase
      .from('lancamentos')
      .select('id, acerto_id, natureza, valor, data_lancamento, pago_crypto')
      .in('acerto_id', lista.map((a) => a.id))
      .eq('tipo', 'pagamento')
      // Conta só o lado Suporte, não o par da Genia — senão um Pagamento já
      // conciliado (que tem os dois lados com o mesmo acerto_id) dobra o
      // Valor Pago (achado no CHIP COIN: 2 Envios de -677,97 pro mesmo
      // Pagamento). Mesma regra já usada em buscarAntecipacaoEnvios.
      .eq('origem', 'suporte')
      .order('data_lancamento', { ascending: true }),
    valorAcertoCompletoPorRow(lista, periodStart, periodEnd),
    buscarAntecipacaoEnvios(clubIds, periodStart, periodEnd),
    buscarCaucaoEnvios(clubIds, periodStart, periodEnd),
    clubIds.length > 0 ? supabase.from('clubs').select('id, projeto').in('id', clubIds) : Promise.resolve({ data: [] }),
  ])
  const projetoPorClube = new Map((clubesData ?? []).map((c) => [c.id as string, c.projeto as string | null]))

  const listaCompleta: AcertoRow[] = lista.map((a) => ({ ...a, valor_acerto: valorAcertoPorId.get(a.id) ?? a.valor_acerto }))
  const clubIdPorAcertoId = new Map(lista.map((a) => [a.id, a.club_id]))
  const acertoIdPorClube = new Map(lista.filter((a) => a.club_id).map((a) => [a.club_id as string, a.id]))

  const pagamentos: PagamentoRow[] = [
    ...((pagamentosData ?? []) as PagamentoRow[]).map((p) => ({ ...p, tipo: 'pagamento' as const })),
    ...converterParaEnvios(antecipacaoRows, acertoIdPorClube, 'antecipacao'),
    ...converterParaEnvios(caucaoRows, acertoIdPorClube, 'caucao'),
  ].sort((a, b) => a.data_lancamento.localeCompare(b.data_lancamento))

  const resultado = agregarPagamentos(listaCompleta, pagamentos)
  return resultado.map((r) => {
    const clubId = clubIdPorAcertoId.get(r.acerto_id)
    return {
      ...r,
      club_id: clubId ?? null,
      extra: clubId ? extraPorClube.get(clubId) ?? 0 : 0,
      projeto: clubId ? projetoPorClube.get(clubId) ?? null : null,
    }
  })
}

// "Descontar da Caução": o que sobrou sem pagar no Acerto da semana
// (Diferença) vira desconto direto na Caução do clube — decisão do
// Suporte, já apurada, sem passar pela fila do Financeiro (diferente de um
// lançamento de Caução normal). Dois efeitos, os dois na hora:
//  1. Lançamento tipo "pagamento" (Envio) vinculado ao Acerto — quita a
//     Diferença igual um Envio de verdade teria feito, datado de hoje (é
//     quando a ação foi tomada de verdade).
//  2. Lançamento tipo "caucao" (débito) + caucao_atual do clube reduzido —
//     Stoploss Atual cai sozinho no próximo cálculo (é sempre recalculado
//     ao vivo a partir de caucao_atual, não precisa mexer em mais nada).
//     Esse datado do fim do período do Acerto (não hoje) — é o valor que
//     conta pra semana sendo quitada, mesma regra de "que semana o valor
//     conta" já usada no resto do Stoploss; sem isso o Envio de Caução no
//     Controle de Pagamentos/Cobrança nunca aparece pra semanas passadas
//     (o lançamento cai fora do período filtrado por buscarCaucaoEnvios).
export async function descontarDaCaucao(acertoId: string, clubeId: string, valor: number, dataPeriodo: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const hoje = new Date().toISOString().slice(0, 10)
  const criado_por = userData.user?.id ?? null

  const { error: pagamentoErr } = await supabase.from('lancamentos').insert({
    clube_id: clubeId, acerto_id: acertoId, tipo: 'pagamento', natureza: 'credito', valor,
    descricao: 'Descontado da Caução', data_lancamento: hoje,
    origem: 'suporte', status: null, criado_por,
  })
  if (pagamentoErr) throw pagamentoErr

  const { error: caucaoErr } = await supabase.from('lancamentos').insert({
    clube_id: clubeId, tipo: 'caucao', natureza: 'debito', valor,
    descricao: 'Acerto não pago', data_lancamento: dataPeriodo,
    origem: 'suporte', status: 'pago', criado_por,
  })
  if (caucaoErr) throw caucaoErr

  const { data: clube, error: clubeErr } = await supabase.from('clubs').select('caucao_atual').eq('id', clubeId).single()
  if (clubeErr) throw clubeErr
  const { error: updErr } = await supabase.from('clubs').update({ caucao_atual: (clube.caucao_atual ?? 0) - valor }).eq('id', clubeId)
  if (updErr) throw updErr
}

// "Rollover": a Diferença não paga da semana (clube deve) sai das Pendências
// sem descontar da Caução — só "rola" pra aparecer de novo como
// Pendência/Antecipação no PRÓXIMO Acerto desse clube (ver
// buscarRolloverPendente em lib/acertos-engine.ts, consumido só uma vez).
// `opts.comMulta` (pedido do Cássio: "vai liberar via rollover se vai
// cobrar ou não a multa") soma, uma vez só, a Multa da Regra do clube —
// mesma Regra usada em Dívidas/Acordos (getFaixasMultaDoClube/valorComMulta
// em lib/dividas.ts) — sobre o valor rolado; NÃO vira Dívida/Acordo de
// verdade nem recalcula toda semana enquanto atrasado (decisão do Cássio:
// "continua Rollover, multa somada uma vez"). Atraso contado do fim do
// período do Acerto que gerou a Diferença (`opts.periodoFim`) até hoje. Sem
// Regra de Multa cadastrada pro clube, dá 0% — sem mudança nenhuma (igual
// sempre foi, sem `opts`). Dois efeitos, os dois na hora:
//  1. Lançamento tipo "pagamento" (Envio) vinculado a ESSE Acerto — quita a
//     Diferença ORIGINAL (sem multa) agora, igual um Envio de verdade teria
//     feito.
//  2. Lançamento tipo "antecipacao" SEM acerto_id (natureza "debito", pesa
//     contra o clube) — valor original + multa (se `comMulta`) — fica
//     esperando o motor pegar no próximo cálculo.
export async function rolloverAcerto(acertoId: string, clubeId: string, valor: number, opts?: { comMulta: boolean; periodoFim: string }): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const hoje = new Date().toISOString().slice(0, 10)
  const criado_por = userData.user?.id ?? null

  const { error: pagamentoErr } = await supabase.from('lancamentos').insert({
    clube_id: clubeId, acerto_id: acertoId, tipo: 'pagamento', natureza: 'credito', valor,
    descricao: 'Rollover', data_lancamento: hoje,
    origem: 'suporte', status: null, criado_por,
  })
  if (pagamentoErr) throw pagamentoErr

  let valorRolado = valor
  if (opts?.comMulta) {
    const faixas = await getFaixasMultaDoClube(clubeId)
    const atraso = diasDeAtraso(opts.periodoFim)
    valorRolado = valorComMulta(valor, atraso, faixas)
  }

  const { error: rolloverErr } = await supabase.from('lancamentos').insert({
    clube_id: clubeId, tipo: 'antecipacao', natureza: 'debito', valor: valorRolado,
    descricao: 'Rollover', data_lancamento: hoje,
    origem: 'suporte', status: null, criado_por,
  })
  if (rolloverErr) throw rolloverErr
}

// Simétrico ao Rollover acima, pro lado CRÉDITO: Diferença POSITIVA (a Liga
// deve ao clube) que não foi toda paga na semana — "fica como antecipação
// na semana seguinte" (pedido do Cássio), sem opção de multa (não faz
// sentido multar a Liga por um atraso que não é do clube). Mesmo mecanismo
// de consumo único do débito (buscarRolloverPendente: filtra só por
// descricao='Rollover', soma crédito e débito com o sinal certo, então já
// funciona sem mudança nenhuma nele). Dois efeitos, os dois na hora:
//  1. Lançamento tipo "pagamento" (Envio) vinculado a ESSE Acerto, natureza
//     "debito" — zera a Diferença POSITIVA de agora (Envio débito subtrai
//     de Valor Pago, mesma regra de sinal usada em todo o resto do app).
//  2. Lançamento tipo "antecipacao" SEM acerto_id, natureza "credito" — fica
//     esperando o motor pegar no próximo cálculo, somando A FAVOR do clube.
export async function rolloverCredito(acertoId: string, clubeId: string, valor: number): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const hoje = new Date().toISOString().slice(0, 10)
  const criado_por = userData.user?.id ?? null

  const { error: pagamentoErr } = await supabase.from('lancamentos').insert({
    clube_id: clubeId, acerto_id: acertoId, tipo: 'pagamento', natureza: 'debito', valor,
    descricao: 'Rollover', data_lancamento: hoje,
    origem: 'suporte', status: null, criado_por,
  })
  if (pagamentoErr) throw pagamentoErr

  const { error: rolloverErr } = await supabase.from('lancamentos').insert({
    clube_id: clubeId, tipo: 'antecipacao', natureza: 'credito', valor,
    descricao: 'Rollover', data_lancamento: hoje,
    origem: 'suporte', status: null, criado_por,
  })
  if (rolloverErr) throw rolloverErr
}

// `AcertoPagamento.diferenca` (valor_acerto + valor_pago) é sempre guardado
// do ponto de vista do CLUBE — mesmo sinal usado em todo o resto do app
// (totais.valor_acerto em AcertosView etc): positivo = o clube vai receber,
// negativo = o clube precisa pagar. O Suporte usa esse número direto (é
// literalmente a visão do clube). O Financeiro pensa do ponto de vista da
// liga — o oposto: o que o clube recebe é o que a liga paga, e vice-versa —
// então passa por `diferencaDaLiga` antes de exibir/colorir. Com isso,
// `corDiferenca` fica uma função só, sem parâmetro de perspectiva: positivo
// é sempre azul (o lado de quem está olhando vai receber), negativo é
// sempre vermelho (precisa pagar) — quem muda é o número que cada tela passa.
export type CorDiferenca = 'quitado' | 'azul' | 'vermelho'

export function corDiferenca(diferenca: number): CorDiferenca {
  if (Math.abs(diferenca) < 0.005) return 'quitado'
  return diferenca > 0 ? 'azul' : 'vermelho'
}

// Espelha a Diferença do clube (Suporte) pra visão da liga (Financeiro) —
// confirmado pelo Cássio: sinal E cor precisam ser diferentes entre as duas
// telas pro mesmo Acerto, porque representam lados opostos da mesma conta.
export function diferencaDaLiga(diferencaDoClube: number): number {
  return -diferencaDoClube
}

export interface ImportResumo {
  id: string
  file_name: string
  period_start: string
  period_end: string
  // Quando o import foi de fato feito na Central de Importação — diferente
  // de period_start/period_end, que é a semana que os DADOS cobrem. Usado só
  // pro filtro "Data do import" (achar o import pela data que foi subido,
  // não pela semana que ele representa).
  created_at: string
  // Carimbo da Conferência do App (ver lib/conferencia.ts) — quando o
  // Suporte confirmou que Rake/Ganhos batem com o que vê direto na
  // plataforma. null = ainda não conferiu essa semana.
  conferido_em: string | null
}

// Últimos imports com Acerto calculado — só esses fazem sentido pra
// Controle de Pagamentos/Cobrança (sem acerto calculado não tem o que cobrar).
// Limite mais alto que o normal (500) de propósito: o filtro de Data do
// Import precisa conseguir achar imports mais antigos, não só os recentes.
export async function buscarImportsComAcerto(): Promise<ImportResumo[]> {
  const { data } = await supabase
    .from('imports')
    .select('id, file_name, period_start, period_end, created_at, conferido_em')
    .in('status', ['acertos_calculados', 'parcial'])
    .order('period_start', { ascending: false })
    .limit(500)
  return (data ?? []) as ImportResumo[]
}

export interface PeriodoPagamento {
  inicio: string
  fim: string
}

// Uma Liga = um import por semana — buscarImportsComAcerto (acima) traz um
// registro por import, então a mesma semana aparecia repetida no seletor
// (uma vez por Liga). Controle de Pagamentos/Cobrança pedem pra olhar a
// semana inteira, não uma Liga isolada — aqui agrupa por period_end e some
// as duplicatas, cada semana aparece 1 vez só.
export async function buscarPeriodosComAcerto(): Promise<PeriodoPagamento[]> {
  const { data } = await supabase
    .from('imports')
    .select('period_start, period_end')
    .in('status', ['acertos_calculados', 'parcial'])
    .not('period_end', 'is', null)
    .order('period_end', { ascending: false })
    .limit(500)
  const vistos = new Set<string>()
  const lista: PeriodoPagamento[] = []
  for (const row of (data ?? []) as { period_start: string | null; period_end: string }[]) {
    if (vistos.has(row.period_end)) continue
    vistos.add(row.period_end)
    lista.push({ inicio: row.period_start ?? row.period_end, fim: row.period_end })
  }
  return lista
}

// Mesma lógica de buscarPagamentosPorImport, só que pra TODOS os imports
// (todas as Ligas) da mesma semana de uma vez, não um import isolado —
// junta os club_id de cada Liga numa lista só de Acertos da semana.
export async function buscarPagamentosPorPeriodo(periodoInicio: string, periodoFim: string): Promise<AcertoPagamento[]> {
  const { data: importsData } = await supabase.from('imports').select('id').eq('period_end', periodoFim)
  const importIds = (importsData ?? []).map((i) => i.id as string)
  if (importIds.length === 0) return []

  const { data: acertos } = await supabase
    .from('acertos')
    .select('id, club_id, club_external_id, club_name, valor_acerto, bilhetes, indicacao_valor, rake_total')
    .in('import_id', importIds)
    .order('club_name')

  const lista = (acertos ?? []) as AcertoCompletoRow[]
  if (lista.length === 0) return []

  const clubIds = [...new Set(lista.map((a) => a.club_id).filter((id): id is string => !!id))]

  const [{ data: pagamentosData }, { valorAcertoPorId, extraPorClube }, antecipacaoRows, caucaoRows, { data: clubesData }] = await Promise.all([
    supabase
      .from('lancamentos')
      .select('id, acerto_id, natureza, valor, data_lancamento, pago_crypto')
      .in('acerto_id', lista.map((a) => a.id))
      .eq('tipo', 'pagamento')
      // Conta só o lado Suporte, não o par da Genia — senão um Pagamento já
      // conciliado (que tem os dois lados com o mesmo acerto_id) dobra o
      // Valor Pago (achado no CHIP COIN: 2 Envios de -677,97 pro mesmo
      // Pagamento). Mesma regra já usada em buscarAntecipacaoEnvios.
      .eq('origem', 'suporte')
      .order('data_lancamento', { ascending: true }),
    valorAcertoCompletoPorRow(lista, periodoInicio, periodoFim),
    buscarAntecipacaoEnvios(clubIds, periodoInicio, periodoFim),
    buscarCaucaoEnvios(clubIds, periodoInicio, periodoFim),
    clubIds.length > 0 ? supabase.from('clubs').select('id, projeto').in('id', clubIds) : Promise.resolve({ data: [] }),
  ])
  const projetoPorClube = new Map((clubesData ?? []).map((c) => [c.id as string, c.projeto as string | null]))

  const listaCompleta: AcertoRow[] = lista.map((a) => ({ ...a, valor_acerto: valorAcertoPorId.get(a.id) ?? a.valor_acerto }))
  const clubIdPorAcertoId = new Map(lista.map((a) => [a.id, a.club_id]))
  const acertoIdPorClube = new Map(lista.filter((a) => a.club_id).map((a) => [a.club_id as string, a.id]))

  const pagamentos: PagamentoRow[] = [
    ...((pagamentosData ?? []) as PagamentoRow[]).map((p) => ({ ...p, tipo: 'pagamento' as const })),
    ...converterParaEnvios(antecipacaoRows, acertoIdPorClube, 'antecipacao'),
    ...converterParaEnvios(caucaoRows, acertoIdPorClube, 'caucao'),
  ].sort((a, b) => a.data_lancamento.localeCompare(b.data_lancamento))

  const resultado = agregarPagamentos(listaCompleta, pagamentos)
  return resultado.map((r) => {
    const clubId = clubIdPorAcertoId.get(r.acerto_id)
    return {
      ...r,
      club_id: clubId ?? null,
      extra: clubId ? extraPorClube.get(clubId) ?? 0 : 0,
      projeto: clubId ? projetoPorClube.get(clubId) ?? null : null,
    }
  })
}

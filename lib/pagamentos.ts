import { supabase } from './supabase'
import { calcularTotalAcerto, buscarSecurityEDividasPorClube } from './relatorio-acerto'

export interface EnvioPagamento {
  id: string
  valor_assinado: number
  data_lancamento: string
}

export interface AcertoPagamento {
  acerto_id: string
  club_external_id: string
  club_name: string
  valor_acerto: number
  envios: EnvioPagamento[]
  valor_pago: number
  diferenca: number
  // Caução lançada no período — só referência (igual na planilha do
  // Cássio), não entra na soma de Envios nem na Diferença: Caução vive na
  // própria conta dela (alimenta o Stoploss), misturar bagunça as duas
  // contas — mesma regra já usada em Acertos/ClubAcertoCard. Preenchido só
  // por buscarPagamentosPorImport (agregarPagamentos não sabe de Caução,
  // continua puro/testável do jeito que já era).
  caucao: number
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
  pendencias_antecipacao: number
  indicacao_valor: number
}

interface PagamentoRow {
  id: string
  acerto_id: string
  natureza: 'credito' | 'debito'
  valor: number
  data_lancamento: string
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
    })
    enviosPorAcerto.set(p.acerto_id, lista)
  }

  return acertos.map((a) => {
    const envios = enviosPorAcerto.get(a.id) ?? []
    const valor_pago = envios.reduce((s, e) => s + e.valor_assinado, 0)
    return {
      acerto_id: a.id,
      club_external_id: a.club_external_id,
      club_name: a.club_name,
      valor_acerto: a.valor_acerto,
      envios,
      valor_pago,
      diferenca: Math.round((a.valor_acerto + valor_pago) * 100) / 100,
      caucao: 0,
      projeto: null,
    }
  })
}

// Valor do Acerto usado aqui pra calcular a Diferença é o COMPLETO — igual
// ao card "Common Settlement" e a lista de Acertos (lib/relatorio-acerto.ts,
// calcularTotalAcerto): Bilhetes, Pendências/Antecipação, Segurança, Taxa
// A-A Home Game, Indicação, Lançamentos do período (Bônus/Promoção/Outro) e
// Dívidas/Acordos entram todos — confirmado pelo Cássio, nada pode ficar de
// fora, senão a Diferença de Cobrança/Controle de Pagamentos fica errada.
async function valorAcertoCompletoPorRow(lista: AcertoCompletoRow[], periodStart: string, periodEnd: string): Promise<Map<string, number>> {
  const clubIds = [...new Set(lista.map((a) => a.club_id).filter((id): id is string => !!id))]

  const [{ data: lancamentosData }, extrasPorClube] = await Promise.all([
    clubIds.length > 0 && periodStart
      ? supabase
          .from('lancamentos')
          .select('clube_id, natureza, valor')
          .in('clube_id', clubIds)
          .in('origem', ['suporte', 'seguranca'])
          .neq('tipo', 'caucao')
          .gte('data_lancamento', periodStart)
          .lte('data_lancamento', periodEnd || periodStart)
      : Promise.resolve({ data: [] as { clube_id: string; natureza: 'credito' | 'debito'; valor: number }[] }),
    buscarSecurityEDividasPorClube(clubIds, periodEnd || periodStart),
  ])

  const lancamentosPorClube = new Map<string, number>()
  for (const l of (lancamentosData ?? []) as { clube_id: string; natureza: 'credito' | 'debito'; valor: number }[]) {
    lancamentosPorClube.set(l.clube_id, (lancamentosPorClube.get(l.clube_id) ?? 0) + (l.natureza === 'credito' ? l.valor : -l.valor))
  }

  const mapa = new Map<string, number>()
  for (const a of lista) {
    const extras = a.club_id ? extrasPorClube.get(a.club_id) : undefined
    mapa.set(a.id, calcularTotalAcerto(a.valor_acerto, {
      bilhetes: a.bilhetes,
      pendenciasAntecipacao: a.pendencias_antecipacao,
      security: extras?.security ?? 0,
      indicacaoValor: a.indicacao_valor,
      lancamentosLiquido: a.club_id ? lancamentosPorClube.get(a.club_id) ?? 0 : 0,
      dividasTotal: extras?.dividasTotal ?? 0,
    }))
  }
  return mapa
}

// Caução lançada no clube dentro do período do Acerto — só pra referência
// no Controle de Pagamentos (Suporte), igual na planilha do Cássio (coluna
// "Caução" separada, entre Acerto e os Envios). Não entra em Diferença.
async function caucaoPorClube(clubIds: string[], periodStart: string, periodEnd: string): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (clubIds.length === 0 || !periodStart) return mapa
  const { data } = await supabase
    .from('lancamentos')
    .select('clube_id, natureza, valor')
    .in('clube_id', clubIds)
    .eq('tipo', 'caucao')
    .gte('data_lancamento', periodStart)
    .lte('data_lancamento', periodEnd || periodStart)
  for (const l of (data ?? []) as { clube_id: string; natureza: 'credito' | 'debito'; valor: number }[]) {
    mapa.set(l.clube_id, (mapa.get(l.clube_id) ?? 0) + (l.natureza === 'credito' ? l.valor : -l.valor))
  }
  return mapa
}

export async function buscarPagamentosPorImport(importId: string): Promise<AcertoPagamento[]> {
  const { data: acertos } = await supabase
    .from('acertos')
    .select('id, club_id, club_external_id, club_name, valor_acerto, bilhetes, pendencias_antecipacao, indicacao_valor')
    .eq('import_id', importId)
    .order('club_name')

  const lista = (acertos ?? []) as AcertoCompletoRow[]
  if (lista.length === 0) return []

  const { data: importInfo } = await supabase.from('imports').select('period_start, period_end').eq('id', importId).single()
  const clubIds = [...new Set(lista.map((a) => a.club_id).filter((id): id is string => !!id))]

  const [{ data: pagamentos }, valorCompletoPorId, caucaoPorId, { data: clubesData }] = await Promise.all([
    supabase
      .from('lancamentos')
      .select('id, acerto_id, natureza, valor, data_lancamento')
      .in('acerto_id', lista.map((a) => a.id))
      .in('tipo', ['pagamento', 'antecipacao'])
      .order('data_lancamento', { ascending: true }),
    valorAcertoCompletoPorRow(lista, importInfo?.period_start ?? '', importInfo?.period_end ?? ''),
    caucaoPorClube(clubIds, importInfo?.period_start ?? '', importInfo?.period_end ?? ''),
    clubIds.length > 0 ? supabase.from('clubs').select('id, projeto').in('id', clubIds) : Promise.resolve({ data: [] }),
  ])
  const projetoPorClube = new Map((clubesData ?? []).map((c) => [c.id as string, c.projeto as string | null]))

  const listaCompleta: AcertoRow[] = lista.map((a) => ({ ...a, valor_acerto: valorCompletoPorId.get(a.id) ?? a.valor_acerto }))
  const clubIdPorAcertoId = new Map(lista.map((a) => [a.id, a.club_id]))

  const resultado = agregarPagamentos(listaCompleta, (pagamentos ?? []) as PagamentoRow[])
  return resultado.map((r) => {
    const clubId = clubIdPorAcertoId.get(r.acerto_id)
    return {
      ...r,
      caucao: clubId ? caucaoPorId.get(clubId) ?? 0 : 0,
      projeto: clubId ? projetoPorClube.get(clubId) ?? null : null,
    }
  })
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
}

// Últimos imports com Acerto calculado — só esses fazem sentido pra
// Controle de Pagamentos/Cobrança (sem acerto calculado não tem o que cobrar).
// Limite mais alto que o normal (500) de propósito: o filtro de Data do
// Import precisa conseguir achar imports mais antigos, não só os recentes.
export async function buscarImportsComAcerto(): Promise<ImportResumo[]> {
  const { data } = await supabase
    .from('imports')
    .select('id, file_name, period_start, period_end, created_at')
    .in('status', ['acertos_calculados', 'parcial'])
    .order('period_start', { ascending: false })
    .limit(500)
  return (data ?? []) as ImportResumo[]
}

import { supabase } from './supabase'

export type TipoDivida = 'simples' | 'acordo'
export type StatusDivida = 'ativo' | 'quitado' | 'cancelado'

export interface ParcelaCalculada {
  numero: number
  valor: number
  vencimento: string
}

export interface CalculoAcordoInput {
  valorIntegral: number
  jurosAtivo: boolean
  jurosPct: number | null
  quantidadeParcelas: number
  pagamentoMinimo: number | null
  dataPrimeiraParcela: string
}

export interface CalculoAcordoResultado {
  valorComJuros: number
  valorParcela: number
  quantidadeParcelasFinal: number
  usouPagamentoMinimo: boolean
  parcelas: ParcelaCalculada[]
}

function arredonda(v: number): number {
  return Math.round(v * 100) / 100
}

// Juros (se ativo) incide uma vez sobre o valor integral, antes de dividir
// pelas parcelas — não é juros composto por parcela. Pagamento Mínimo é o
// piso: se valor÷parcelas der menos que o mínimo, usa o mínimo e recalcula
// quantas parcelas são necessárias pra fechar o valor total (confirmado
// pelo Cássio). A última parcela absorve a sobra de arredondamento pra
// soma bater certinho com o valor com juros.
export function calcularAcordo(input: CalculoAcordoInput): CalculoAcordoResultado {
  const valorComJuros = input.jurosAtivo && input.jurosPct
    ? arredonda(input.valorIntegral * (1 + input.jurosPct / 100))
    : input.valorIntegral

  const parcelaBruta = valorComJuros / input.quantidadeParcelas
  const usouPagamentoMinimo = !!input.pagamentoMinimo && input.pagamentoMinimo > 0 && parcelaBruta < input.pagamentoMinimo
  const valorParcela = usouPagamentoMinimo ? (input.pagamentoMinimo as number) : arredonda(parcelaBruta)
  const quantidadeParcelasFinal = usouPagamentoMinimo
    ? Math.ceil(valorComJuros / (input.pagamentoMinimo as number))
    : input.quantidadeParcelas

  const parcelas: ParcelaCalculada[] = []
  let somaAnterior = 0
  for (let i = 1; i <= quantidadeParcelasFinal; i++) {
    const ultima = i === quantidadeParcelasFinal
    const valor = ultima ? arredonda(valorComJuros - somaAnterior) : valorParcela
    somaAnterior = arredonda(somaAnterior + valor)
    const vencimento = new Date(input.dataPrimeiraParcela + 'T00:00:00')
    vencimento.setDate(vencimento.getDate() + (i - 1) * 7)
    parcelas.push({ numero: i, valor, vencimento: vencimento.toISOString().slice(0, 10) })
  }

  return { valorComJuros, valorParcela, quantidadeParcelasFinal, usouPagamentoMinimo, parcelas }
}

export interface FaixaMulta {
  quantidade: number
  unidade: 'dias' | 'semanas'
  percentual: number
}

function faixaEmDias(f: FaixaMulta): number {
  return f.unidade === 'semanas' ? f.quantidade * 7 : f.quantidade
}

// A maior faixa cujo limiar já foi atingido substitui as anteriores (não
// acumula) — confirmado pelo Cássio: 2 semanas de atraso usa só o % da
// faixa "2 semanas", não soma com o da faixa "1 semana".
export function percentualMulta(diasDeAtraso: number, faixas: FaixaMulta[]): number {
  const aplicaveis = faixas
    .filter((f) => diasDeAtraso >= faixaEmDias(f))
    .sort((a, b) => faixaEmDias(b) - faixaEmDias(a))
  return aplicaveis[0]?.percentual ?? 0
}

// Multa incide sobre o valor da parcela atrasada, não sobre o saldo
// integral do Acordo (confirmado pelo Cássio).
export function valorComMulta(valorParcela: number, diasDeAtraso: number, faixas: FaixaMulta[]): number {
  const pct = percentualMulta(diasDeAtraso, faixas)
  return arredonda(valorParcela * (1 + pct / 100))
}

export function diasDeAtraso(vencimento: string, hoje: Date = new Date()): number {
  const venc = new Date(vencimento + 'T00:00:00')
  const diff = Math.floor((hoje.getTime() - venc.getTime()) / 86400000)
  return Math.max(0, diff)
}

export interface DividaRow {
  id: string
  clube_id: string
  clube_nome: string
  tipo: TipoDivida
  valor_integral: number
  descricao: string | null
  status: StatusDivida
  pagamento_minimo: number | null
  quantidade_parcelas: number | null
  juros_ativo: boolean
  juros_pct: number | null
  data_primeira_parcela: string | null
  criado_em: string
}

export interface DividaForm {
  clube_id: string
  tipo: TipoDivida
  valor_integral: number
  descricao: string | null
  pagamento_minimo: number | null
  quantidade_parcelas: number | null
  juros_ativo: boolean
  juros_pct: number | null
  data_primeira_parcela: string | null
}

export interface ParcelaRow {
  id: string
  numero: number
  valor: number
  vencimento: string
  pago: boolean
  pago_em: string | null
  valor_pago: number | null
}

export async function getDividas(): Promise<DividaRow[]> {
  const { data, error } = await supabase
    .from('dividas')
    .select('id, clube_id, tipo, valor_integral, descricao, status, pagamento_minimo, quantidade_parcelas, juros_ativo, juros_pct, data_primeira_parcela, criado_em, clubs(name)')
    .order('criado_em', { ascending: false })
  if (error) throw error
  return (data ?? []).map((d) => {
    const row = d as unknown as DividaRow & { clubs: { name: string } | null }
    return { ...row, clube_nome: row.clubs?.name ?? '—' }
  })
}

export async function getParcelas(dividaId: string): Promise<ParcelaRow[]> {
  const { data, error } = await supabase
    .from('divida_parcelas')
    .select('id, numero, valor, vencimento, pago, pago_em, valor_pago')
    .eq('divida_id', dividaId)
    .order('numero')
  if (error) throw error
  return data ?? []
}

export async function criarDivida(form: DividaForm): Promise<string> {
  const { data: userData } = await supabase.auth.getUser()
  const { data: nova, error } = await supabase
    .from('dividas')
    .insert({ ...form, criado_por: userData.user?.id ?? null })
    .select('id')
    .single()
  if (error) throw error

  if (form.tipo === 'acordo' && form.quantidade_parcelas && form.data_primeira_parcela) {
    const resultado = calcularAcordo({
      valorIntegral: form.valor_integral,
      jurosAtivo: form.juros_ativo,
      jurosPct: form.juros_pct,
      quantidadeParcelas: form.quantidade_parcelas,
      pagamentoMinimo: form.pagamento_minimo,
      dataPrimeiraParcela: form.data_primeira_parcela,
    })
    const { error: parcelasErr } = await supabase.from('divida_parcelas').insert(
      resultado.parcelas.map((p) => ({ divida_id: nova.id, numero: p.numero, valor: p.valor, vencimento: p.vencimento }))
    )
    if (parcelasErr) throw parcelasErr
  }

  return nova.id
}

export async function marcarParcelaPaga(parcelaId: string, valorPago: number): Promise<void> {
  const { error } = await supabase
    .from('divida_parcelas')
    .update({ pago: true, pago_em: new Date().toISOString(), valor_pago: valorPago })
    .eq('id', parcelaId)
  if (error) throw error
}

export async function atualizarStatusDivida(dividaId: string, status: StatusDivida): Promise<void> {
  const { error } = await supabase.from('dividas').update({ status }).eq('id', dividaId)
  if (error) throw error
}

export async function excluirDivida(dividaId: string): Promise<void> {
  const { error } = await supabase.from('dividas').delete().eq('id', dividaId)
  if (error) throw error
}

// Regra de Multa vinculada ao clube (regra_entidades, tipo 'multa_atraso')
// — mesma amarração de Faixa SE/ENTÃO, só filtrando pelo tipo novo.
export async function getFaixasMultaDoClube(clubeId: string): Promise<FaixaMulta[]> {
  const { data } = await supabase
    .from('regra_entidades')
    .select('regras(tipo, regra_multa_faixas(quantidade, unidade, percentual))')
    .eq('entidade_tipo', 'clube')
    .eq('entidade_id', clubeId)
  const linhas = (data ?? []) as unknown as { regras: { tipo: string; regra_multa_faixas: FaixaMulta[] } | null }[]
  return linhas
    .filter((l) => l.regras?.tipo === 'multa_atraso')
    .flatMap((l) => l.regras?.regra_multa_faixas ?? [])
}

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
  // Só é lido de verdade pro tipo 'simples' (Acordo controla por parcela, ver
  // ParcelaRow) — se o valor integral desconta do Rake toda semana até
  // marcar quitada, ou se é cobrado por fora.
  pago_com_rake: boolean
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
  pago_com_rake: boolean
}

export interface ParcelaRow {
  id: string
  numero: number
  valor: number
  vencimento: string
  pago: boolean
  pago_em: string | null
  valor_pago: number | null
  pago_com_rake: boolean
}

export async function getDividas(): Promise<DividaRow[]> {
  const { data, error } = await supabase
    .from('dividas')
    .select('id, clube_id, tipo, valor_integral, descricao, status, pagamento_minimo, quantidade_parcelas, juros_ativo, juros_pct, data_primeira_parcela, pago_com_rake, criado_em, clubs(name)')
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
    .select('id, numero, valor, vencimento, pago, pago_em, valor_pago, pago_com_rake')
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
    // Todas as parcelas nascem com o mesmo "Pagar com Rake?" escolhido na
    // criação — dá pra ajustar parcela a parcela depois, na tela de Dívidas.
    const { error: parcelasErr } = await supabase.from('divida_parcelas').insert(
      resultado.parcelas.map((p) => ({ divida_id: nova.id, numero: p.numero, valor: p.valor, vencimento: p.vencimento, pago_com_rake: form.pago_com_rake }))
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

export async function atualizarParcelaPagoComRake(parcelaId: string, pagoComRake: boolean): Promise<void> {
  const { error } = await supabase.from('divida_parcelas').update({ pago_com_rake: pagoComRake }).eq('id', parcelaId)
  if (error) throw error
}

export async function atualizarStatusDivida(dividaId: string, status: StatusDivida): Promise<void> {
  const { error } = await supabase.from('dividas').update({ status }).eq('id', dividaId)
  if (error) throw error
}

export async function atualizarDividaPagoComRake(dividaId: string, pagoComRake: boolean): Promise<void> {
  const { error } = await supabase.from('dividas').update({ pago_com_rake: pagoComRake }).eq('id', dividaId)
  if (error) throw error
}

export async function excluirDivida(dividaId: string): Promise<void> {
  const { error } = await supabase.from('dividas').delete().eq('id', dividaId)
  if (error) throw error
}

// Regra de Multa vinculada ao clube (regra_entidades, tipo 'multa_atraso')
// — mesma amarração de Faixa SE/ENTÃO, só filtrando pelo tipo novo.
// Multa pode estar vinculada direto ao clube (solta/standalone, criada na
// aba Multa sozinha) OU anexada (regra_pai_id) a uma Regra de Cálculo
// vinculada ao clube (nasceu junto com ela, sem vínculo próprio) — soma as
// duas fontes.
export async function getFaixasMultaDoClube(clubeId: string): Promise<FaixaMulta[]> {
  const { data } = await supabase
    .from('regra_entidades')
    .select('regras(id, tipo, regra_multa_faixas(quantidade, unidade, percentual))')
    .eq('entidade_tipo', 'clube')
    .eq('entidade_id', clubeId)
  const linhas = (data ?? []) as unknown as { regras: { id: string; tipo: string; regra_multa_faixas: FaixaMulta[] } | null }[]
  const diretas = linhas.filter((l) => l.regras?.tipo === 'multa_atraso').flatMap((l) => l.regras?.regra_multa_faixas ?? [])

  const calculoIds = linhas.filter((l) => l.regras?.tipo === 'faixa').map((l) => l.regras!.id)
  if (calculoIds.length === 0) return diretas

  const { data: filhas } = await supabase
    .from('regras')
    .select('regra_multa_faixas(quantidade, unidade, percentual)')
    .eq('tipo', 'multa_atraso')
    .in('regra_pai_id', calculoIds)
  const anexadas = ((filhas ?? []) as unknown as { regra_multa_faixas: FaixaMulta[] }[]).flatMap((f) => f.regra_multa_faixas ?? [])
  return [...diretas, ...anexadas]
}

export interface ItemDividaAcerto {
  descricao: string
  valor: number
  // Pra marcar como paga sozinha quando o Acerto for processado (ver
  // marcarDividasPagasComRake, chamado por processarAcertos) — 'simples'
  // marca a Dívida (status quitado), 'parcela' marca a Parcela.
  origem: { tipo: 'simples'; dividaId: string } | { tipo: 'parcela'; parcelaId: string }
}

// Dívida/Acordo desse clube que entra no card de Acerto — só quem estiver
// marcado "Pagar com Rake" (pago_com_rake): Simples ativa (valor cheio, some
// assim que marcada quitada) + parcelas de Acordo ainda não pagas com
// vencimento até o fim do período (inclui atrasadas de períodos anteriores:
// continuam entrando toda semana até serem marcadas como pagas — o que
// marcarDividasPagasComRake faz sozinho ao processar o Acerto). Atraso
// calculado em relação ao FIM DO PERÍODO, não "hoje" — um Acerto já fechado
// não pode mudar de valor se reaberto numa data futura.
export async function getDividasAcertoDoClube(clubeId: string, periodoFim: string): Promise<ItemDividaAcerto[]> {
  const [{ data: dividas }, faixas] = await Promise.all([
    supabase.from('dividas').select('id, tipo, valor_integral, descricao, pago_com_rake').eq('clube_id', clubeId).eq('status', 'ativo'),
    getFaixasMultaDoClube(clubeId),
  ])

  const itens: ItemDividaAcerto[] = []
  const hoje = new Date(periodoFim + 'T00:00:00')
  for (const d of (dividas ?? []) as { id: string; tipo: TipoDivida; valor_integral: number; descricao: string | null; pago_com_rake: boolean }[]) {
    if (d.tipo === 'simples') {
      if (d.pago_com_rake) itens.push({ descricao: d.descricao || 'Dívida', valor: d.valor_integral, origem: { tipo: 'simples', dividaId: d.id } })
      continue
    }
    const { data: parcelas } = await supabase
      .from('divida_parcelas')
      .select('id, numero, valor, vencimento')
      .eq('divida_id', d.id)
      .eq('pago', false)
      .eq('pago_com_rake', true)
      .lte('vencimento', periodoFim)
    for (const p of (parcelas ?? []) as { id: string; numero: number; valor: number; vencimento: string }[]) {
      const atraso = diasDeAtraso(p.vencimento, hoje)
      const valor = atraso > 0 ? valorComMulta(p.valor, atraso, faixas) : p.valor
      itens.push({ descricao: `${d.descricao || 'Acordo'} · parcela ${p.numero}`, valor, origem: { tipo: 'parcela', parcelaId: p.id } })
    }
  }
  return itens
}

// Roda junto com processarAcertos, depois que o Acerto de cada clube desse
// import já foi criado — a Dívida/parcela marcada "Pagar com Rake" acabou de
// ter seu valor descontado (calcularTotalAcerto soma esses itens), então
// marca como paga agora, pra não descontar de novo no próximo import. Erro
// numa Dívida específica não derruba as outras nem o processamento do
// import (os Acertos em si já foram salvos com sucesso antes disso rodar).
export async function marcarDividasPagasComRake(clubIds: string[], periodoFim: string): Promise<void> {
  if (!periodoFim) return
  for (const clubeId of clubIds) {
    let itens: ItemDividaAcerto[]
    try { itens = await getDividasAcertoDoClube(clubeId, periodoFim) }
    catch { continue }
    for (const item of itens) {
      try {
        if (item.origem.tipo === 'parcela') await marcarParcelaPaga(item.origem.parcelaId, item.valor)
        else await atualizarStatusDivida(item.origem.dividaId, 'quitado')
      } catch { /* segue pros outros itens */ }
    }
  }
}

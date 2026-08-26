import { supabase } from './supabase'

export type TipoDivida = 'simples' | 'acordo'
export type StatusDivida = 'ativo' | 'quitado' | 'cancelado' | 'interrompido'

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

// Juros (se ativo) incide POR PARCELA conforme o período — parcela N vale
// parcelaBase × (1+juros%)^N, composto a cada semana que passa (confirmado
// pelo Cássio com planilha de referência: base 1000, 1% a.s. → parcela 2 =
// 1.020,10, parcela 6 = 1.061,52 etc). Não é um juros único aplicado sobre
// o valor integral antes de dividir. Pagamento Mínimo é o piso aplicado
// sobre a parcela BASE (sem juros): se valor÷parcelas der menos que o
// mínimo, usa o mínimo como base e recalcula quantas parcelas fecham o
// valor integral (confirmado pelo Cássio) — o juros por período continua
// incidindo em cima disso.
export function calcularAcordo(input: CalculoAcordoInput): CalculoAcordoResultado {
  const parcelaBaseBruta = input.valorIntegral / input.quantidadeParcelas
  const usouPagamentoMinimo = !!input.pagamentoMinimo && input.pagamentoMinimo > 0 && parcelaBaseBruta < input.pagamentoMinimo
  const parcelaBase = usouPagamentoMinimo ? (input.pagamentoMinimo as number) : arredonda(parcelaBaseBruta)
  const quantidadeParcelasFinal = usouPagamentoMinimo
    ? Math.ceil(input.valorIntegral / (input.pagamentoMinimo as number))
    : input.quantidadeParcelas

  const parcelas: ParcelaCalculada[] = []
  let valorComJuros = 0
  // Sem juros, a última parcela absorve a sobra de arredondamento pra soma
  // bater certinho com o valor integral — com juros, não tem "sobra" pra
  // absorver (cada parcela já é o que o período manda), a soma final é
  // simplesmente maior que o valor integral (isso é o juros).
  let somaSemJuros = 0
  for (let i = 1; i <= quantidadeParcelasFinal; i++) {
    const ultima = i === quantidadeParcelasFinal
    const base = ultima && !input.jurosAtivo ? arredonda(input.valorIntegral - somaSemJuros) : parcelaBase
    somaSemJuros = arredonda(somaSemJuros + base)
    const valor = input.jurosAtivo && input.jurosPct ? arredonda(base * Math.pow(1 + input.jurosPct / 100, i)) : base
    valorComJuros = arredonda(valorComJuros + valor)
    const vencimento = new Date(input.dataPrimeiraParcela + 'T00:00:00')
    vencimento.setDate(vencimento.getDate() + (i - 1) * 7)
    parcelas.push({ numero: i, valor, vencimento: vencimento.toISOString().slice(0, 10) })
  }

  return { valorComJuros, valorParcela: parcelaBase, quantidadeParcelasFinal, usouPagamentoMinimo, parcelas }
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
  // Lido de verdade pro tipo 'simples' e pro Acordo SEM cronograma de
  // parcelas (quantidade_parcelas null — ver getDividasAcertoDoClube): se o
  // valor integral desconta do Rake de uma vez no próximo Acerto processado,
  // ou se é cobrado por fora. Acordo COM cronograma controla por parcela
  // (ver ParcelaRow.pago_com_rake).
  pago_com_rake: boolean
  // Só pro tipo 'simples' com pago_com_rake ligado — null = comportamento de
  // sempre (desconta o Valor Integral inteiro de uma vez). Preenchido =
  // desconta só esse % do Rake do clube a cada semana (Rakeback), até
  // zerar saldo_restante. pagamento_minimo (mesmo campo do Acordo) vira o
  // piso: semana em que o % do Rake render menos que o Mínimo, não desconta
  // nada — espera uma semana melhor (confirmado pelo Cássio com a planilha
  // de referência do Sevens Pkr House).
  rakeback_pct: number | null
  // Quanto ainda falta pra quitar — só relevante quando rakeback_pct não é
  // null. Começa igual a valor_integral, cai a cada semana que desconta
  // (ver marcarDividasPagasComRake), chega a zero = Dívida quitada sozinha.
  saldo_restante: number | null
  // Renegociação: aponta pro Acordo que foi interrompido pra dar origem a
  // esse (ver interromperEcriarFilho) — null pra dívida que nasceu do zero.
  divida_pai_id: string | null
  // Setado por atualizarStatusDivida sempre que status vira 'quitado' —
  // junto com valor_integral, monta o "Dívida Inicial / Pago em X / Em
  // Aberto" do Acordo sem cronograma de parcelas.
  quitado_em: string | null
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
  rakeback_pct: number | null
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
    .select('id, clube_id, tipo, valor_integral, descricao, status, pagamento_minimo, quantidade_parcelas, juros_ativo, juros_pct, data_primeira_parcela, pago_com_rake, rakeback_pct, saldo_restante, divida_pai_id, quitado_em, criado_em, clubs(name)')
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

// Acordo com Pagar com Rake ligado E sem quantidade de parcelas/data
// preenchidas vira um Acordo SEM cronograma — quita tudo de uma vez no
// próximo Acerto processado (igual Dívida Simples), sem gerar
// divida_parcelas nenhuma (confirmado pelo Cássio: "se for pagar com rake,
// não haverá parcela"). Com quantidade+data preenchidas, gera o cronograma
// normal (com ou sem Pagar com Rake).
async function gerarEInserirParcelas(dividaId: string, form: DividaForm): Promise<void> {
  if (form.tipo !== 'acordo' || !form.quantidade_parcelas || !form.data_primeira_parcela) return
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
    resultado.parcelas.map((p) => ({ divida_id: dividaId, numero: p.numero, valor: p.valor, vencimento: p.vencimento, pago_com_rake: form.pago_com_rake }))
  )
  if (parcelasErr) throw parcelasErr
}

export async function criarDivida(form: DividaForm): Promise<string> {
  const { data: userData } = await supabase.auth.getUser()
  const rakebackAtivo = form.tipo === 'simples' && form.rakeback_pct != null
  const { data: nova, error } = await supabase
    .from('dividas')
    .insert({
      clube_id: form.clube_id, tipo: form.tipo, valor_integral: form.valor_integral, descricao: form.descricao,
      pagamento_minimo: form.pagamento_minimo, quantidade_parcelas: form.quantidade_parcelas,
      juros_ativo: form.juros_ativo, juros_pct: form.juros_pct, data_primeira_parcela: form.data_primeira_parcela,
      pago_com_rake: form.pago_com_rake, criado_por: userData.user?.id ?? null,
      rakeback_pct: rakebackAtivo ? form.rakeback_pct : null,
      saldo_restante: rakebackAtivo ? form.valor_integral : null,
    })
    .select('id')
    .single()
  if (error) throw error

  await gerarEInserirParcelas(nova.id, form)
  return nova.id
}

// Só dá pra editar Valor/Juros/Parcelas/Data enquanto NENHUMA parcela desse
// Acordo tiver sido paga ainda — depois disso os termos travam, pra não
// bagunçar o histórico de quem já pagou parte (confirmado pelo Cássio).
// Descrição e Pagar com Rake continuam editáveis sempre.
export async function podeEditarTermosDivida(dividaId: string): Promise<boolean> {
  const { data } = await supabase.from('divida_parcelas').select('id').eq('divida_id', dividaId).eq('pago', true).limit(1)
  return (data ?? []).length === 0
}

export async function atualizarDivida(dividaId: string, form: DividaForm): Promise<void> {
  const podeTermos = await podeEditarTermosDivida(dividaId)
  const patch: Record<string, unknown> = { descricao: form.descricao, pago_com_rake: form.pago_com_rake }
  if (podeTermos) {
    Object.assign(patch, {
      valor_integral: form.valor_integral, pagamento_minimo: form.pagamento_minimo, quantidade_parcelas: form.quantidade_parcelas,
      juros_ativo: form.juros_ativo, juros_pct: form.juros_pct, data_primeira_parcela: form.data_primeira_parcela,
    })
  }
  if (form.tipo === 'simples') {
    const rakebackAtivo = form.rakeback_pct != null
    patch.rakeback_pct = rakebackAtivo ? form.rakeback_pct : null
    if (!rakebackAtivo) {
      patch.saldo_restante = null
    } else {
      // Só reinicia o saldo se estiver ligando o modo Rakeback agora (não
      // tinha antes) — se já vinha descontando aos poucos, um simples
      // "Salvar" não pode zerar o progresso já feito.
      const { data: atual } = await supabase.from('dividas').select('rakeback_pct').eq('id', dividaId).single()
      if (atual?.rakeback_pct == null) patch.saldo_restante = form.valor_integral
    }
  }
  const { error } = await supabase.from('dividas').update(patch).eq('id', dividaId)
  if (error) throw error

  if (podeTermos && form.tipo === 'acordo') {
    const { error: delErr } = await supabase.from('divida_parcelas').delete().eq('divida_id', dividaId)
    if (delErr) throw delErr
    await gerarEInserirParcelas(dividaId, form)
  }
}

// "Interromper o Acordo pra criar um Acordo filho": renegociação — encerra
// o Acordo atual (status='interrompido', trava como estava) e abre um novo
// Acordo já com o saldo que faltava como Valor Integral (divida_pai_id
// aponta pro pai) — mesma dívida, termos novos (confirmado pelo Cássio).
// Saldo: soma das parcelas ainda não pagas (cronograma normal) ou o
// valor_integral inteiro (Acordo sem cronograma, ainda não processado —
// só existe 'ativo' antes de quitar de uma vez).
export async function interromperEcriarFilho(
  dividaPaiId: string,
  novoTermos: Omit<DividaForm, 'clube_id' | 'valor_integral' | 'tipo'>
): Promise<string> {
  const { data: pai, error: paiErr } = await supabase.from('dividas').select('id, clube_id, valor_integral').eq('id', dividaPaiId).single()
  if (paiErr) throw paiErr

  const { data: parcelasAbertas } = await supabase.from('divida_parcelas').select('valor').eq('divida_id', dividaPaiId).eq('pago', false)
  const saldoRestante = (parcelasAbertas ?? []).length > 0
    ? (parcelasAbertas as { valor: number }[]).reduce((s, p) => s + p.valor, 0)
    : pai.valor_integral

  const { error: interErr } = await supabase.from('dividas').update({ status: 'interrompido' }).eq('id', dividaPaiId)
  if (interErr) throw interErr

  const filhoId = await criarDivida({ ...novoTermos, clube_id: pai.clube_id, valor_integral: arredonda(saldoRestante), tipo: 'acordo' })
  const { error: vinculoErr } = await supabase.from('dividas').update({ divida_pai_id: dividaPaiId }).eq('id', filhoId)
  if (vinculoErr) throw vinculoErr
  return filhoId
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
  const patch: Record<string, unknown> = { status }
  if (status === 'quitado') patch.quitado_em = new Date().toISOString()
  const { error } = await supabase.from('dividas').update(patch).eq('id', dividaId)
  if (error) throw error
}

// Dívida Simples em modo Rakeback (rakeback_pct preenchido): atualiza
// saldo_restante depois de descontar a fatia dessa semana — chegando a
// zero (ou menos, por segurança), quita sozinha igual as outras.
export async function atualizarSaldoRestanteDivida(dividaId: string, saldoApos: number): Promise<void> {
  const saldo = Math.max(arredonda(saldoApos), 0)
  const patch: Record<string, unknown> = { saldo_restante: saldo }
  if (saldo <= 0) {
    patch.status = 'quitado'
    patch.quitado_em = new Date().toISOString()
  }
  const { error } = await supabase.from('dividas').update(patch).eq('id', dividaId)
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
  // marcarDividasPagasComRake, chamado por processarAcertos) — 'simples' e
  // 'acordo_rake' marcam a Dívida inteira (status quitado, de uma vez só),
  // 'parcela' marca só aquela Parcela do cronograma, 'simples_rakeback'
  // atualiza saldo_restante (e só quita quando ele chega a zero).
  origem:
    | { tipo: 'simples'; dividaId: string }
    | { tipo: 'acordo_rake'; dividaId: string }
    | { tipo: 'parcela'; parcelaId: string }
    | { tipo: 'simples_rakeback'; dividaId: string; saldoApos: number }
}

// Dívida/Acordo desse clube que entra no card de Acerto — só quem estiver
// marcado "Pagar com Rake" (pago_com_rake): Simples ativa (valor cheio, some
// assim que marcada quitada) + Acordo SEM cronograma de parcelas
// (quantidade_parcelas null — nasceu com Pagar com Rake ligado direto, sem
// parcelamento) quita tudo de uma vez igual Simples, sem multa (não tem
// vencimento nenhum pra calcular atraso) + parcelas de Acordo COM
// cronograma ainda não pagas com vencimento até o fim do período (inclui
// atrasadas de períodos anteriores: continuam entrando toda semana até
// serem marcadas como pagas — o que marcarDividasPagasComRake faz sozinho
// ao processar o Acerto), com multa se o clube tiver Regra de Multa
// vinculada (confirmado pelo Cássio: se tiver multa cadastrada, ela entra —
// sem regra vinculada, não tem multa nenhuma, igual sempre foi). Atraso
// calculado em relação ao FIM DO PERÍODO, não "hoje" — um Acerto já fechado
// não pode mudar de valor se reaberto numa data futura.
//
// Dívida Simples com rakeback_pct preenchido foge desse "tudo de uma vez":
// desconta só rakeback_pct% do rakeTotal dessa semana, até zerar
// saldo_restante. Numa semana em que esse valor der menos que o Pagamento
// Mínimo cadastrado, não desconta nada — sem multa nem cronograma, só espera
// uma semana melhor (confirmado pelo Cássio com a planilha do Sevens Pkr
// House: "Complemento Pgto Mínimo" desfazendo o desconto abaixo do mínimo).
export async function getDividasAcertoDoClube(clubeId: string, periodoFim: string, rakeTotal: number): Promise<ItemDividaAcerto[]> {
  const [{ data: dividas }, faixas] = await Promise.all([
    supabase.from('dividas').select('id, tipo, valor_integral, descricao, quantidade_parcelas, pago_com_rake, rakeback_pct, saldo_restante, pagamento_minimo').eq('clube_id', clubeId).eq('status', 'ativo'),
    getFaixasMultaDoClube(clubeId),
  ])

  const itens: ItemDividaAcerto[] = []
  const hoje = new Date(periodoFim + 'T00:00:00')
  for (const d of (dividas ?? []) as { id: string; tipo: TipoDivida; valor_integral: number; descricao: string | null; quantidade_parcelas: number | null; pago_com_rake: boolean; rakeback_pct: number | null; saldo_restante: number | null; pagamento_minimo: number | null }[]) {
    if (!d.pago_com_rake) continue
    if (d.tipo === 'simples' && d.rakeback_pct != null) {
      const saldoAtual = d.saldo_restante ?? d.valor_integral
      if (saldoAtual <= 0) continue
      const valorSemana = arredonda(rakeTotal * d.rakeback_pct / 100)
      if (d.pagamento_minimo && valorSemana < d.pagamento_minimo) continue
      if (valorSemana <= 0) continue
      const valorDeduzido = Math.min(valorSemana, saldoAtual)
      itens.push({
        descricao: d.descricao || 'Dívida',
        valor: valorDeduzido,
        origem: { tipo: 'simples_rakeback', dividaId: d.id, saldoApos: arredonda(saldoAtual - valorDeduzido) },
      })
      continue
    }
    if (d.tipo === 'simples') {
      itens.push({ descricao: d.descricao || 'Dívida', valor: d.valor_integral, origem: { tipo: 'simples', dividaId: d.id } })
      continue
    }
    if (!d.quantidade_parcelas) {
      itens.push({ descricao: d.descricao || 'Acordo', valor: d.valor_integral, origem: { tipo: 'acordo_rake', dividaId: d.id } })
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

// Só a parte de multa (sem o principal) das parcelas atrasadas desse
// período — usado no Resumo de Acertos ("Fines" da planilha do Cássio).
// Mesma regra de atraso/faixas de getDividasAcertoDoClube, isolando o
// delta (valor com multa − valor original da parcela) em vez do total.
export async function getMultaAplicadaDoClube(clubeId: string, periodoFim: string): Promise<number> {
  const [{ data: dividas }, faixas] = await Promise.all([
    supabase.from('dividas').select('id').eq('clube_id', clubeId).eq('status', 'ativo').eq('tipo', 'acordo').not('quantidade_parcelas', 'is', null),
    getFaixasMultaDoClube(clubeId),
  ])
  const hoje = new Date(periodoFim + 'T00:00:00')
  let total = 0
  for (const d of (dividas ?? []) as { id: string }[]) {
    const { data: parcelas } = await supabase
      .from('divida_parcelas')
      .select('valor, vencimento')
      .eq('divida_id', d.id)
      .eq('pago', false)
      .eq('pago_com_rake', true)
      .lte('vencimento', periodoFim)
    for (const p of (parcelas ?? []) as { valor: number; vencimento: string }[]) {
      const atraso = diasDeAtraso(p.vencimento, hoje)
      if (atraso > 0) total += valorComMulta(p.valor, atraso, faixas) - p.valor
    }
  }
  return total
}

// Roda junto com processarAcertos, depois que o Acerto de cada clube desse
// import já foi criado — a Dívida/parcela marcada "Pagar com Rake" acabou de
// ter seu valor descontado (calcularTotalAcerto soma esses itens), então
// marca como paga agora, pra não descontar de novo no próximo import. Erro
// numa Dívida específica não derruba as outras nem o processamento do
// import (os Acertos em si já foram salvos com sucesso antes disso rodar).
export async function marcarDividasPagasComRake(clubIds: string[], periodoFim: string, rakeTotalPorClube: Map<string, number>): Promise<void> {
  if (!periodoFim) return
  for (const clubeId of clubIds) {
    let itens: ItemDividaAcerto[]
    try { itens = await getDividasAcertoDoClube(clubeId, periodoFim, rakeTotalPorClube.get(clubeId) ?? 0) }
    catch { continue }
    for (const item of itens) {
      try {
        if (item.origem.tipo === 'parcela') await marcarParcelaPaga(item.origem.parcelaId, item.valor)
        else if (item.origem.tipo === 'simples_rakeback') await atualizarSaldoRestanteDivida(item.origem.dividaId, item.origem.saldoApos)
        else await atualizarStatusDivida(item.origem.dividaId, 'quitado')
      } catch { /* segue pros outros itens */ }
    }
  }
}

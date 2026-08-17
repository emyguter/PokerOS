import { supabase } from './supabase'

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
}

interface AcertoRow {
  id: string
  club_external_id: string
  club_name: string
  valor_acerto: number
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
// − Valor Pago, então um Acerto quitado dá diferença 0.
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
      diferenca: Math.round((a.valor_acerto - valor_pago) * 100) / 100,
    }
  })
}

export async function buscarPagamentosPorImport(importId: string): Promise<AcertoPagamento[]> {
  const { data: acertos } = await supabase
    .from('acertos')
    .select('id, club_external_id, club_name, valor_acerto')
    .eq('import_id', importId)
    .order('club_name')

  const lista = (acertos ?? []) as AcertoRow[]
  if (lista.length === 0) return []

  const { data: pagamentos } = await supabase
    .from('lancamentos')
    .select('id, acerto_id, natureza, valor, data_lancamento')
    .in('acerto_id', lista.map((a) => a.id))
    .eq('tipo', 'pagamento')
    .order('data_lancamento', { ascending: true })

  return agregarPagamentos(lista, (pagamentos ?? []) as PagamentoRow[])
}

// Cor da Diferença — confirmado com o Cássio: no Suporte, vermelho é o que o
// clube precisa pagar (diferença negativa) e azul o que precisa receber
// (diferença positiva); no Financeiro é o oposto, porque o Financeiro pensa
// do ponto de vista da liga — vermelho é o que a liga precisa pagar pro
// clube e azul é o que a liga vai receber. Mesmo número, framing invertido
// por tela — mas o sinal de Diferença/Valor do Acerto usado aqui é negativo
// quando a liga precisa pagar (mesma convenção do totais.valor_acerto em
// AcertosView, onde negativo é sempre vermelho), então o "oposto" do
// Suporte, com esse sinal, dá vermelho no negativo e azul no positivo.
export type CorDiferenca = 'quitado' | 'azul' | 'vermelho'

export function corDiferenca(diferenca: number, perspectiva: 'suporte' | 'financeiro'): CorDiferenca {
  if (Math.abs(diferenca) < 0.005) return 'quitado'
  const positivo = diferenca > 0
  if (perspectiva === 'suporte') return positivo ? 'azul' : 'vermelho'
  return positivo ? 'azul' : 'vermelho'
}

export interface ImportResumo {
  id: string
  file_name: string
  period_start: string
  period_end: string
}

// Últimos imports com Acerto calculado — só esses fazem sentido pra
// Controle de Pagamentos/Cobrança (sem acerto calculado não tem o que cobrar).
export async function buscarImportsComAcerto(): Promise<ImportResumo[]> {
  const { data } = await supabase
    .from('imports')
    .select('id, file_name, period_start, period_end')
    .in('status', ['acertos_calculados', 'parcial'])
    .order('period_start', { ascending: false })
    .limit(30)
  return (data ?? []) as ImportResumo[]
}

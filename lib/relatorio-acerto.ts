import { supabase } from './supabase'
import { getDividasAcertoDoClube } from './dividas'

// Campos que SEMPRE aparecem no card de Acerto, em qualquer clube — não dá
// pra esconder pela Regra de Layout, só reordenar (confirmado pelo Cássio).
export const CAMPOS_OBRIGATORIOS = [
  'semana', 'clube', 'pendencias', 'rake_total', 'ganhos', 'bilhetes', 'seguranca', 'spinup',
  'indicacao', 'lancamentos_periodo', 'dividas_acordos',
] as const

// Pool de campos que a Regra de Layout pode ligar/desligar e reordenar.
// "Taxa A-A Home Game" existiu como campo digitado à mão antes da Indicação
// virar automática — confirmado pelo Cássio que era a mesma coisa, removido
// de propósito pra não ter dois lugares representando o mesmo bônus.
export const CAMPOS_OPCIONAIS = [
  'taxa_mtt', 'wtr4', 'taxa_cash', 'rake_mtt', 'rake_cash', 'taxa_operacional', 'taxa_liga',
  'rebate',
] as const

export type CampoAcerto = (typeof CAMPOS_OBRIGATORIOS)[number] | (typeof CAMPOS_OPCIONAIS)[number]

export const LABEL_CAMPO: Record<CampoAcerto, string> = {
  semana: 'Semana',
  clube: 'Clube',
  pendencias: 'Pendências / Antecipação',
  rake_total: 'Rake Total',
  ganhos: 'Ganhos/Perdas',
  bilhetes: 'Bilhetes',
  seguranca: 'Segurança',
  spinup: 'SpinUp Rake',
  taxa_mtt: 'Taxa MTT',
  wtr4: 'WtR 4 Semanas',
  taxa_cash: 'Taxa Cash',
  rake_mtt: 'Rake MTT',
  rake_cash: 'Rake Cash',
  taxa_operacional: 'Taxa Operacional',
  taxa_liga: 'Taxa da Liga',
  rebate: 'Rebate',
  indicacao: 'Indicação',
  lancamentos_periodo: 'Lançamentos do período',
  dividas_acordos: 'Dívidas / Acordos',
}

// Ordem que o card de Acerto sempre teve, antes de existir Regra de Layout —
// é o que qualquer clube sem regra vinculada continua vendo, sem mudar nada.
export const LAYOUT_PADRAO: CampoAcerto[] = [
  'semana', 'clube', 'taxa_mtt', 'wtr4', 'taxa_cash',
  'rake_total', 'rake_mtt', 'rake_cash', 'ganhos',
  'taxa_operacional', 'spinup', 'taxa_liga', 'bilhetes', 'pendencias', 'seguranca',
  'rebate', 'indicacao', 'lancamentos_periodo', 'dividas_acordos',
]

export function ehObrigatorio(campo: string): boolean {
  return (CAMPOS_OBRIGATORIOS as readonly string[]).includes(campo)
}

export interface CampoLayoutConfig {
  campo: string
  ordem: number
  visivel: boolean
}

export interface CampoResolvido {
  campo: CampoAcerto
  visivel: boolean
}

// Aplica a config vinda da Regra de Layout (se tiver alguma vinculada ao
// clube): ordena pelo que veio, completa no final com qualquer campo que
// falte (regra salva antes de um campo novo existir, por exemplo), ignora
// campo desconhecido, e trava obrigatório sempre visível mesmo que a config
// tenha vindo errada. Sem regra nenhuma, cai no LAYOUT_PADRAO — comportamento
// de hoje, sem mudar nada pra quem não configurou.
export function resolverLayout(config: CampoLayoutConfig[] | null): CampoResolvido[] {
  if (!config || config.length === 0) {
    return LAYOUT_PADRAO.map((campo) => ({ campo, visivel: true }))
  }
  const conhecidos = config.filter((c) => (LAYOUT_PADRAO as string[]).includes(c.campo))
  const ordenados = [...conhecidos].sort((a, b) => a.ordem - b.ordem)
  const vistos = new Set(ordenados.map((c) => c.campo))
  const faltando = LAYOUT_PADRAO.filter((c) => !vistos.has(c))
  return [...ordenados.map((c) => ({ campo: c.campo as CampoAcerto, visivel: c.visivel })), ...faltando.map((campo) => ({ campo, visivel: true }))]
    .map((c) => ({ campo: c.campo, visivel: ehObrigatorio(c.campo) ? true : c.visivel }))
}

// Layout pode estar vinculado direto ao clube (jeito de sempre, de quando
// Layout tinha vínculo próprio como qualquer outra Regra) OU anexado
// (regra_pai_id) a uma Regra de Cálculo vinculada ao clube (nasce junto com
// ela agora, sem vínculo próprio) — o direto tem prioridade (preserva quem
// já estava configurado assim antes da Regra "mãe" existir). Achando um
// Cálculo vinculado sem Layout direto, usa o Layout filho da primeira Regra
// de Cálculo que tiver um (clube com Cálculo por campo — Fee MTT, Fee
// Cash... — usando Layouts diferentes entre si é caso raro/mal configurado;
// fica o primeiro achado). Sem nada, `resolverLayout(null)` devolve o
// padrão sozinho.
export async function getLayoutDoClube(clubeId: string): Promise<CampoResolvido[]> {
  const { data: vinculos } = await supabase
    .from('regra_entidades')
    .select('regras(id, tipo, regra_layout_campos(campo, ordem, visivel))')
    .eq('entidade_tipo', 'clube')
    .eq('entidade_id', clubeId)
  const linhas = (vinculos ?? []) as unknown as { regras: { id: string; tipo: string; regra_layout_campos: CampoLayoutConfig[] } | null }[]

  const direto = linhas.find((v) => v.regras?.tipo === 'layout_acerto')
  if (direto) return resolverLayout(direto.regras!.regra_layout_campos ?? null)

  const calculoIds = linhas.filter((v) => v.regras?.tipo === 'faixa').map((v) => v.regras!.id)
  if (calculoIds.length === 0) return resolverLayout(null)

  const { data: filhos } = await supabase
    .from('regras')
    .select('regra_layout_campos(campo, ordem, visivel)')
    .eq('tipo', 'layout_acerto')
    .in('regra_pai_id', calculoIds)
    .limit(1)
  const config = (filhos?.[0] as unknown as { regra_layout_campos: CampoLayoutConfig[] } | undefined)?.regra_layout_campos ?? null
  return resolverLayout(config)
}

export interface ExtrasAcerto {
  bilhetes: number
  pendenciasAntecipacao: number
  security: number
  indicacaoValor: number
  lancamentosLiquido: number
  dividasTotal: number
}

// Total COMPLETO do Acerto — em cima do valor já calculado pelo motor
// (`acertos.valor_acerto`, que já é correto pra cada settlement_type:
// taxa_dinamica, rakeback, weekly_usd etc, incluindo o rebate quando é o
// caso) soma tudo o mais que compõe o que o clube efetivamente recebe/deve:
// Bilhetes, Pendências/Antecipação, Segurança, Indicação, Lançamentos do
// período (Bônus/Promoção/Outro) e Dívidas/Acordos (já com a multa por
// atraso, se for o caso). Confirmado pelo Cássio: nada pode ficar de fora —
// essa é a ÚNICA fonte de verdade do Valor do Acerto, usada no card "Common
// Settlement", na lista/export de Acertos e no Controle de
// Pagamentos/Cobrança — os três sempre têm que bater.
export function calcularTotalAcerto(valorAcertoBase: number, extras: ExtrasAcerto): number {
  return (
    valorAcertoBase +
    extras.bilhetes +
    extras.pendenciasAntecipacao +
    extras.security +
    extras.indicacaoValor +
    extras.lancamentosLiquido -
    extras.dividasTotal
  )
}

// Corrige um valor pelo % de Crypto Rebate do clube — mesma fórmula da
// planilha do Cássio (=ARRED(Total/(1+%);2)): pagando em crypto, o valor
// enviado já sai menor, porque o % de rebate é somado de volta em cima dele
// até bater no total original. Clube sem Crypto Rebate (pct 0) devolve o
// valor sem alteração. Usado no "Total Crypto Rebate" de Acertos e no botão
// "Pagar com Crypto" do Lançamento.
export function corrigirValorCrypto(valor: number, pct: number): number {
  return Math.round((valor / (1 + pct / 100)) * 100) / 100
}

// Segurança (cadastro do clube) + total de Dívidas/Acordos em aberto (já com
// multa se atrasada) de um lote de clubes — as duas peças que faltam pra
// completar calcularTotalAcerto e que cada tela buscava (ou não buscava)
// separado. Lançamentos do período fica de fora de propósito: cada tela já
// busca isso do jeito que precisa (algumas mostram item a item).
export async function buscarSecurityEDividasPorClube(clubIds: string[], periodoFim: string, rakeTotalPorClube: Map<string, number>): Promise<Map<string, { security: number; dividasTotal: number }>> {
  const mapa = new Map<string, { security: number; dividasTotal: number }>()
  if (clubIds.length === 0) return mapa
  const [{ data: clubes }, dividasPorClube] = await Promise.all([
    supabase.from('clubs').select('id, security').in('id', clubIds),
    Promise.all(clubIds.map(async (id) => [id, await getDividasAcertoDoClube(id, periodoFim, rakeTotalPorClube.get(id) ?? 0)] as const)),
  ])
  const securityPorId = new Map((clubes ?? []).map((c) => [c.id as string, (c.security as number | null) ?? 0]))
  const dividasTotalPorId = new Map(dividasPorClube.map(([id, itens]) => [id, itens.reduce((s, d) => s + d.valor, 0)]))
  for (const id of clubIds) {
    mapa.set(id, { security: securityPorId.get(id) ?? 0, dividasTotal: dividasTotalPorId.get(id) ?? 0 })
  }
  return mapa
}

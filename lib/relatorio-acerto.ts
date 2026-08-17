import { supabase } from './supabase'
import { getDividasAcertoDoClube } from './dividas'

// Campos que SEMPRE aparecem no card de Acerto, em qualquer clube — não dá
// pra esconder pela Regra de Layout, só reordenar (confirmado pelo Cássio).
export const CAMPOS_OBRIGATORIOS = [
  'semana', 'clube', 'pendencias', 'rake_total', 'ganhos', 'bilhetes', 'seguranca', 'spinup',
] as const

// Pool de campos que a Regra de Layout pode ligar/desligar e reordenar.
// "Taxa A-A Home Game" existiu como campo digitado à mão antes da Indicação
// virar automática — confirmado pelo Cássio que era a mesma coisa, removido
// de propósito pra não ter dois lugares representando o mesmo bônus.
export const CAMPOS_OPCIONAIS = [
  'taxa_mtt', 'wtr4', 'taxa_cash', 'rake_mtt', 'rake_cash', 'taxa_operacional',
  'rebate', 'indicacao', 'lancamentos_periodo', 'dividas_acordos',
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
  spinup: 'SpinUp Lucro',
  taxa_mtt: 'Taxa Atual - MTT',
  wtr4: 'WtR 4 Semanas',
  taxa_cash: 'Taxa Dinâmica - Cash',
  rake_mtt: 'Rake MTT',
  rake_cash: 'Rake Cash',
  taxa_operacional: 'Taxa Operacional',
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
  'taxa_operacional', 'spinup', 'bilhetes', 'pendencias', 'seguranca',
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

// Regra de Layout vinculada ao clube (regra_entidades, tipo 'layout_acerto')
// — mesma amarração de Faixa e Multa. Sem vínculo, `resolverLayout(null)`
// já devolve o padrão sozinho.
export async function getLayoutDoClube(clubeId: string): Promise<CampoResolvido[]> {
  const { data } = await supabase
    .from('regra_entidades')
    .select('regras(tipo, regra_layout_campos(campo, ordem, visivel))')
    .eq('entidade_tipo', 'clube')
    .eq('entidade_id', clubeId)
  const linhas = (data ?? []) as unknown as { regras: { tipo: string; regra_layout_campos: CampoLayoutConfig[] } | null }[]
  const config = linhas.find((l) => l.regras?.tipo === 'layout_acerto')?.regras?.regra_layout_campos ?? null
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

// Segurança (cadastro do clube) + total de Dívidas/Acordos em aberto (já com
// multa se atrasada) de um lote de clubes — as duas peças que faltam pra
// completar calcularTotalAcerto e que cada tela buscava (ou não buscava)
// separado. Lançamentos do período fica de fora de propósito: cada tela já
// busca isso do jeito que precisa (algumas mostram item a item).
export async function buscarSecurityEDividasPorClube(clubIds: string[], periodoFim: string): Promise<Map<string, { security: number; dividasTotal: number }>> {
  const mapa = new Map<string, { security: number; dividasTotal: number }>()
  if (clubIds.length === 0) return mapa
  const [{ data: clubes }, dividasPorClube] = await Promise.all([
    supabase.from('clubs').select('id, security').in('id', clubIds),
    Promise.all(clubIds.map(async (id) => [id, await getDividasAcertoDoClube(id, periodoFim)] as const)),
  ])
  const securityPorId = new Map((clubes ?? []).map((c) => [c.id as string, (c.security as number | null) ?? 0]))
  const dividasTotalPorId = new Map(dividasPorClube.map(([id, itens]) => [id, itens.reduce((s, d) => s + d.valor, 0)]))
  for (const id of clubIds) {
    mapa.set(id, { security: securityPorId.get(id) ?? 0, dividasTotal: dividasTotalPorId.get(id) ?? 0 })
  }
  return mapa
}

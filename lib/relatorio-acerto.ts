import { supabase } from './supabase'

// Campos que SEMPRE aparecem no card de Acerto, em qualquer clube — não dá
// pra esconder pela Regra de Layout, só reordenar (confirmado pelo Cássio).
export const CAMPOS_OBRIGATORIOS = [
  'semana', 'clube', 'pendencias', 'rake_total', 'ganhos', 'bilhetes', 'seguranca', 'spinup',
] as const

// Pool de campos que a Regra de Layout pode ligar/desligar e reordenar.
export const CAMPOS_OPCIONAIS = [
  'taxa_mtt', 'wtr4', 'taxa_cash', 'rake_mtt', 'rake_cash', 'taxa_operacional',
  'rebate', 'taxa_aa_home_game', 'indicacao', 'lancamentos_periodo', 'dividas_acordos',
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
  taxa_aa_home_game: 'Taxa A-A Home Game',
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
  'rebate', 'taxa_aa_home_game', 'indicacao', 'lancamentos_periodo', 'dividas_acordos',
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

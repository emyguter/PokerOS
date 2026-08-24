import { supabase } from '@/lib/supabase'
import { CAMPOS_POR_SETTLEMENT, type CampoClube } from '@/lib/types'

export interface TaxaCampoResumo {
  valor: string
  variavel: boolean // true = veio de Regra de Faixa vinculada, false = % fixo do cadastro
}

export interface ResumoTaxaClube {
  id: string
  externalId: string | null
  nome: string
  settlementType: string
  feeMtt: TaxaCampoResumo | null
  feeCash: TaxaCampoResumo | null
  taxaOperacional: TaxaCampoResumo | null
  spinup: TaxaCampoResumo | null
  // Da Liga do clube (leagues.taxa_app_pct fixo, ou faixa de uma Regra
  // vinculada à Liga com campo taxa_liga) — não é mais Rake Total (pedido do
  // Cássio: "no lugar de Rake Total, Taxa da Liga").
  taxaLiga: TaxaCampoResumo | null
  rebatePct: number | null
  cryptoRebatePct: number | null
  rakebackPct: number | null
  termosEspeciais: string | null
}

export function formatCampo(fixo: number | null, faixa: { min: number; max: number } | undefined): TaxaCampoResumo {
  if (faixa) {
    return faixa.min === faixa.max
      ? { valor: `${faixa.min}%`, variavel: true }
      : { valor: `${faixa.min}% – ${faixa.max}%`, variavel: true }
  }
  if (fixo == null) return { valor: '—', variavel: false }
  return { valor: `${fixo}%`, variavel: false }
}

function faixaTexto(faixa: { min: number; max: number }): string {
  return faixa.min === faixa.max ? `${faixa.min}%` : `${faixa.min}% – ${faixa.max}%`
}

// Taxa da Liga tem prioridade invertida em relação aos outros campos: o %
// fixo do cadastro da Liga manda sempre que estiver preenchido, a Regra de
// Faixa vinculada só entra como fallback quando o cadastro está vazio
// (confirmado com o Cássio, mesma regra usada em lib/acertos-engine.ts —
// tem que bater com o que o Acerto realmente calcula).
function formatTaxaLiga(fixo: number | null, faixa: { min: number; max: number } | undefined): TaxaCampoResumo {
  if (fixo != null) return { valor: `${fixo}%`, variavel: false }
  if (faixa) return { valor: faixaTexto(faixa), variavel: true }
  return { valor: '—', variavel: false }
}

// Faixa (min/max de resultado_pct) da Regra vinculada em cada campo, por
// clube — mesma fonte que o motor de cálculo usa (regra_entidades.campo +
// regra_condicoes), só que aqui é resumida em min–max pra exibição, não
// avaliada linha a linha.
async function buscarFaixasPorClube(clubIds: string[]): Promise<Map<string, Partial<Record<CampoClube, { min: number; max: number }>>>> {
  const mapa = new Map<string, Partial<Record<CampoClube, { min: number; max: number }>>>()
  if (clubIds.length === 0) return mapa

  const { data, error } = await supabase
    .from('regra_entidades')
    .select('entidade_id, campo, regras(regra_condicoes(resultado_pct))')
    .eq('entidade_tipo', 'clube')
    .in('entidade_id', clubIds)
  if (error) throw error

  for (const re of (data ?? []) as any[]) {
    if (!re.campo) continue
    const pcts = ((re.regras?.regra_condicoes ?? []) as any[])
      .map((c: any) => c.resultado_pct)
      .filter((v: any): v is number => v != null)
    if (pcts.length === 0) continue
    const atual = mapa.get(re.entidade_id) ?? {}
    atual[re.campo as CampoClube] = { min: Math.min(...pcts), max: Math.max(...pcts) }
    mapa.set(re.entidade_id, atual)
  }
  return mapa
}

// Mesma ideia de buscarFaixasPorClube, mas pra Taxa da Liga — vínculo é na
// Liga (entidade_tipo='liga'), não no Clube.
async function buscarFaixasPorLiga(leagueIds: string[]): Promise<Map<string, { min: number; max: number }>> {
  const mapa = new Map<string, { min: number; max: number }>()
  if (leagueIds.length === 0) return mapa

  const { data, error } = await supabase
    .from('regra_entidades')
    .select('entidade_id, campo, regras(regra_condicoes(resultado_pct))')
    .eq('entidade_tipo', 'liga')
    .eq('campo', 'taxa_liga')
    .in('entidade_id', leagueIds)
  if (error) throw error

  for (const re of (data ?? []) as any[]) {
    const pcts = ((re.regras?.regra_condicoes ?? []) as any[])
      .map((c: any) => c.resultado_pct)
      .filter((v: any): v is number => v != null)
    if (pcts.length === 0) continue
    mapa.set(re.entidade_id, { min: Math.min(...pcts), max: Math.max(...pcts) })
  }
  return mapa
}

// Visão executiva cross-clube das taxas cadastradas — pedido a partir de uma
// planilha de referência (Cássio). Cada coluna só aparece quando o tipo de
// cobrança do clube realmente usa aquele campo (mesma fonte de verdade que
// o aviso da tela de Vínculos: CAMPOS_POR_SETTLEMENT) — evita mostrar um
// número que não tem efeito nenhum no cálculo do Acerto.
export async function buscarResumoTaxas(): Promise<ResumoTaxaClube[]> {
  const { data: clubs, error } = await supabase
    .from('clubs')
    .select('id, external_id, name, settlement_type, fee_mtt_pct, fee_cash_pct, taxa_op_pct, taxa_op_ativo, spinup_pct, rebate_pct, rebate_ativo, crypto_rebate_pct, rakeback_pct, termos_especiais, league_id, leagues(taxa_app_pct)')
    .eq('ativo', true)
    .order('name')
  if (error) throw error

  const rows = (clubs ?? []) as any[]
  const faixas = await buscarFaixasPorClube(rows.map(r => r.id as string))
  const leagueIds = [...new Set(rows.map(r => r.league_id as string | null).filter((id): id is string => !!id))]
  const faixasLiga = await buscarFaixasPorLiga(leagueIds)

  return rows.map(c => {
    const camposDoTipo = CAMPOS_POR_SETTLEMENT[c.settlement_type as string] ?? []
    const faixaClube = faixas.get(c.id as string) ?? {}
    const campo = (nome: CampoClube, fixo: number | null): TaxaCampoResumo | null =>
      camposDoTipo.includes(nome) ? formatCampo(fixo, faixaClube[nome]) : null

    const taxaOpAplicavel = camposDoTipo.includes('taxa_op')
    const taxaOperacional: TaxaCampoResumo | null = !taxaOpAplicavel
      ? null
      : !c.taxa_op_ativo
      ? { valor: '—', variavel: false }
      : formatCampo(c.taxa_op_pct, faixaClube.taxa_op)

    return {
      id: c.id as string,
      externalId: c.external_id as string | null,
      nome: c.name as string,
      settlementType: c.settlement_type as string,
      feeMtt: campo('fee_mtt', c.fee_mtt_pct),
      feeCash: campo('fee_cash', c.fee_cash_pct),
      taxaOperacional,
      spinup: campo('spinup', c.spinup_pct),
      taxaLiga: c.league_id ? formatTaxaLiga(c.leagues?.taxa_app_pct ?? null, faixasLiga.get(c.league_id as string)) : null,
      rebatePct: c.settlement_type === 'weekly_usd' && c.rebate_ativo ? (c.rebate_pct as number | null) : null,
      cryptoRebatePct: c.settlement_type === 'weekly_usd' ? (c.crypto_rebate_pct as number | null) : null,
      rakebackPct: c.settlement_type === 'rakeback' ? (c.rakeback_pct as number | null) : null,
      termosEspeciais: (c.termos_especiais as string | null) ?? null,
    }
  })
}

import { supabase } from './supabase'
import { avaliarCondicoes, type CondicaoAvaliavel, type ImportRow } from './acertos-engine'

// Taxa App: quanto a operação deve pro APP (PokerOS) — não é uma fee de
// clube, não desconta nada de Acerto nenhum (ver comentário em
// lib/types.ts, CampoClube.taxa_app). Uma Regra de faixa (campo='taxa_app')
// pode ser vinculada num Clube, numa Liga ou numa SuperLiga — o valor soma o
// Rake Total de TODO CLUBE do escopo daquela entidade no período e avalia a
// faixa SE/ENTÃO em cima da soma, não do rake de cada clube isolado (pedido
// do Cássio: "vai depender de como ele vincular, tem que ser feita a conta
// pra cada liga, ou pra cada clube").
export interface TaxaAppLinha {
  vinculoId: string
  entidadeTipo: 'clube' | 'liga' | 'superliga'
  entidadeId: string
  entidadeNome: string
  regraId: string
  regraNome: string
  clubesNoEscopo: number
  rakeTotal: number
  pctAplicado: number | null
  valorDevido: number | null
}

type RegraEntidadeTaxaAppRow = {
  id: string
  entidade_tipo: 'clube' | 'liga' | 'superliga'
  entidade_id: string
  regra_id: string
  regras: {
    nome: string
    regra_condicoes?: {
      operador: string
      valor: number | null
      resultado_pct: number | null
      is_fallback: boolean
      ordem: number
      regra_condicao_termos?: { indicador_id: string }[]
    }[]
  } | null
}

// Clube(s) dentro do escopo de uma entidade — mesma hierarquia já usada em
// resolverClubesVisiveis (lib/acesso-hierarquia.ts), só que pra uma entidade
// específica em vez do perfil de login.
async function clubesDoEscopo(tipo: 'clube' | 'liga' | 'superliga', id: string): Promise<string[]> {
  if (tipo === 'clube') return [id]
  if (tipo === 'liga') {
    const { data } = await supabase.from('clubs').select('id').eq('league_id', id)
    return (data ?? []).map((c) => c.id as string)
  }
  // superliga
  const { data: ligas } = await supabase.from('leagues').select('id').eq('super_league_id', id)
  const ligaIds = (ligas ?? []).map((l) => l.id as string)
  if (ligaIds.length === 0) return []
  const { data } = await supabase.from('clubs').select('id').in('league_id', ligaIds)
  return (data ?? []).map((c) => c.id as string)
}

async function nomeDaEntidade(tipo: 'clube' | 'liga' | 'superliga', id: string): Promise<string> {
  const tabela = tipo === 'clube' ? 'clubs' : tipo === 'liga' ? 'leagues' : 'super_leagues'
  const { data } = await supabase.from(tabela).select('name').eq('id', id).maybeSingle()
  return (data?.name as string | undefined) ?? '—'
}

export async function buscarTaxaApp(periodEnd: string): Promise<TaxaAppLinha[]> {
  const { data: indicadores } = await supabase.from('indicadores').select('id, nome')
  const nomeIndicadorPorId = new Map<string, string>((indicadores ?? []).map((i) => [i.id, i.nome]))

  const { data: vinculos } = await supabase
    .from('regra_entidades')
    .select('id, entidade_tipo, entidade_id, regra_id, regras(nome, regra_condicoes(operador, valor, resultado_pct, is_fallback, ordem, regra_condicao_termos(indicador_id)))')
    .eq('campo', 'taxa_app')
  const linhas = (vinculos ?? []) as unknown as RegraEntidadeTaxaAppRow[]
  if (linhas.length === 0) return []

  const { data: importsData } = await supabase.from('imports').select('id').eq('period_end', periodEnd)
  const importIds = (importsData ?? []).map((i) => i.id as string)

  const resultado: TaxaAppLinha[] = []
  for (const v of linhas) {
    const clubeIds = await clubesDoEscopo(v.entidade_tipo, v.entidade_id)
    const entidadeNome = await nomeDaEntidade(v.entidade_tipo, v.entidade_id)

    let acertosDoEscopo: { rake_total: number; rake_mtt: number; rake_cash: number; rake_spinup: number; player_result: number }[] = []
    if (clubeIds.length > 0 && importIds.length > 0) {
      const { data } = await supabase
        .from('acertos')
        .select('rake_total, rake_mtt, rake_cash, rake_spinup, player_result')
        .in('club_id', clubeIds)
        .in('import_id', importIds)
      acertosDoEscopo = (data ?? []) as { rake_total: number; rake_mtt: number; rake_cash: number; rake_spinup: number; player_result: number }[]
    }

    const somaRakeTotal = acertosDoEscopo.reduce((s, a) => s + (a.rake_total ?? 0), 0)
    const rowSomado: ImportRow = {
      id: '', import_id: '', club_name: '', club_external_id: '',
      rake_total: somaRakeTotal,
      rake_mtt: acertosDoEscopo.reduce((s, a) => s + (a.rake_mtt ?? 0), 0),
      rake_cash: acertosDoEscopo.reduce((s, a) => s + (a.rake_cash ?? 0), 0),
      rake_spinup: acertosDoEscopo.reduce((s, a) => s + (a.rake_spinup ?? 0), 0),
      player_result: acertosDoEscopo.reduce((s, a) => s + (a.player_result ?? 0), 0),
      player_result_cash: 0,
      bilhetes: 0,
    }

    const condicoesBrutas = [...(v.regras?.regra_condicoes ?? [])].sort((a, b) => a.ordem - b.ordem)
    const condicoes: CondicaoAvaliavel[] = condicoesBrutas.map((c) => ({
      operador: c.operador,
      valor: c.valor,
      resultado_pct: c.resultado_pct,
      is_fallback: c.is_fallback,
      indicadorNomes: (c.regra_condicao_termos ?? [])
        .map((t) => nomeIndicadorPorId.get(t.indicador_id))
        .filter((nome): nome is string => !!nome),
    }))
    const pct = condicoes.length > 0 ? avaliarCondicoes(condicoes, rowSomado, null) : null

    resultado.push({
      vinculoId: v.id,
      entidadeTipo: v.entidade_tipo,
      entidadeId: v.entidade_id,
      entidadeNome,
      regraId: v.regra_id,
      regraNome: v.regras?.nome ?? '—',
      clubesNoEscopo: clubeIds.length,
      rakeTotal: Math.round(somaRakeTotal * 100) / 100,
      pctAplicado: pct,
      valorDevido: pct != null ? Math.round(somaRakeTotal * (pct / 100) * 100) / 100 : null,
    })
  }

  return resultado.sort((a, b) => a.entidadeNome.localeCompare(b.entidadeNome))
}

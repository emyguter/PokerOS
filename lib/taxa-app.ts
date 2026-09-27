import { supabase } from './supabase'
import { avaliarCondicoes, type CondicaoAvaliavel, type ImportRow } from './acertos-engine'
import type { EntidadeTipo } from './types'

// Taxa App: quanto a operação deve pro APP (PokerOS) — não é uma fee de
// clube, não desconta nada de Acerto nenhum (ver comentário em
// lib/types.ts, CampoClube.taxa_app). Uma Regra de faixa (campo='taxa_app')
// pode ser vinculada em QUALQUER nível da hierarquia (pedido do Cássio:
// "considerar todas as possibilidades... o céu deve ser o limite" — Mega
// Liga, SuperLiga, Liga, Clube, Agente/Super Agente ou Jogador). O valor
// soma o Rake Total do escopo daquela entidade no período: pros níveis
// "de clube" (Plataforma/Mega Liga/SuperLiga/Liga/Clube), soma o rake de
// todo clube do escopo (tabela `acertos`); pra Agente/Jogador, soma o rake
// já filtrado por eles (tabelas `acertos_agentes`/`import_jogadores` — um
// Super Agente já vem com o repasse dos agentes abaixo somado na própria
// linha, ver AgentesAcertosView.tsx). A faixa SE/ENTÃO avalia em cima da
// soma, não do rake de cada um isolado (pedido do Cássio: "tem que ser
// feita a conta pra cada liga, ou pra cada clube").
export interface TaxaAppLinha {
  vinculoId: string
  entidadeTipo: EntidadeTipo
  entidadeId: string
  entidadeNome: string
  regraId: string
  regraNome: string
  clubesNoEscopo: number
  rakeTotal: number
  pctAplicado: number | null
  valorDevido: number | null
}

type EntidadeTipoDeClube = 'plataforma' | 'mega_liga' | 'superliga' | 'liga' | 'clube'
const TIPOS_DE_CLUBE = new Set<EntidadeTipo>(['plataforma', 'mega_liga', 'superliga', 'liga', 'clube'])

type RegraEntidadeTaxaAppRow = {
  id: string
  entidade_tipo: EntidadeTipo
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

// Clube(s) dentro do escopo de uma entidade "de clube" — mesma hierarquia já
// usada em resolverClubesVisiveis (lib/acesso-hierarquia.ts): Plataforma >
// Mega Liga > SuperLiga > Liga > Clube.
async function clubesDoEscopo(tipo: EntidadeTipoDeClube, id: string): Promise<string[]> {
  if (tipo === 'clube') return [id]
  if (tipo === 'liga') {
    const { data } = await supabase.from('clubs').select('id').eq('league_id', id)
    return (data ?? []).map((c) => c.id as string)
  }
  if (tipo === 'superliga') {
    const { data: ligas } = await supabase.from('leagues').select('id').eq('super_league_id', id)
    const ligaIds = (ligas ?? []).map((l) => l.id as string)
    if (ligaIds.length === 0) return []
    const { data } = await supabase.from('clubs').select('id').in('league_id', ligaIds)
    return (data ?? []).map((c) => c.id as string)
  }
  if (tipo === 'mega_liga') {
    const { data: superligas } = await supabase.from('super_leagues').select('id').eq('mega_liga_id', id)
    const superligaIds = (superligas ?? []).map((s) => s.id as string)
    if (superligaIds.length === 0) return []
    const { data: ligas } = await supabase.from('leagues').select('id').in('super_league_id', superligaIds)
    const ligaIds = (ligas ?? []).map((l) => l.id as string)
    if (ligaIds.length === 0) return []
    const { data } = await supabase.from('clubs').select('id').in('league_id', ligaIds)
    return (data ?? []).map((c) => c.id as string)
  }
  // plataforma
  const { data } = await supabase.from('clubs').select('id').eq('plataforma_id', id)
  return (data ?? []).map((c) => c.id as string)
}

const TABELA_NOME: Record<EntidadeTipo, { tabela: string; coluna: string }> = {
  plataforma: { tabela: 'plataformas', coluna: 'nome' },
  mega_liga: { tabela: 'mega_ligas', coluna: 'nome' },
  superliga: { tabela: 'super_leagues', coluna: 'name' },
  liga: { tabela: 'leagues', coluna: 'name' },
  clube: { tabela: 'clubs', coluna: 'name' },
  agente: { tabela: 'agentes', coluna: 'nome' },
  jogador: { tabela: 'jogadores', coluna: 'nome' },
}

async function nomeDaEntidade(tipo: EntidadeTipo, id: string): Promise<string> {
  const { tabela, coluna } = TABELA_NOME[tipo]
  const { data } = await supabase.from(tabela).select(coluna).eq('id', id).maybeSingle()
  return ((data as Record<string, string> | null)?.[coluna]) ?? '—'
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
    const entidadeNome = await nomeDaEntidade(v.entidade_tipo, v.entidade_id)

    let rowSomado: ImportRow
    let clubesNoEscopo: number

    if (TIPOS_DE_CLUBE.has(v.entidade_tipo)) {
      const clubeIds = await clubesDoEscopo(v.entidade_tipo as EntidadeTipoDeClube, v.entidade_id)
      clubesNoEscopo = clubeIds.length
      let acertosDoEscopo: { rake_total: number; rake_mtt: number; rake_cash: number; rake_spinup: number; player_result: number }[] = []
      if (clubeIds.length > 0 && importIds.length > 0) {
        const { data } = await supabase
          .from('acertos')
          .select('rake_total, rake_mtt, rake_cash, rake_spinup, player_result')
          .in('club_id', clubeIds)
          .in('import_id', importIds)
        acertosDoEscopo = (data ?? []) as typeof acertosDoEscopo
      }
      rowSomado = {
        id: '', import_id: '', club_name: '', club_external_id: '',
        rake_total: acertosDoEscopo.reduce((s, a) => s + (a.rake_total ?? 0), 0),
        rake_mtt: acertosDoEscopo.reduce((s, a) => s + (a.rake_mtt ?? 0), 0),
        rake_cash: acertosDoEscopo.reduce((s, a) => s + (a.rake_cash ?? 0), 0),
        rake_spinup: acertosDoEscopo.reduce((s, a) => s + (a.rake_spinup ?? 0), 0),
        player_result: acertosDoEscopo.reduce((s, a) => s + (a.player_result ?? 0), 0),
        player_result_cash: 0,
        bilhetes: 0,
      }
    } else if (v.entidade_tipo === 'agente') {
      let linhasAgente: { rake_total: number; clube_id: string | null }[] = []
      if (importIds.length > 0) {
        const { data } = await supabase
          .from('acertos_agentes')
          .select('rake_total, clube_id')
          .eq('agente_id', v.entidade_id)
          .in('import_id', importIds)
        linhasAgente = (data ?? []) as typeof linhasAgente
      }
      clubesNoEscopo = new Set(linhasAgente.map((l) => l.clube_id).filter((id): id is string => !!id)).size
      // acertos_agentes só tem Rake Total (sem MTT/Cash/SpinUp nem Ganhos
      // separados por agente) — condições SE/ENTÃO com outros indicadores
      // além de "rake" avaliam como 0 nesse escopo, mesmo limite de dado que
      // já existe pro relatório de Agentes (AgentesAcertosView.tsx).
      rowSomado = {
        id: '', import_id: '', club_name: '', club_external_id: '',
        rake_total: linhasAgente.reduce((s, a) => s + (a.rake_total ?? 0), 0),
        rake_mtt: 0, rake_cash: 0, rake_spinup: 0, player_result: 0, player_result_cash: 0, bilhetes: 0,
      }
    } else {
      // jogador
      let linhasJogador: { rake_total: number; player_result: number; clube_id: string | null }[] = []
      if (importIds.length > 0) {
        const { data } = await supabase
          .from('import_jogadores')
          .select('rake_total, player_result, clube_id')
          .eq('jogador_id', v.entidade_id)
          .in('import_id', importIds)
        linhasJogador = (data ?? []) as typeof linhasJogador
      }
      clubesNoEscopo = new Set(linhasJogador.map((l) => l.clube_id).filter((id): id is string => !!id)).size
      rowSomado = {
        id: '', import_id: '', club_name: '', club_external_id: '',
        rake_total: linhasJogador.reduce((s, a) => s + (a.rake_total ?? 0), 0),
        rake_mtt: 0, rake_cash: 0, rake_spinup: 0,
        player_result: linhasJogador.reduce((s, a) => s + (a.player_result ?? 0), 0),
        player_result_cash: 0, bilhetes: 0,
      }
    }

    const somaRakeTotal = rowSomado.rake_total

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
      clubesNoEscopo,
      rakeTotal: Math.round(somaRakeTotal * 100) / 100,
      pctAplicado: pct,
      valorDevido: pct != null ? Math.round(somaRakeTotal * (pct / 100) * 100) / 100 : null,
    })
  }

  return resultado.sort((a, b) => a.entidadeNome.localeCompare(b.entidadeNome))
}

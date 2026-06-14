export type Plataforma = {
  id: string
  nome: string
  moeda: string
  created_at: string
}

export type PlataformaForm = {
  nome: string
  moeda: string
}

export type MegaLiga = {
  id: string
  nome: string
  moeda: string
  created_at: string
}

export type MegaLigaForm = {
  nome: string
  moeda: string
}

export type SuperLeague = {
  id: string
  name: string
  moeda: string
  plataforma_id: string | null
  mega_liga_id: string | null
  created_at: string
  plataformas?: Plataforma
  mega_ligas?: MegaLiga
}

export type SuperLeagueForm = {
  name: string
  moeda: string
  plataforma_id: string | null
  mega_liga_id: string | null
}

export type League = {
  id: string
  name: string
  moeda: string
  taxa_app_pct: number | null
  ratio: number | null
  super_league_id: string | null
  plataforma_id: string | null
  clube_ext_id: string | null
  clube_nickname: string | null
  operador_ext_id: string | null
  operador_nickname: string | null
  moeda_acerto: string | null
  conversao_dia: boolean
  created_at: string
  super_leagues?: SuperLeague & { plataformas?: Plataforma }
}

export type LeagueForm = {
  name: string
  moeda: string
  taxa_app_pct: number | null
  ratio: number | null
  super_league_id: string | null
  plataforma_id: string | null
  clube_ext_id: string | null
  clube_nickname: string | null
  operador_ext_id: string | null
  operador_nickname: string | null
  moeda_acerto: string | null
  conversao_dia: boolean
}

export type Club = {
  id: string
  league_id: string | null
  name: string
  external_id: string | null
  settlement_type: string
  fee_mtt_pct: number | null
  fee_cash_pct: number | null
  taxa_op_pct: number | null
  spinup_pct: number | null
  rebate_pct: number | null
  crypto_rebate_pct: number | null
  rakeback_pct: number | null
  security: number | null
  moeda: string
  taxa_tipo: string
  taxa_variavel_nome: string | null
  taxa_variavel_indicador: string | null
  taxa_variavel_regra: string | null
  taxa_op_tipo: string | null
  caucao_atual: number | null
  stoploss_inicial: number | null
  created_at: string
  leagues?: League
}

export type ClubForm = {
  league_id: string | null
  name: string
  external_id: string | null
  settlement_type: string
  fee_mtt_pct: number | null
  fee_cash_pct: number | null
  taxa_op_pct: number | null
  spinup_pct: number | null
  rebate_pct: number | null
  crypto_rebate_pct: number | null
  rakeback_pct: number | null
  security: number | null
  moeda: string
  taxa_tipo: string
  taxa_variavel_nome: string | null
  taxa_variavel_indicador: string | null
  taxa_variavel_regra: string | null
  taxa_op_tipo: string | null
  caucao_atual: number | null
  stoploss_inicial: number | null
}

export type Agente = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  external_id: string | null
  plataforma_id: string | null
  created_at: string
  plataformas?: Plataforma
}

export type AgenteForm = {
  nome: string
  email: string | null
  telefone: string | null
  external_id: string | null
  plataforma_id: string | null
}

export type Jogador = {
  id: string
  nome: string
  telefone: string | null
  external_id: string
  plataforma_id: string | null
  created_at: string
  plataformas?: Plataforma
}

export type JogadorForm = {
  nome: string
  telefone: string | null
  external_id: string
  plataforma_id: string | null
}

export type AgenteJogador = {
  id: string
  agente_id: string
  jogador_id: string
  created_at: string
  agentes?: Agente
  jogadores?: Jogador
}

export type ClubeAgente = {
  id: string
  clube_id: string
  agente_id: string
  created_at: string
  clubs?: Club
  agentes?: Agente
}

export type Usuario = {
  id: string
  role: 'superliga' | 'liga' | 'clube' | 'agente' | 'jogador'
  entidade_id: string
  created_at: string
}

export type Indicador = {
  id: string
  nome: string
  descricao: string | null
  created_at: string
}

export type Regra = {
  id: string
  nome: string
  descricao: string | null
  moeda: string | null
  conversao_dia: boolean
  created_at: string
}

export type RegraCondicao = {
  id: string
  regra_id: string
  ordem: number
  indicador_id: string | null
  operador: string
  valor: number
  resultado_pct: number
  is_fallback: boolean
  created_at: string
  indicadores?: Indicador
}
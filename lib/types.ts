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

export type SuperLeague = {
  id: string
  name: string
  moeda: string
  plataforma_id: string | null
  created_at: string
  plataformas?: Plataforma
}

export type SuperLeagueForm = {
  name: string
  moeda: string
  plataforma_id: string | null
}

export type League = {
  id: string
  name: string
  moeda: string
  taxa_app_pct: number
  ratio: number
  super_league_id: string | null
  created_at: string
  super_leagues?: SuperLeague
}

export type LeagueForm = {
  name: string
  moeda: string
  taxa_app_pct: number
  ratio: number
  super_league_id: string | null
}

export type Club = {
  id: string
  league_id: string
  name: string
  external_id: string
  settlement_type: string
  fee_mtt_pct: number
  fee_cash_pct: number
  taxa_op_pct: number
  spinup_pct: number
  rebate_pct: number
  crypto_rebate_pct: number
  rakeback_pct: number
  security: number
  moeda: string
  taxa_tipo: string
  taxa_variavel_nome: string | null
  taxa_variavel_indicador: string | null
  taxa_variavel_regra: string | null
  taxa_op_tipo: string
  caucao_atual: number
  stoploss_inicial: number
  created_at: string
  leagues?: League
}

export type ClubForm = {
  league_id: string
  name: string
  external_id: string
  settlement_type: string
  fee_mtt_pct: number
  fee_cash_pct: number
  taxa_op_pct: number
  spinup_pct: number
  rebate_pct: number
  crypto_rebate_pct: number
  rakeback_pct: number
  security: number
  moeda: string
  taxa_tipo: string
  taxa_variavel_nome: string | null
  taxa_variavel_indicador: string | null
  taxa_variavel_regra: string | null
  taxa_op_tipo: string
  caucao_atual: number
  stoploss_inicial: number
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
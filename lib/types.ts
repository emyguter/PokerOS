export type Moeda = 'BRL' | 'USD'
export type TaxaTipo = 'fixa' | 'variavel'
export type TaxaOpTipo = 'fixa' | 'variavel'
export type TaxaVariavelIndicador = 'Rake' | 'Ganhos+Rake' | 'WTR' | 'Rake Cash' | 'Rake MTT'
export type SettlementType = 'dinamico' | 'weekly_usd' | 'rakeback'

export interface SuperLeague {
  id: string
  name: string
  moeda: Moeda | null
  created_at: string
}

export interface League {
  id: string
  name: string
  moeda: Moeda | null
  taxa_app_pct: number | null
  ratio: number | null
  super_league_id: string | null
  created_at: string
  super_league?: SuperLeague
}

export interface Club {
  id: string
  league_id: string | null
  name: string
  external_id: string | null
  settlement_type: SettlementType | null
  moeda: Moeda | null
  taxa_tipo: TaxaTipo | null
  fee_mtt_pct: number | null
  fee_cash_pct: number | null
  taxa_op_pct: number | null
  taxa_op_tipo: TaxaOpTipo | null
  spinup_pct: number | null
  rebate_pct: number | null
  crypto_rebate_pct: number | null
  rakeback_pct: number | null
  security: number | null
  taxa_variavel_nome: string | null
  taxa_variavel_indicador: TaxaVariavelIndicador | null
  taxa_variavel_regra: string | null
  caucao_atual: number | null
  stoploss_inicial: number | null
  created_at: string
  league?: League
}

export type SuperLeagueForm = Omit<SuperLeague, 'id' | 'created_at'>
export type LeagueForm = Omit<League, 'id' | 'created_at' | 'super_league'>
export type ClubForm = Omit<Club, 'id' | 'created_at' | 'league'>

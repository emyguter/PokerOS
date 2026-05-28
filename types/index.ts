export type SuperLeague = {
  id: string; name: string; moeda: string; created_at: string
}
export type League = {
  id: string; name: string; moeda: string; taxa_app_pct: number
  ratio: number; super_league_id: string | null; created_at: string
  super_leagues?: SuperLeague
}
export type Club = {
  id: string; league_id: string; name: string; external_id: string
  settlement_type: string; fee_mtt_pct: number; fee_cash_pct: number
  taxa_op_pct: number; spinup_pct: number; rebate_pct: number
  crypto_rebate_pct: number; rakeback_pct: number; security: number
  moeda: string; taxa_tipo: string; taxa_variavel_nome: string | null
  taxa_variavel_indicador: string | null; taxa_variavel_regra: string | null
  taxa_op_tipo: string; caucao_atual: number; stoploss_inicial: number
  created_at: string; leagues?: League
}

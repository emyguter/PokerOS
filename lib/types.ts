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
  projeto: string | null
  created_at: string
}

export type MegaLigaForm = {
  nome: string
  moeda: string
  projeto: string | null
}

export type SuperLeague = {
  id: string
  name: string
  moeda: string
  plataforma_id: string | null
  mega_liga_id: string | null
  projeto: string | null
  created_at: string
  plataformas?: Plataforma
  mega_ligas?: MegaLiga
}

export type SuperLeagueForm = {
  name: string
  moeda: string
  plataforma_id: string | null
  mega_liga_id: string | null
  projeto: string | null
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
  projeto: string | null
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
  projeto: string | null
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
  taxa_op_ativo: boolean
  spinup_pct: number | null
  rebate_pct: number | null
  crypto_rebate_pct: number | null
  rakeback_pct: number | null
  security: number | null
  moeda: string
  cotacao: number | null
  taxa_tipo: string
  taxa_variavel_nome: string | null
  taxa_variavel_indicador: string | null
  taxa_variavel_regra: string | null
  taxa_op_tipo: string | null
  caucao_atual: number | null
  stoploss_inicial: number | null
  stoploss_atual: number | null
  ratio_caucao_stoploss: number | null
  margem_monitoria_ativa: boolean
  hora_virada_semana: number
  projeto: string | null
  plataforma_id: string | null
  operador_ext_id: string | null
  operador_nickname: string | null
  rebate_ativo: boolean
  ativo: boolean
  wtr4_semanas_manual: number | null
  elite: boolean
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
  taxa_op_ativo: boolean
  spinup_pct: number | null
  rebate_pct: number | null
  crypto_rebate_pct: number | null
  rakeback_pct: number | null
  security: number | null
  moeda: string
  cotacao: number | null
  taxa_tipo: string
  taxa_variavel_nome: string | null
  taxa_variavel_indicador: string | null
  taxa_variavel_regra: string | null
  taxa_op_tipo: string | null
  caucao_atual: number | null
  stoploss_inicial: number | null
  ratio_caucao_stoploss: number | null
  hora_virada_semana: number
  projeto: string | null
  plataforma_id: string | null
  operador_ext_id: string | null
  operador_nickname: string | null
  rebate_ativo: boolean
  wtr4_semanas_manual: number | null
  elite: boolean
}

// ─── AGENTES ─────────────────────────────────────────────────
// agentes.plataforma_id/external_id = plataforma PRINCIPAL (espelho automático)
// agente_plataformas = vínculos com TODAS as plataformas (multi-ID por agente)
// clube_agentes = em quais clubes o agente atua (ID/nickname derivado da plataforma do clube)
// superagente_id = auto-referência: agente que tem outros agentes abaixo dele (hierarquia 1 nível)

export type Agente = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  external_id: string | null
  plataforma_id: string | null
  superagente_id: string | null
  created_at: string
  plataformas?: Plataforma
  agente_plataformas?: {
    id: string
    plataforma_id: string
    external_id: string
    nickname: string | null
    plataformas?: { nome: string }
  }[]
  clube_agentes?: AgenteClubeVinculo[]
  // join reverso: nome do Super Agente vinculado
  // query: .select('*, superagente:agentes!superagente_id(id, nome)')
  superagente?: { id: string; nome: string } | null
}

export type AgenteForm = {
  nome: string
  email: string | null
  telefone: string | null
  superagente_id: string | null
}

export type AgentePlataforma = {
  id?: string
  agente_id?: string
  plataforma_id: string
  external_id: string
  nickname: string | null
}

export type AgenteClubeVinculo = {
  id: string
  clube_id: string
  rakeback_pct: number | null
  clubs?: {
    id: string
    name: string
    external_id: string | null
    plataforma_id: string | null
    league_id: string | null
    leagues?: { name: string }
  }
}

export type ClubeVinculado = {
  id: string
  name: string
  external_id: string | null
  plataforma_id: string | null
  leagueName: string | null
  rakeback_pct: number | null
}

// ─── JOGADORES ───────────────────────────────────────────────

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

// ─── VÍNCULOS ────────────────────────────────────────────────

export type AgenteJogador = {
  id: string
  agente_id: string
  jogador_id: string
  created_at: string
  jogadores?: {
    id: string
    nome: string
    external_id: string
    plataformas?: { id: string; nome: string }
  }
}

export type ClubeAgente = {
  id: string
  clube_id: string
  agente_id: string
  created_at: string
  agentes?: {
    id: string
    nome: string
    external_id: string
    plataformas?: { id: string; nome: string }
  }
}

// ─── REGRAS (reutilizáveis, vinculadas a Liga/Clube/Agente/Super Agente) ──

export type RegraCondicaoForm = {
  indicador_ids: string[]
  operador: string
  valor: number | null
  resultado_pct: number | null
  is_fallback: boolean
}

// 'faixa' = Cálculo de Acerto (SE/ENTÃO, já existia). 'multa_atraso' = Multa
// de Acerto — faixas de dias/semanas de atraso -> percentual de multa sobre
// a parcela atrasada (Dívidas e Acordos). 'layout_acerto' = quais campos
// aparecem no card de Acerto e em que ordem (lib/relatorio-acerto.ts) —
// todos vinculados a um clube igual às outras regras.
export type RegraTipo = 'faixa' | 'multa_atraso' | 'layout_acerto'

export type FaixaMultaForm = {
  quantidade: number | null
  unidade: 'dias' | 'semanas'
  percentual: number | null
}

export type LayoutCampoForm = {
  campo: string
  ordem: number
  visivel: boolean
}

export type Regra = {
  id: string
  nome: string
  created_at: string
  tipo: RegraTipo
  condicoes: RegraCondicaoForm[]
  faixasMulta: FaixaMultaForm[]
  layoutCampos: LayoutCampoForm[]
  vinculoCount: number
}

export type RegraForm = {
  nome: string
  tipo: RegraTipo
  condicoes: RegraCondicaoForm[]
  faixasMulta: FaixaMultaForm[]
  layoutCampos: LayoutCampoForm[]
}

export type EntidadeTipo = 'plataforma' | 'mega_liga' | 'superliga' | 'liga' | 'clube' | 'agente' | 'jogador'

// As 4 variáveis do clube que podem virar Fixa (% direto no cadastro) ou
// Variável (faixa SE/ENTÃO, via vínculo de Regra) — só faz sentido quando
// para_tipo === 'clube'; nos outros tipos de entidade fica null.
export type CampoClube = 'fee_mtt' | 'fee_cash' | 'taxa_op' | 'spinup'

// Vínculo tem lado (quem cobra/define a regra) e lado (quem paga/recebe) —
// de_* pode ficar em branco pra regras "de cima" sem uma origem clara
// (ex: taxa que a própria liga aplica, sem representar outro nível acima).
export type RegraVinculo = {
  id: string
  regra_id: string
  de_tipo: EntidadeTipo | null
  de_id: string | null
  de_nome: string | null
  para_tipo: EntidadeTipo
  para_id: string
  para_nome: string
  campo: CampoClube | null
  prioridade: number
}

// ─── STOPLOSS ────────────────────────────────────────────────
// clubs.stoploss_inicial: travado depois de definido uma vez (histórico só
// pra trás, o Cassio quer ver de onde partiu). clubs.stoploss_atual: saldo
// corrente, mexido por Antecipação conciliada e por ajuste do Suporte
// aprovado pelo Admin — cada mexida também gera uma linha em stoploss_historico.

export type StoplossAjusteStatus = 'pendente' | 'aprovado' | 'rejeitado'

export type StoplossAjuste = {
  id: string
  clube_id: string
  natureza: 'credito' | 'debito'
  valor: number
  justificativa: string
  status: StoplossAjusteStatus
  criado_por: string | null
  criado_em: string
  aprovado_por: string | null
  aprovado_em: string | null
  clubs?: { name: string }
}

export type StoplossHistoricoTipo = 'inicial' | 'antecipacao' | 'ajuste_suporte' | 'caucao' | 'margem_monitoria' | 'bug_ppp'
export type StoplossEscopo = 'permanente' | 'semanal'

export type StoplossHistoricoItem = {
  id: string
  clube_id: string
  tipo: StoplossHistoricoTipo
  escopo: StoplossEscopo
  valor_delta: number
  valor_resultante: number
  motivo: string | null
  criado_em: string
}
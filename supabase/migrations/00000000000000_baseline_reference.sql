-- ============================================================================
-- BASELINE DE REFERÊNCIA — schema como estava antes da convenção de migrations
-- versionadas começar (ver README.md nesta pasta).
--
-- NÃO é um script de recriação garantido: reconstruído a partir de introspecção
-- (colunas, tipos, defaults, PK, FK, checks) capturada em 2026-08-08. Não inclui
-- RLS policies, índices extras, triggers, functions (handle_new_user,
-- trigger_harmonizar_import) nem sequences. Pra DDL exata, usa o dashboard do
-- Supabase (Database -> Tables, ou "Generate SQL").
-- ============================================================================

-- ─── PLATAFORMAS / LIGAS ────────────────────────────────────────────────────

create table if not exists plataformas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  moeda text not null default 'USD',
  created_at timestamptz default now()
);

create table if not exists mega_ligas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  moeda text not null default 'USD',
  created_at timestamptz default now()
);

create table if not exists super_leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  moeda text default 'BRL',
  created_at timestamptz default now(),
  plataforma_id uuid references plataformas(id),
  mega_liga_id uuid references mega_ligas(id)
);

create table if not exists leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  moeda text default 'BRL',
  taxa_app_pct numeric default 0,
  ratio numeric default 1,
  super_league_id uuid references super_leagues(id),
  plataforma_id uuid references plataformas(id),
  clube_ext_id text,
  clube_nickname text,
  operador_ext_id text,
  operador_nickname text,
  moeda_acerto text,
  conversao_dia boolean default false
);

create table if not exists league_settings (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null unique references leagues(id),
  moeda text default 'BRL',
  ratio numeric default 1,
  taxa_app numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── CLUBES ─────────────────────────────────────────────────────────────────

create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references leagues(id),
  name text not null,
  external_id text,
  created_at timestamptz default now(),
  settlement_type text default 'taxa_dinamica',
  fee_mtt_pct numeric default 0,
  fee_cash_pct numeric default 0,
  taxa_op_pct numeric default 0,
  spinup_pct numeric default 0,
  rebate_pct numeric default 0,
  crypto_rebate_pct numeric default 0,
  rakeback_pct numeric default 0,
  security numeric default 0,
  moeda text default 'BRL',
  taxa_tipo text default 'fixa',
  taxa_variavel_nome text,
  taxa_variavel_indicador text,
  taxa_variavel_regra text,
  taxa_op_tipo text default 'fixa',
  caucao_atual numeric default 0,
  stoploss_inicial numeric default 0,
  plataforma_id uuid references plataformas(id),
  operador_ext_id text,
  operador_nickname text,
  rebate_ativo boolean default false
);

create table if not exists club_settings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null unique references clubs(id),
  caucao numeric default 0,
  stoploss numeric default 0,
  rebate_pct numeric default 0,
  crypto_rebate_pct numeric default 0,
  taxa_spinup numeric default 0,
  taxa_app numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists fee_rules (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null unique references clubs(id),
  name text not null,
  rule_type text not null check (rule_type in ('fixed', 'variable')),
  fixed_value numeric,
  created_at timestamptz default now()
);

create table if not exists fee_rule_conditions (
  id uuid primary key default gen_random_uuid(),
  fee_rule_id uuid not null references fee_rules(id),
  indicator text not null,
  operator text not null check (operator in ('<', '<=', '>', '>=', '=')),
  threshold numeric not null,
  rate_pct numeric not null,
  priority integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists club_indicacoes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id),
  club_indicado_id uuid references clubs(id),
  taxa_indicacao_pct numeric default 0,
  created_at timestamptz default now()
);

-- ─── AGENTES / JOGADORES ────────────────────────────────────────────────────

create table if not exists agentes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  telefone text,
  external_id text,
  plataforma_id uuid references plataformas(id),
  created_at timestamptz default now(),
  superagente_id uuid references agentes(id)
);

create table if not exists agente_plataformas (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references agentes(id),
  plataforma_id uuid not null references plataformas(id),
  external_id text not null,
  nickname text,
  created_at timestamptz default now()
);

create table if not exists jogadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  external_id text not null,
  plataforma_id uuid references plataformas(id),
  created_at timestamptz default now()
);

create table if not exists agente_jogadores (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references agentes(id),
  jogador_id uuid not null references jogadores(id),
  created_at timestamptz default now()
);

create table if not exists clube_agentes (
  id uuid primary key default gen_random_uuid(),
  clube_id uuid not null references clubs(id),
  agente_id uuid not null references agentes(id),
  created_at timestamptz default now(),
  rakeback_pct numeric not null default 0
);

create table if not exists clube_jogadores (
  id uuid primary key default gen_random_uuid(),
  clube_id uuid not null references clubs(id),
  jogador_id uuid not null references jogadores(id),
  created_at timestamptz default now()
);

-- ─── IMPORTAÇÃO (bronze / silver / gold) ───────────────────────────────────

create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references leagues(id),
  file_name text not null,
  app_source text not null,
  period_start date,
  period_end date,
  status text default 'pending',
  error_message text,
  uploaded_by text,
  created_at timestamptz default now(),
  plataforma_id uuid references plataformas(id),
  storage_path text,
  harmonization_status text not null default 'pendente',
  harmonization_error text,
  harmonized_at timestamptz,
  jogadores_ok integer
);

create table if not exists bronze_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references imports(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references imports(id),
  club_id uuid references clubs(id),
  club_name text,
  club_external_id text,
  rake_total numeric default 0,
  rake_mtt numeric default 0,
  rake_cash numeric default 0,
  rake_spinup numeric default 0,
  player_result numeric default 0,
  raw_data jsonb,
  created_at timestamptz default now(),
  agente_nome text,
  agente_id_ext text,
  superagente_nome text,
  superagente_id_ext text,
  fee_total numeric default 0
);

create table if not exists import_jogadores (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references imports(id),
  jogador_id uuid not null references jogadores(id),
  clube_id uuid references clubs(id),
  agente_id uuid references agentes(id),
  player_result numeric,
  rake_total numeric,
  created_at timestamptz default now()
);

-- ─── ACERTOS (gold) ─────────────────────────────────────────────────────────

create table if not exists acertos (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references imports(id),
  club_id uuid references clubs(id),
  club_name text,
  club_external_id text,
  settlement_type text,
  rake_mtt numeric default 0,
  rake_cash numeric default 0,
  rake_spinup numeric default 0,
  rake_total numeric default 0,
  player_result numeric default 0,
  fee_calculado numeric default 0,
  rebate_calculado numeric default 0,
  valor_acerto numeric default 0,
  status text default 'pendente',
  created_at timestamptz default now(),
  fee_mtt_valor numeric not null default 0,
  fee_cash_valor numeric not null default 0,
  fee_operacional_valor numeric not null default 0,
  fee_spinup_valor numeric not null default 0,
  taxa_cash_pct_aplicada numeric,
  bilhetes numeric not null default 0,
  pendencias_antecipacao numeric not null default 0,
  taxa_aa_home_game numeric not null default 0
);

create table if not exists acertos_agentes (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references imports(id),
  agente_id uuid not null references agentes(id),
  clube_id uuid references clubs(id),
  agente_nome text not null,
  clube_nome text,
  rake_total numeric not null default 0,
  rakeback_pct numeric not null default 0,
  valor_rakeback numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ─── LANÇAMENTOS (bônus/promoção/caução/pagamento/antecipação) ────────────

create table if not exists lancamentos (
  id uuid primary key default gen_random_uuid(),
  clube_id uuid not null references clubs(id),
  tipo text not null,
  natureza text not null check (natureza in ('credito', 'debito')),
  valor numeric not null,
  descricao text,
  data_lancamento date not null default current_date,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  origem text not null default 'suporte' check (origem in ('suporte', 'genia')),
  status text check (status in ('em_validacao', 'pago')),
  conciliado_com uuid references lancamentos(id),
  conciliado_em timestamptz
);

-- ─── REGRAS (faixas SE/ENTÃO + cotação) ────────────────────────────────────

create table if not exists indicadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  created_at timestamptz default now()
);

create table if not exists regras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  moeda text,
  conversao_dia boolean default false,
  created_at timestamptz default now(),
  tipo text not null default 'faixa',
  moeda_origem text,
  moeda_destino text,
  valor_cotacao numeric
);

create table if not exists regra_condicoes (
  id uuid primary key default gen_random_uuid(),
  regra_id uuid not null references regras(id),
  ordem integer not null,
  indicador_id uuid references indicadores(id),
  operador text not null check (operador in ('>', '>=', '<', '<=', '=')),
  valor numeric not null,
  resultado_pct numeric not null,
  is_fallback boolean default false,
  created_at timestamptz default now()
);

create table if not exists regra_condicao_termos (
  id uuid primary key default gen_random_uuid(),
  regra_condicao_id uuid not null references regra_condicoes(id),
  indicador_id uuid not null references indicadores(id),
  ordem integer not null default 1
);

create table if not exists regra_entidades (
  id uuid primary key default gen_random_uuid(),
  regra_id uuid not null references regras(id),
  entidade_tipo text not null,
  entidade_id uuid not null,
  prioridade integer not null default 0,
  created_at timestamptz default now(),
  de_tipo text,
  de_id uuid,
  campo text
);

-- ─── PERMISSÕES / USUÁRIOS ──────────────────────────────────────────────────

create table if not exists profiles (
  id uuid primary key references auth.users(id),
  email text,
  nome text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  clube_id uuid references clubs(id),
  agente_id uuid references agentes(id)
);

create table if not exists usuarios (
  id uuid primary key references auth.users(id),
  role text not null check (role in ('superliga', 'liga', 'clube', 'agente', 'jogador')),
  entidade_id uuid not null,
  created_at timestamptz default now()
);

create table if not exists permissoes (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nome text not null,
  categoria text not null,
  created_at timestamptz not null default now()
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  created_at timestamptz not null default now()
);

create table if not exists role_permissoes (
  role_id uuid not null references roles(id),
  permissao_id uuid not null references permissoes(id),
  primary key (role_id, permissao_id)
);

create table if not exists user_roles (
  user_id uuid not null references auth.users(id),
  role_id uuid not null references roles(id),
  primary key (user_id, role_id)
);

create table if not exists user_permissoes (
  user_id uuid not null references auth.users(id),
  permissao_id uuid not null references permissoes(id),
  allow boolean not null,
  primary key (user_id, permissao_id)
);

-- Dívidas e Acordos: clube pode ter uma dívida simples (só um valor,
-- sem parcelamento) ou um Acordo (valor integral parcelado, com juros
-- opcional e pagamento mínimo por parcela). Regra de Multa por atraso
-- (nova entrada em "Regras", tipo 'multa_atraso') define faixas de
-- dias/semanas de atraso -> percentual de multa sobre a parcela atrasada.

alter table regras add column if not exists tipo text not null default 'faixa' check (tipo in ('faixa', 'multa_atraso'));

create table if not exists regra_multa_faixas (
  id uuid primary key default gen_random_uuid(),
  regra_id uuid not null references regras(id) on delete cascade,
  quantidade integer not null,
  unidade text not null check (unidade in ('dias', 'semanas')),
  percentual numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists dividas (
  id uuid primary key default gen_random_uuid(),
  clube_id uuid not null references clubs(id) on delete cascade,
  tipo text not null check (tipo in ('simples', 'acordo')),
  valor_integral numeric not null,
  descricao text,
  status text not null default 'ativo' check (status in ('ativo', 'quitado', 'cancelado')),
  -- Só usados quando tipo = 'acordo':
  pagamento_minimo numeric,
  quantidade_parcelas integer,
  juros_ativo boolean not null default false,
  juros_pct numeric,
  data_primeira_parcela date,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

create table if not exists divida_parcelas (
  id uuid primary key default gen_random_uuid(),
  divida_id uuid not null references dividas(id) on delete cascade,
  numero integer not null,
  valor numeric not null,
  vencimento date not null,
  pago boolean not null default false,
  pago_em timestamptz,
  valor_pago numeric,
  criado_em timestamptz not null default now()
);

create index if not exists idx_dividas_clube_id on dividas (clube_id);
create index if not exists idx_divida_parcelas_divida_id on divida_parcelas (divida_id);
create index if not exists idx_regra_multa_faixas_regra_id on regra_multa_faixas (regra_id);

alter table dividas enable row level security;
alter table divida_parcelas enable row level security;
alter table regra_multa_faixas enable row level security;
create policy "authenticated_all_dividas" on dividas for all to authenticated using (true) with check (true);
create policy "authenticated_all_divida_parcelas" on divida_parcelas for all to authenticated using (true) with check (true);
create policy "authenticated_all_regra_multa_faixas" on regra_multa_faixas for all to authenticated using (true) with check (true);

insert into permissoes (chave, nome, categoria) values
  ('dividas', 'Dívidas e Acordos', 'Financeiro')
on conflict (chave) do nothing;

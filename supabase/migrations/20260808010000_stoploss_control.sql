-- Controle de Stoploss: saldo corrente por clube, histórico auditável e
-- fila de aprovação (papel Admin) pra ajustes que o Suporte solicita fora
-- do fluxo normal de lançamento. Já aplicada em produção via
-- mcp__Supabase__apply_migration (name: add_stoploss_control) — este arquivo
-- é o registro/replay, não uma aplicação nova.

alter table clubs add column if not exists stoploss_atual numeric;

create table if not exists stoploss_historico (
  id uuid primary key default gen_random_uuid(),
  clube_id uuid not null references clubs(id) on delete cascade,
  tipo text not null check (tipo in ('inicial', 'antecipacao', 'ajuste_suporte')),
  valor_delta numeric not null,
  valor_resultante numeric not null,
  motivo text,
  lancamento_id uuid references lancamentos(id) on delete set null,
  ajuste_id uuid,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

create table if not exists stoploss_ajustes (
  id uuid primary key default gen_random_uuid(),
  clube_id uuid not null references clubs(id) on delete cascade,
  natureza text not null check (natureza in ('credito', 'debito')),
  valor numeric not null,
  justificativa text not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado')),
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  aprovado_por uuid references auth.users(id),
  aprovado_em timestamptz
);

alter table stoploss_historico
  add constraint stoploss_historico_ajuste_id_fkey
  foreign key (ajuste_id) references stoploss_ajustes(id) on delete set null;

alter table stoploss_historico enable row level security;
alter table stoploss_ajustes enable row level security;

create policy "authenticated_all_stoploss_historico" on stoploss_historico for all to authenticated using (true) with check (true);
create policy "authenticated_all_stoploss_ajustes" on stoploss_ajustes for all to authenticated using (true) with check (true);

update clubs set stoploss_atual = stoploss_inicial where stoploss_atual is null and stoploss_inicial is not null;

insert into stoploss_historico (clube_id, tipo, valor_delta, valor_resultante, motivo, criado_em)
select id, 'inicial', stoploss_inicial, stoploss_inicial, 'Stoploss inicial do clube (backfill)', now()
from clubs
where stoploss_inicial is not null
  and not exists (select 1 from stoploss_historico h where h.clube_id = clubs.id and h.tipo = 'inicial');

insert into permissoes (chave, nome, categoria) values
  ('stoploss', 'Controle de Stoploss', 'Financeiro'),
  ('stoploss.aprovar', 'Aprovar ajustes de Stoploss', 'Financeiro')
on conflict (chave) do nothing;

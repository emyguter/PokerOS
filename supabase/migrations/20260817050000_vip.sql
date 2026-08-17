-- Tela de VIP: clubes têm direito a um número de convites VIP por mês, por
-- categoria — Silver até 20, Black até 10, Platinum até 5 (constantes fixas,
-- não configuráveis por clube). Cada linha aqui é um envio de VIP; o limite
-- mensal é checado client-side (RelatorioStoploss/ExtratoView já seguem esse
-- padrão de contar por período em vez de guardar um saldo).

create table if not exists vips_enviados (
  id uuid primary key default gen_random_uuid(),
  clube_id uuid not null references clubs(id) on delete cascade,
  tipo text not null check (tipo in ('silver', 'black', 'platinum')),
  data_lancamento date not null,
  observacao text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

-- Índice pro agrupamento mensal por clube+tipo (extrato e checagem de limite
-- no envio) — a consulta mais comum dessa tela.
create index if not exists idx_vips_enviados_clube_tipo_data on vips_enviados (clube_id, tipo, data_lancamento);

alter table vips_enviados enable row level security;
create policy "authenticated_all_vips_enviados" on vips_enviados for all to authenticated using (true) with check (true);

insert into permissoes (chave, nome, categoria) values
  ('vip', 'VIP', 'Financeiro')
on conflict (chave) do nothing;

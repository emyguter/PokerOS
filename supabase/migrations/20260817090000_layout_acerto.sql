-- Layout do Acerto: novo tipo de Regra (vinculável a clube igual Faixa e
-- Multa já são) que decide quais campos do card de Acerto aparecem e em que
-- ordem. Os 8 campos obrigatórios (Semana, Clube, Pendências, Rake Total,
-- Ganhos, Bilhetes, Segurança, SpinUp) sempre aparecem — só a ordem deles
-- pode mudar; os demais podem ser ligados/desligados. Sem regra vinculada,
-- o clube continua vendo o card no layout padrão de sempre.

alter table regras drop constraint if exists regras_tipo_check;
alter table regras add constraint regras_tipo_check check (tipo in ('faixa', 'multa_atraso', 'layout_acerto'));

create table if not exists regra_layout_campos (
  id uuid primary key default gen_random_uuid(),
  regra_id uuid not null references regras(id) on delete cascade,
  campo text not null,
  ordem integer not null,
  visivel boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_regra_layout_campos_regra_id on regra_layout_campos (regra_id);

alter table regra_layout_campos enable row level security;
create policy "authenticated_all_regra_layout_campos" on regra_layout_campos for all to authenticated using (true) with check (true);

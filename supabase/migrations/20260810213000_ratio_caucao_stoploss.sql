-- Ratio Caução → Stoploss: cada clube pode ter uma relação própria entre
-- Caução depositada e quanto isso soma no Stoploss Atual (ex: ratio 2 =
-- clube 1:2, cada R$1 de caução confirmada soma R$2 no Stoploss).
-- Só se aplica quando o lançamento é do tipo 'caucao' (não qualquer
-- lançamento) e só quando a Genia confirma (mesmo momento que já soma em
-- clubs.caucao_atual, ver FilaValidacao.tsx).

alter table clubs add column if not exists ratio_caucao_stoploss numeric;

-- Acha o nome real do check constraint da coluna `tipo` (não assume o nome
-- padrão do Postgres) antes de trocar pela versão que aceita 'caucao'.
do $$
declare
  nome_constraint text;
begin
  select con.conname into nome_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'stoploss_historico'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%tipo%';

  if nome_constraint is not null then
    execute format('alter table stoploss_historico drop constraint %I', nome_constraint);
  end if;

  alter table stoploss_historico add constraint stoploss_historico_tipo_check
    check (tipo in ('inicial', 'antecipacao', 'ajuste_suporte', 'caucao'));
end $$;

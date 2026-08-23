-- "Acerto pendente" no Resumo de Stoploss: duas ações novas pro Suporte
-- quando um clube tem Acerto sem pagar — Corte 50% (reduz o Stoploss Atual
-- pela metade, ajuste permanente igual Bug PPPoker) e Bloquear (só
-- sinaliza o clube, sem travar nada tecnicamente no sistema).
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
    check (tipo in ('inicial', 'antecipacao', 'ajuste_suporte', 'caucao', 'margem_monitoria', 'bug_ppp', 'corte_50'));
end $$;

alter table clubs add column if not exists bloqueado boolean not null default false;

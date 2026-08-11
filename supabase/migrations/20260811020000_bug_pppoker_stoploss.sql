-- "Bug do PPPoker": o PPPoker às vezes reporta rake/resultado errado
-- (bug conhecido da plataforma) e o Suporte precisa corrigir o Stoploss na
-- mão. Tratado como já liberado pela gerência — o Suporte lança direto,
-- sem passar pela fila de aprovação (diferente do Ajuste normal).
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
    check (tipo in ('inicial', 'antecipacao', 'ajuste_suporte', 'caucao', 'margem_monitoria', 'bug_ppp'));
end $$;

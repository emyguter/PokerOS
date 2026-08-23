-- Acordo ganha:
--  1. Pagar com Rake sem cronograma de parcelas — quita tudo de uma vez no
--     próximo Acerto processado (igual Dívida Simples já fazia), sem multa
--     (Acordo nunca tem multa, ver lib/dividas.ts). quitado_em guarda a data
--     desse pagamento pra exibir "Dívida Inicial / Pago em X / Em Aberto".
--  2. Interromper + Acordo filho: renegociação — encerra o Acordo atual
--     (status='interrompido') e trava o saldo que faltava; o Acordo filho
--     nasce com esse saldo como Valor Integral (divida_pai_id aponta pro pai).
alter table dividas add column if not exists divida_pai_id uuid references dividas(id);
alter table dividas add column if not exists quitado_em timestamptz;

do $$
declare
  nome_constraint text;
begin
  select con.conname into nome_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'dividas'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%status%';

  if nome_constraint is not null then
    execute format('alter table dividas drop constraint %I', nome_constraint);
  end if;

  alter table dividas add constraint dividas_status_check
    check (status in ('ativo', 'quitado', 'cancelado', 'interrompido'));
end $$;

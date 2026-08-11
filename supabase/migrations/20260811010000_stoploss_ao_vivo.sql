-- Stoploss Atual deixa de ser um valor salvo/incrementado e passa a ser
-- sempre recalculado ao vivo (feito na aplicação, não aqui no banco):
--   Stoploss Atual = Stoploss Inicial + (Caução Atual × Ratio)
--                    + soma(stoploss_historico de tipo antecipacao/ajuste_suporte/margem_monitoria)
-- Caução×Ratio deixou de gerar linha em stoploss_historico (tipo 'caucao')
-- porque agora é sempre recalculado a partir de clubs.caucao_atual direto —
-- 'caucao' continua um tipo válido só por causa de linhas antigas já criadas.

-- Margem de Monitoria: líder do Suporte pode aumentar o Stoploss em 10% sem
-- aprovação de ninguém, mas só uma vez por clube — precisa ser retirada
-- (por quem aprova ajuste normal) antes de poder ser usada de novo.
alter table clubs add column if not exists margem_monitoria_ativa boolean not null default false;

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
    check (tipo in ('inicial', 'antecipacao', 'ajuste_suporte', 'caucao', 'margem_monitoria'));
end $$;

insert into permissoes (chave, nome, categoria) values
  ('stoploss.margem_monitoria', 'Aplicar Margem de Monitoria (+10%)', 'Financeiro')
on conflict (chave) do nothing;

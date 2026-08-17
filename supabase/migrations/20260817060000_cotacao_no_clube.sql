-- "Cotação do dólar" tinha 3 mecanismos espalhados e desconectados entre si
-- (nenhum deles de fato aplicava a conversão em nenhum cálculo — confirmado
-- checando lib/acertos-engine.ts, que nunca lê nenhum desses valores):
--   1. Regra tipo 'cotacao' (câmbio entre duas moedas, avulsa)
--   2. Cadastro de Moedas (moedas_cotacao) + toggle "Conversão do Dia" da
--      Liga (leagues.conversao_dia/moeda_acerto) + popup de confirmação
--      diária no cálculo de Acertos
-- Consolidado num único lugar: um campo "Cotação" na Identificação do
-- clube (clubs.cotacao) — valor único, definido pelo admin, sem
-- confirmação diária.

-- 1) Regra tipo 'cotacao': apaga os vínculos e as regras desse tipo (o
-- tipo 'faixa', com condições, continua intacto), depois derruba as
-- colunas que só existiam pra isso.
delete from regra_entidades where regra_id in (select id from regras where tipo = 'cotacao');
delete from regra_condicao_termos where regra_condicao_id in (
  select id from regra_condicoes where regra_id in (select id from regras where tipo = 'cotacao')
);
delete from regra_condicoes where regra_id in (select id from regras where tipo = 'cotacao');
delete from regras where tipo = 'cotacao';

alter table regras drop column if exists tipo;
alter table regras drop column if exists moeda;
alter table regras drop column if exists conversao_dia;
alter table regras drop column if exists moeda_origem;
alter table regras drop column if exists moeda_destino;
alter table regras drop column if exists valor_cotacao;

-- 2) Cadastro de Moedas + Conversão do Dia da Liga.
delete from role_permissoes where permissao_id in (select id from permissoes where chave = 'cadastro.moedas');
delete from user_permissoes where permissao_id in (select id from permissoes where chave = 'cadastro.moedas');
delete from permissoes where chave = 'cadastro.moedas';

drop table if exists moedas_cotacao;

alter table leagues drop column if exists conversao_dia;
alter table leagues drop column if exists moeda_acerto;

-- 3) Único lugar que resta: a Identificação do clube.
alter table clubs add column if not exists cotacao numeric;

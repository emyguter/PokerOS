-- Taxa App (PR #120) adicionou 'taxa_app' como CampoClube válido no código
-- (lib/types.ts, RegraModal, VinculosPanel) mas esqueceu de atualizar a
-- constraint do banco — regras_campo_check só aceitava os campos antigos.
-- Resultado: salvar uma Regra com Campo "Taxa App" sempre falhava no INSERT/
-- UPDATE (achado pelo Cássio tentando criar a Regra "Taxa App — LP" — teve
-- que contornar reaproveitando uma Regra antiga de rake_total, o que deixou
-- os vínculos sem campo nenhum salvo).

alter table regras drop constraint if exists regras_campo_check;
alter table regras add constraint regras_campo_check check (campo in ('fee_mtt', 'fee_cash', 'taxa_op', 'spinup', 'rake_total', 'taxa_liga', 'taxa_app'));

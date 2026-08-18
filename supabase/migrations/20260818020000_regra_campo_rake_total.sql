-- Adiciona "Rake Total" como opção de regras.campo (rodar depois da
-- 20260817100000_regra_campo_explicito.sql). É a taxa única de clubes
-- taxa_fixa_variavel/weekly_usd (% sobre o Rake Total inteiro, sem separar
-- MTT/Cash) — diferente de Taxa Operacional, que só existe em clubes
-- taxa_dinamica. Antes dessa opção, esses dois tipos de clube não tinham
-- como usar Regra de Faixa nenhuma: a % vinha sempre fixa do cadastro.

alter table regras drop constraint if exists regras_campo_check;
alter table regras add constraint regras_campo_check check (campo in ('fee_mtt', 'fee_cash', 'taxa_op', 'spinup', 'rake_total'));

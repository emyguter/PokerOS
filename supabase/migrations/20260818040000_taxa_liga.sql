-- Taxa da Liga: nova taxa pedida pelo Cássio, incide sobre Rake Total +
-- SpinUp Rake (todo o rake do período, os 3 tipos de jogo somados) — desconta
-- do Valor do Acerto, em cima de qualquer taxa que o clube já tenha. % fixo
-- fica no cadastro da Liga (reaproveita leagues.taxa_app_pct, que já existia
-- no banco mas nunca tinha tela nem cálculo). Pode virar Faixa SE/ENTÃO via
-- Regra vinculada à Liga (regra_entidades.entidade_tipo='liga', campo
-- 'taxa_liga') — mesmo padrão dos outros campos de taxa do sistema.

alter table acertos add column if not exists taxa_liga_valor numeric not null default 0;

alter table regras drop constraint if exists regras_campo_check;
alter table regras add constraint regras_campo_check check (campo in ('fee_mtt', 'fee_cash', 'taxa_op', 'spinup', 'rake_total', 'taxa_liga'));

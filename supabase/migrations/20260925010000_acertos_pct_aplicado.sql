-- Guarda a % efetivamente aplicada de cada componente (Fee MTT, Taxa
-- Operacional, SpinUp, Rebate/Rakeback, Taxa da Liga) junto do Acerto no
-- momento do cálculo — mesma ideia que já existia só pra Cotação
-- (acertos.cotacao). taxa_cash_pct_aplicada já existia antes.
--
-- Motivo (Cássio, achado ao discutir segurança do recálculo): o motor
-- sempre lê o cadastro do clube AO VIVO — se a % mudar no cadastro e
-- alguém recalcular uma semana antiga depois, o valor histórico (que
-- estava certo com a % antiga) seria sobrescrito silenciosamente com a %
-- de hoje. Essas colunas permitem comparar "a % que foi usada da última
-- vez" com "a % que seria usada agora" antes de recalcular, e avisar o
-- usuário (ver verificarDivergenciasTaxa em lib/acertos-engine.ts).

alter table acertos add column if not exists fee_mtt_pct_aplicado numeric;
alter table acertos add column if not exists taxa_op_pct_aplicado numeric;
alter table acertos add column if not exists spinup_pct_aplicado numeric;
alter table acertos add column if not exists rebate_pct_aplicado numeric;
alter table acertos add column if not exists taxa_liga_pct_aplicada numeric;

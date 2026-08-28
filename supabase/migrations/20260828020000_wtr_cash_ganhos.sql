-- WtR (Win to Rake) é uma métrica de cash game (confirmado pelo Cássio) — o
-- cálculo até aqui usava Ganhos/Rake TOTAIS (misturando MTT/SpinUp), por
-- isso não batia com a conta manual dele. Correção: Ganhos de Cash / Rake
-- Cash. "Ganhos de Cash" (coluna "Ring Games" do PPPoker) não tinha campo
-- próprio ainda — só o total combinado (player_result) era guardado.
alter table import_rows add column if not exists player_result_cash numeric not null default 0;
alter table acertos add column if not exists player_result_cash numeric not null default 0;

-- Rollover agora só marca "sem multa" — o valor em si já carrega sozinho
-- pra Pendência do próximo período (ver buscarSaldoArrastado em
-- lib/acertos-engine.ts), então Rollover não precisa mais criar nenhum
-- lançamento. Confirmado pelo Cássio (áudio): "o rollover é a opção dos
-- dois lados, da negociação optarem por rolar dívida pra próxima semana sem
-- nenhum problema... não vai ter multa" — é uma isenção negociada, não o
-- jeito de fazer a Diferença aparecer (isso já é automático).
alter table acertos add column if not exists rollover_sem_multa boolean not null default false;

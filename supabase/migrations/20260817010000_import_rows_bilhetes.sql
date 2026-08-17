-- Bilhetes (tickets) do PPPoker: Valor do ticket ganho (coluna S) − Buy-in de
-- ticket (coluna T) da aba "Geral da liga", lido a partir de agora pelo
-- parser (components/importacao/ImportacaoXlsx.tsx). Guardado por linha de
-- import pra alimentar acertos.bilhetes automaticamente — antes esse campo
-- era só digitado à mão no card do Acerto.
alter table import_rows add column if not exists bilhetes numeric not null default 0;

-- WtR 4 Semanas manual por clube: sobrescreve o cálculo automático (médias
-- dos últimos acertos no banco) enquanto o histórico de importações não
-- cobre 4 semanas seguidas pra todo clube. Alimentado pela planilha que o
-- Cássio já calcula à parte; usado pelas regras variáveis (ex: Taxa
-- Dinâmica). null = volta a usar o cálculo automático (comportamento
-- anterior).
alter table clubs add column if not exists wtr4_semanas_manual numeric;

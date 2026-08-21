-- Regra "mãe": uma Regra de Cálculo pode ter um Layout e/ou uma Multa
-- anexados a ela (nascem juntos, na criação) em vez de precisarem de
-- vínculo próprio — vincular o Cálculo a uma Liga/Clube/Agente já traz o
-- Layout/Multa anexados junto (pedido do Cássio: vincular 1 vez só, tudo
-- vale, inclusive o Indicador usado nas condições SE/ENTÃO do Cálculo).
-- Layout nasce sempre anexado (nunca tem vínculo próprio). Multa pode ser
-- anexada (nasce junto com um Cálculo) OU solta/standalone (criada na aba
-- Multa sozinha, aí continua precisando do próprio vínculo, como sempre).
alter table regras add column if not exists regra_pai_id uuid references regras(id) on delete cascade;
create index if not exists idx_regras_regra_pai_id on regras (regra_pai_id);

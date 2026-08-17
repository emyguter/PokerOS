-- Taxa Operacional vira on/off (igual Rebate) em vez de sempre aplicar
-- quando tem % preenchido — pedido do Cássio. Default true pra clubes já
-- cadastrados manterem o comportamento de hoje (Taxa Operacional sempre
-- cobrada quando taxa_op_pct está preenchido); clube novo pré-cadastrado
-- automaticamente no import nasce com taxa_op_ativo=false (mesma regra que
-- já vale pro resto das taxas em branco, alguém completa depois).
alter table clubs add column if not exists taxa_op_ativo boolean not null default true;

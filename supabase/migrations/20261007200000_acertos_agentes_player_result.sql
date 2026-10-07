-- Ganhos/Perdas dos jogadores de cada Agente/Super Agente, somado junto com
-- o Rake Total em processarAcertosAgentes — pedido do Cássio: "Seria legal
-- essa tela ser mais completa: Rake / Ganhos / %RB / RB" nas telas de
-- Super Agentes/Agentes.
alter table acertos_agentes add column if not exists player_result numeric not null default 0;

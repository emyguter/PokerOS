-- Ajuste de gerência/comitê (fila de aprovação) pode ser Permanente (vira
-- Stoploss Inicial dali pra frente) ou Só essa Semana (soma no Stoploss
-- Atual só até a virada da semana daquele clube — depois disso some do
-- cálculo ao vivo sozinho, mas continua visível no Extrato pra sempre).
alter table stoploss_historico add column if not exists escopo text not null default 'permanente' check (escopo in ('permanente', 'semanal'));

-- Hora local (0-23, horário de Brasília UTC-3 fixo) em que a semana desse
-- clube vira pra segunda-feira. Padrão 2h (a maioria dos clubes da LP);
-- Sul HG por exemplo vira à meia-noite (0).
alter table clubs add column if not exists hora_virada_semana integer not null default 2 check (hora_virada_semana between 0 and 23);

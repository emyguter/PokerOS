-- "Pagar com Rake?" — antes, toda Dívida/Acordo descontava automático do
-- Acerto (Rake) toda semana enquanto não fosse marcada paga na mão, sem
-- opção de escolher. Agora dá pra decidir por Dívida Simples inteira, ou
-- parcela a parcela dentro de um Acordo (pedido do Cássio): só quem estiver
-- marcado true entra no desconto/aparece no Acerto. Existentes viram true —
-- mantém o comportamento de hoje pra quem já estava cadastrado.
alter table dividas add column if not exists pago_com_rake boolean not null default true;
alter table divida_parcelas add column if not exists pago_com_rake boolean not null default true;

-- Remove o indicador "Fee Total" da lista usada nas condições SE/ENTÃO das
-- Regras (pedido do Cássio). Sem "on delete cascade" em regra_condicoes/
-- regra_condicao_termos — se esse indicador já estiver em uso em alguma
-- condição existente, o delete falha (erro de FK) em vez de quebrar a regra
-- silenciosamente; nesse caso, ajuste a condição antes de rodar de novo.
delete from indicadores where nome = 'Fee Total';

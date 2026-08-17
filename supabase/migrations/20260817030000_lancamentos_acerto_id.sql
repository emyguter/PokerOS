-- Pagamentos ("Envios") agora se vinculam a um Acerto específico — pedido
-- do Cássio pra montar Controle de Pagamentos (Suporte) e Cobrança
-- (Financeiro), espelhando a planilha "Controle de Pagamentos": cada
-- lançamento tipo=pagamento passa a apontar pro acerto que está quitando.
-- Lançamentos antigos (antes dessa migration) ficam com acerto_id nulo — não
-- aparecem retroativamente nas telas novas, só os pagamentos lançados daqui
-- pra frente.
alter table lancamentos add column if not exists acerto_id uuid references acertos(id);
create index if not exists idx_lancamentos_acerto_id on lancamentos(acerto_id);

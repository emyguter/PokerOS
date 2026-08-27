-- Dívida Simples "Pagar com Rake" ganha um modo gradual: em vez de descontar
-- o Valor Integral inteiro de uma vez no próximo Acerto, desconta só um % do
-- Rake do clube a cada semana (Rakeback), até quitar aos poucos. Pagamento
-- Mínimo (já existia só pro Acordo) passa a valer aqui também: numa semana
-- em que o % do Rake der menos que o Mínimo, não desconta nada — espera uma
-- semana melhor (confirmado pelo Cássio com a planilha de referência do
-- Sevens Pkr House: "Complemento Pgto Mínimo" desfazendo o desconto quando
-- fica abaixo do mínimo).
--
-- rakeback_pct null = comportamento de sempre (desconta tudo de uma vez).
-- rakeback_pct preenchido = modo gradual — saldo_restante começa igual ao
-- Valor Integral e vai caindo a cada semana até chegar a zero (Dívida
-- quitada automaticamente).
alter table dividas add column if not exists rakeback_pct numeric;
alter table dividas add column if not exists saldo_restante numeric;

-- Guarda a cotação usada no momento do cálculo dentro do próprio Acerto,
-- junto com Rake/Fee/etc. Antes disso o "Total Convertido" (ClubAcertoCard)
-- lia clubs.cotacao ao vivo — um valor sem histórico, que muda quando
-- alguém atualiza o cadastro, fazendo Acertos antigos mostrarem o Total
-- Convertido errado (perguntado pelo Cássio: "quando calculou foi com qual
-- valor?", sem resposta possível porque nada gravava isso). Null em Acertos
-- antigos (calculados antes dessa coluna existir) — ClubAcertoCard cai pro
-- valor ao vivo de clubs.cotacao como fallback só nesse caso.
alter table acertos add column if not exists cotacao numeric;

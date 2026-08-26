-- "Converter para (opcional)": permite que o Acerto de um clube mostre um
-- Total extra já convertido pra outra moeda de referência (ex: clube cadastrado
-- em PEN, mas o Acerto também mostra o Total em USD), reaproveitando o campo
-- clubs.cotacao que já existe (1 unidade de moeda_conversao vale `cotacao`
-- unidades da moeda do clube). Deixando moeda_conversao vazio (padrão),
-- nenhuma conversão extra é exibida — comportamento igual ao de antes.
alter table clubs add column if not exists moeda_conversao text;

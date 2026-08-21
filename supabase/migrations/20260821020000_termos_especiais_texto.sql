-- "Termos especiais" vira texto livre (pedido do Cássio) em vez de um
-- boolean/selo — a coluna do Resumo de Taxas passa a mostrar o texto direto
-- do cadastro do clube. Quem já tinha marcado true não tinha nenhum texto
-- registrado (o campo nunca existiu), então vira null pra todo mundo — quem
-- precisar, escreve a condição de verdade agora em Cadastro → Clube → Taxas.
alter table clubs alter column termos_especiais drop default;
alter table clubs alter column termos_especiais drop not null;
alter table clubs alter column termos_especiais type text using (null::text);

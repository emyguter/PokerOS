-- Vínculo de Acerto entre clubes: o mesmo clube em mais de uma plataforma
-- (ex: ClubGG + Sul HG) precisa aparecer como 1 conta só no Resumo de
-- Acertos, com os valores somados. Grupo aberto (2, 3 ou mais clubes) via
-- coluna auto-referenciada: cada clube aponta pro id de outro clube do
-- mesmo grupo (a "âncora"); null = sem vínculo (o próprio clube é a âncora
-- do seu grupo de 1). Não mexe em Acertos nem Controle de Pagamentos, só no
-- Resumo de Acertos (relatorios.resumo_acertos).
alter table clubs add column if not exists vinculo_acerto_grupo_id uuid references clubs(id);

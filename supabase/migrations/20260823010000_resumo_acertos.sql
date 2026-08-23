-- Novo relatório "Resumo de Acertos" (visão executiva, 1 linha por clube,
-- cruzando todas as Ligas de uma semana) — pedido a partir de uma planilha
-- de referência do Cássio ("Settlement Summary").

-- Permissão própria (não herda da "relatorios" genérica de propósito — é
-- dado sensível cross-clube/cross-liga, só deve abrir pra quem for
-- explicitamente liberado na tela de Permissões, mesmo padrão de
-- relatorios.taxas).
insert into permissoes (chave, nome, categoria) values
  ('relatorios.resumo_acertos', 'Relatório de Resumo de Acertos', 'Relatórios')
on conflict (chave) do nothing;

-- Novo relatório "Resumo de Taxas" (visão executiva, cross-clube) — pedido
-- do Cássio a partir de uma planilha de referência dele.

-- Marcador manual, editado no cadastro do clube — não é calculado, é só
-- pra sinalizar no resumo que aquele clube tem condição negociada fora do
-- padrão (ex: taxa combinada fora da faixa normal).
alter table clubs add column if not exists termos_especiais boolean not null default false;

-- Permissão própria (não herda da "relatorios" genérica de propósito — é
-- dado sensível de taxa cross-clube, só deve abrir pra quem for
-- explicitamente liberado na tela de Permissões).
insert into permissoes (chave, nome, categoria) values
  ('relatorios.taxas', 'Relatório de Resumo de Taxas', 'Relatórios')
on conflict (chave) do nothing;

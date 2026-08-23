-- Corte 50% ganha um jeito de reverter o STATUS (não o valor já cortado,
-- que continua permanente): clubs.corte_50_ativo liga quando o Corte 50% é
-- aplicado e desliga com o novo botão "Reverter status" no Resumo de
-- Stoploss — igual clubs.bloqueado, pura sinalização pro Relatório de
-- Acertos Pendentes.
alter table clubs add column if not exists corte_50_ativo boolean not null default false;

-- Novo relatório "Acertos Pendentes" (Relatórios): quem está devendo ou não
-- pagou (Acerto da semana + Dívidas antigas), vide planilha do Cássio.
-- Permissão própria, não herda da "relatorios" genérica de propósito (dado
-- sensível cross-clube) — mesmo padrão de relatorios.taxas/resumo_acertos.
insert into permissoes (chave, nome, categoria) values
  ('relatorios.acertos_pendentes', 'Relatório de Acertos Pendentes', 'Relatórios')
on conflict (chave) do nothing;

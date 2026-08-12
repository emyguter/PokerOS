-- Separa a permissão de Relatórios em duas, pra poder dar acesso só ao
-- relatório de Lançamentos (ex: pro CS ou outro setor) sem abrir a tela de
-- Lançamento/Financeiro de verdade nem o relatório de Acertos. A chave
-- antiga "relatorios" continua valendo pra quem já tinha ambas liberadas.
insert into permissoes (chave, nome, categoria) values
  ('relatorios.acertos', 'Relatório de Acertos', 'Relatórios'),
  ('relatorios.lancamentos', 'Relatório de Lançamentos', 'Relatórios')
on conflict (chave) do nothing;

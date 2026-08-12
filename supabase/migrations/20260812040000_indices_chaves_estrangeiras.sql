-- Postgres NÃO cria índice automático em coluna de chave estrangeira (só na
-- chave primária referenciada) — então toda consulta filtrando por
-- clube_id/agente_id/regra_id/etc (a maioria das consultas do app) hoje faz
-- uma varredura completa da tabela em vez de uma busca direta. Não dói ainda
-- porque o volume de dados é pequeno, mas piora conforme as tabelas de
-- evento crescem (stoploss_historico, lancamentos, import_rows, acertos).
-- `create index if not exists` é seguro de rodar em produção a qualquer
-- momento — não trava a tabela pra leitura/escrita de forma perceptível
-- nesse volume de dados, só cria a estrutura de busca.
create index if not exists idx_clubs_league_id on clubs(league_id);
create index if not exists idx_club_indicacoes_club_id on club_indicacoes(club_id);
create index if not exists idx_club_indicacoes_club_indicado_id on club_indicacoes(club_indicado_id);
create index if not exists idx_agente_plataformas_agente_id on agente_plataformas(agente_id);
create index if not exists idx_agente_jogadores_agente_id on agente_jogadores(agente_id);
create index if not exists idx_agente_jogadores_jogador_id on agente_jogadores(jogador_id);
create index if not exists idx_clube_agentes_clube_id on clube_agentes(clube_id);
create index if not exists idx_clube_agentes_agente_id on clube_agentes(agente_id);
create index if not exists idx_clube_jogadores_clube_id on clube_jogadores(clube_id);
create index if not exists idx_clube_jogadores_jogador_id on clube_jogadores(jogador_id);
create index if not exists idx_imports_league_id on imports(league_id);
create index if not exists idx_bronze_rows_import_id on bronze_rows(import_id);
create index if not exists idx_import_rows_import_id on import_rows(import_id);
create index if not exists idx_import_rows_club_id on import_rows(club_id);
create index if not exists idx_import_jogadores_import_id on import_jogadores(import_id);
create index if not exists idx_import_jogadores_clube_id on import_jogadores(clube_id);
create index if not exists idx_import_jogadores_agente_id on import_jogadores(agente_id);
create index if not exists idx_import_jogadores_jogador_id on import_jogadores(jogador_id);
create index if not exists idx_acertos_import_id on acertos(import_id);
create index if not exists idx_acertos_club_id on acertos(club_id);
create index if not exists idx_acertos_agentes_import_id on acertos_agentes(import_id);
create index if not exists idx_acertos_agentes_agente_id on acertos_agentes(agente_id);
create index if not exists idx_acertos_agentes_clube_id on acertos_agentes(clube_id);
create index if not exists idx_lancamentos_clube_id on lancamentos(clube_id);
create index if not exists idx_regra_condicoes_regra_id on regra_condicoes(regra_id);
create index if not exists idx_regra_condicao_termos_regra_condicao_id on regra_condicao_termos(regra_condicao_id);
create index if not exists idx_regra_condicao_termos_indicador_id on regra_condicao_termos(indicador_id);
create index if not exists idx_regra_entidades_regra_id on regra_entidades(regra_id);
create index if not exists idx_regra_entidades_entidade_id on regra_entidades(entidade_id);
create index if not exists idx_profiles_clube_id on profiles(clube_id);
create index if not exists idx_profiles_agente_id on profiles(agente_id);
create index if not exists idx_role_permissoes_role_id on role_permissoes(role_id);
create index if not exists idx_role_permissoes_permissao_id on role_permissoes(permissao_id);
create index if not exists idx_user_roles_user_id on user_roles(user_id);
create index if not exists idx_user_roles_role_id on user_roles(role_id);
create index if not exists idx_user_permissoes_user_id on user_permissoes(user_id);
create index if not exists idx_user_permissoes_permissao_id on user_permissoes(permissao_id);
create index if not exists idx_stoploss_historico_clube_id on stoploss_historico(clube_id);
create index if not exists idx_stoploss_ajustes_clube_id on stoploss_ajustes(clube_id);

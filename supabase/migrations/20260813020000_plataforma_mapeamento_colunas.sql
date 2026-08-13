-- Mapeamento de colunas por plataforma, pra dar suporte a formatos de
-- planilha novos (ex: ClubGG) sem precisar escrever um parser novo no
-- código pra cada um. Suporte mapeia uma vez (via popup na tela de
-- Importação: "essa coluna é Rake MTT, essa é Ganhos...") e o sistema
-- reaproveita esse mapeamento em toda importação futura dessa plataforma.
-- null = plataforma ainda usa parser fixo (PPPoker/GGPoker) ou ainda não
-- foi mapeada.
alter table plataformas add column if not exists mapeamento_colunas jsonb;

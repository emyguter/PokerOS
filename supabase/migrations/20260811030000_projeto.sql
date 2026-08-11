-- "Projeto" é uma marcação livre que pode viver em qualquer nível da
-- hierarquia (Mega Liga, Superliga, Liga ou Clube) — quem estiver embaixo
-- do nível marcado herda o mesmo projeto. Ex: LP = marca na Mega Liga
-- (cobre Superliga Particular + LP Global + LP Peru); Órion = marca na
-- Liga; Sul HG = marca direto no Clube (não tem liga própria).
alter table mega_ligas add column if not exists projeto text;
alter table super_leagues add column if not exists projeto text;
alter table leagues add column if not exists projeto text;
alter table clubs add column if not exists projeto text;

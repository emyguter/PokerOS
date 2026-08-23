-- Novo menu "Acertos" (topo do menu, fora de Relatórios) com acesso por
-- hierarquia: login vinculado a uma MegaLiga/SuperLiga/Liga/Clube vê os
-- Acertos da própria entidade + tudo que está abaixo dela na hierarquia
-- (nunca pros lados nem pra cima — confirmado pelo Cássio: "eu vejo a mim e
-- quem está abaixo"). Continua o mesmo padrão de profiles.clube_id/
-- agente_id já existente (login travado numa entidade só).
alter table profiles add column if not exists liga_id uuid references leagues(id);
alter table profiles add column if not exists super_league_id uuid references super_leagues(id);
alter table profiles add column if not exists mega_liga_id uuid references mega_ligas(id);

insert into permissoes (chave, nome, categoria) values
  ('acertos.ver', 'Acertos (menu novo)', 'Relatórios')
on conflict (chave) do nothing;

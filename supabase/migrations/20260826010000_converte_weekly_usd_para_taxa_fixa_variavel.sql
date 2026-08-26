-- Converte todos os clubes Weekly USD pra Taxa Fixa/Variável — decisão do
-- Cássio, confirmada explicitamente sabendo do impacto na fórmula:
--
--   Hoje (Weekly USD):        Valor do Acerto = Fee − Rebate
--   Depois (Taxa Fixa/Variável): Valor do Acerto = Rake Total + Resultado
--                                 do Jogador − Fee (+ Taxa Operacional,
--                                 se ligada no cadastro)
--
-- Ou seja: o resultado dos jogadores desses clubes passa a entrar na conta
-- do Acerto (hoje não entra), e Taxa Operacional passa a valer de verdade
-- pra quem tiver ela ligada no cadastro (hoje é ignorada pro Weekly USD).
-- Crypto Rebate não é afetado por essa migration — já funciona igual pra
-- qualquer tipo de clube, como exibição separada no card (ver
-- ClubAcertoCard.tsx / commit "Crypto Rebate vira exibição separada").
--
-- IMPORTANTE: isso só corrige o CADASTRO pra frente. Acertos de semanas já
-- calculadas desses clubes continuam com o valor antigo (fórmula Weekly
-- USD) até alguém clicar em "Recalcular" no import daquela semana — mesmo
-- cuidado das migrations anteriores, não recalculei nada automaticamente
-- aqui porque pode ter Pagamento/Envio já vinculado a Acertos antigos.

begin;

-- 1) Confere ANTES: quais clubes Weekly USD existem hoje.
select id, name, external_id, settlement_type, taxa_tipo, league_id
from clubs
where settlement_type = 'weekly_usd'
order by name;

-- 2) Corrige: settlement_type vira Taxa Fixa/Variável pra todos eles.
update clubs
set settlement_type = 'taxa_fixa_variavel'
where settlement_type = 'weekly_usd';

-- 3) Confere DEPOIS — mesmos clubes, já corrigidos (não deve sobrar
--    nenhuma linha, todos migraram pra taxa_fixa_variavel).
select id, name, external_id, settlement_type, taxa_tipo, league_id
from clubs
where settlement_type = 'weekly_usd';

commit;

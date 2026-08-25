-- Limpeza de dados: o "Recalcular" fazia "apaga tudo desse import_id,
-- depois insere de novo" sem checar se o delete deu erro. Um Pagamento/
-- Envio (lancamentos.acerto_id = FK) vinculado a UM Acerto desse import
-- travava o delete em massa do import INTEIRO — e como o erro não era
-- checado, o código seguia pro insert do mesmo jeito, empilhando um
-- conjunto novo de Acertos em cima do antigo a cada clique. Corrigido no
-- código (lib/acertos-engine.ts: agora é update por clube, não apaga-tudo-
-- e-insere) — essa migration só limpa o estrago que já existia (achado
-- investigando o PIXGAME, reportado pelo Cássio: "toda vez que recalcula,
-- ele tá acrescentando").
--
-- Escopo confirmado por consulta: só esse import
-- (2329-3183355-20260810-20260816.xlsx) tem duplicação — 19 clubes com 3
-- linhas cada (57 no total, deveriam ser 19). Nenhum outro import foi
-- afetado.
--
-- Mantém a linha que tem o Pagamento vinculado (lancamento de R$1.274,74,
-- 2026-08-17) — sem isso a limpeza quebraria a referência do Pagamento.
-- Pros outros 18 clubes (sem Pagamento vinculado), mantém a linha mais
-- recente (created_at mais novo).

begin;

-- 1) Confere ANTES.
select club_external_id, club_name, count(*) as qtd
from acertos
where import_id = '49d66422-5e73-4e7a-aeb6-824a724a8386'
group by club_external_id, club_name
having count(*) > 1
order by club_name;

-- 2) Apaga o excedente, mantendo a linha com Pagamento vinculado (id
-- ea564b11-9871-4bff-a230-d41849e2c0e6) e, pros demais clubes, a mais
-- recente.
with duplicatas as (
  select
    a.id,
    row_number() over (
      partition by a.club_external_id
      order by (a.id = 'ea564b11-9871-4bff-a230-d41849e2c0e6') desc, a.created_at desc
    ) as rn
  from acertos a
  where a.import_id = '49d66422-5e73-4e7a-aeb6-824a724a8386'
)
delete from acertos where id in (select id from duplicatas where rn > 1);

-- 3) Confere DEPOIS — deve voltar vazia (0 linhas).
select club_external_id, club_name, count(*) as qtd
from acertos
where import_id = '49d66422-5e73-4e7a-aeb6-824a724a8386'
group by club_external_id, club_name
having count(*) > 1;

commit;

-- IMPORTANTE: essa limpeza mantém a última linha calculada de cada clube,
-- que pode ainda refletir o valor ERRADO de clubes que estavam com
-- settlement_type trocado (Gallus, FLUXO POKER RN etc. — migration
-- 20260825050000). Depois de rodar essa limpeza, clica em "Recalcular"
-- mais uma vez nesse import — agora sem risco de duplicar de novo — pra
-- pegar o valor certo de todo mundo com os cadastros já corrigidos.

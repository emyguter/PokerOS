-- Limpeza de dados: race condition no botão "Calcular Acertos" (corrigida
-- em AcertosView.tsx) fez processarAcertos/processarAcertosAgentes rodarem
-- 2x pros imports abaixo (semana 2026-08-10 -> 2026-08-16, Liga Particular),
-- duplicando toda linha de acertos/acertos_agentes desses dois imports —
-- reportado pelo Cássio como clube repetido no Controle de Pagamentos/
-- Cobrança (ex: AK AMAKHA club 2, Ace Magnets PKR, 4 Naipes Poker, Ace
-- Antic).
--
-- Pra cada grupo (import_id, club_id) duplicado, mantém a linha que tiver
-- Pagamento vinculado (lancamentos.acerto_id) — é o caso real do Ace
-- Magnets PKR, que já tinha um Envio de R$3.917,64 registrado numa das duas
-- linhas. Se nenhuma linha do grupo tiver Pagamento vinculado, mantém 1
-- qualquer (mesmo dado calculado, não faz diferença qual sobra).
with duplicatas as (
  select
    a.id,
    row_number() over (
      partition by a.import_id, a.club_id
      order by (select count(*) from lancamentos l where l.acerto_id = a.id) desc, a.id
    ) as rn
  from acertos a
  where a.import_id in ('a958ebc6-49b5-4839-88d5-00d00db377ba', '24ccbf7b-bc55-4e8b-8dde-dd48f2e2f3d1')
)
delete from acertos where id in (select id from duplicatas where rn > 1);

-- Mesma race condition duplicou acertos_agentes desses dois imports
-- (processarAcertosAgentes roda no mesmo fluxo de processarAcertos) — sem
-- vínculo externo conhecido apontando pra essa tabela, mantém 1 linha
-- qualquer por grupo.
with duplicatas_agentes as (
  select
    id,
    row_number() over (partition by import_id, agente_id order by id) as rn
  from acertos_agentes
  where import_id in ('a958ebc6-49b5-4839-88d5-00d00db377ba', '24ccbf7b-bc55-4e8b-8dde-dd48f2e2f3d1')
)
delete from acertos_agentes where id in (select id from duplicatas_agentes where rn > 1);

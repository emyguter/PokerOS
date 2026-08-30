-- Limpeza de dados: acertos duplicados (mesmo clube + mesma semana, em
-- imports diferentes) se espalharam por praticamente todo o cadastro —
-- reimportações que não substituíram a importação existente direito (a
-- causa raiz foi corrigida em Importação, PRs #71-#73: agora o sistema
-- reconhece a Liga a partir de qualquer clube já cadastrado e detecta
-- duplicidade por arquivo+período mesmo quando a Liga não é identificada).
-- Essa migration só limpa o estrago que já estava gravado, achado
-- investigando o caso Liga H&H (WtR 4 Semanas contando a mesma semana
-- várias vezes em vez de 4 semanas de verdade).
--
-- Mesmo padrão de segurança das limpezas anteriores (20260825040000,
-- 20260825060000): pra cada grupo (club_external_id, period_end) com mais
-- de uma linha, mantém a que tiver Pagamento vinculado
-- (lancamentos.acerto_id) — nunca quebra essa referência — e, entre as
-- sem pagamento, mantém a mais recente (created_at mais novo).

begin;

-- 1) Confere ANTES — quantos grupos (clube, semana) têm mais de 1 Acerto.
select a.club_external_id, a.club_name, i.period_end, count(*) as qtd
from acertos a
join imports i on i.id = a.import_id
where a.club_external_id is not null
group by a.club_external_id, a.club_name, i.period_end
having count(*) > 1
order by i.period_end, a.club_name;

-- 2) Apaga o excedente de cada grupo.
with duplicatas as (
  select
    a.id,
    row_number() over (
      partition by a.club_external_id, i.period_end
      order by (exists (select 1 from lancamentos l where l.acerto_id = a.id)) desc, a.created_at desc
    ) as rn
  from acertos a
  join imports i on i.id = a.import_id
  where a.club_external_id is not null
)
delete from acertos where id in (select id from duplicatas where rn > 1);

-- 3) Mesma limpeza em acertos_agentes (mesma causa raiz, sem vínculo
-- externo conhecido apontando pra essa tabela — mantém a mais recente).
with duplicatas_agentes as (
  select
    aa.id,
    row_number() over (
      partition by aa.agente_id, aa.clube_id, i.period_end
      order by aa.created_at desc
    ) as rn
  from acertos_agentes aa
  join imports i on i.id = aa.import_id
)
delete from acertos_agentes where id in (select id from duplicatas_agentes where rn > 1);

-- 4) Confere DEPOIS — deve voltar vazia (0 linhas).
select a.club_external_id, a.club_name, i.period_end, count(*) as qtd
from acertos a
join imports i on i.id = a.import_id
where a.club_external_id is not null
group by a.club_external_id, a.club_name, i.period_end
having count(*) > 1;

commit;

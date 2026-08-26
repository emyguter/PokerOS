-- Backfill de clubs.taxa_tipo pra bater com a realidade de hoje. Esse campo
-- é só uma etiqueta informativa (Fixa/Variável) pro clube Taxa Fixa/
-- Variável — não afeta o cálculo, o motor (lib/acertos-engine.ts) já usa a
-- Regra vinculada no campo Rake Total quando existe, senão o número fixo
-- digitado em Taxas, independente do valor desse campo. Mas até agora
-- taxa_tipo nunca teve controle na tela pra escolher manualmente, então
-- ficava sempre travado em "fixa" desde a criação do clube (default da
-- coluna), mesmo em clube que já tem uma Regra vinculada há tempos.
--
-- Daqui pra frente o cadastro deriva isso sozinho ao salvar o clube
-- (ClubModal.tsx: com Regra vinculada em rake_total vira "variavel", sem
-- Regra vira "fixa") — essa migration só corrige de uma vez os clubes que
-- já existem hoje, sem precisar reabrir e salvar cada um na mão.

begin;

-- 1) Confere ANTES: quantos clubes ficariam "variavel" vs "fixa" e quantos
--    já estão certos hoje.
select
  c.taxa_tipo as taxa_tipo_atual,
  (exists (
    select 1 from regra_entidades re
    where re.entidade_id = c.id and re.entidade_tipo = 'clube' and re.campo = 'rake_total'
  )) as tem_regra_rake_total,
  count(*) as clubes
from clubs c
group by 1, 2
order by 1, 2;

-- 2) Corrige: taxa_tipo vira "variavel" pra quem tem Regra vinculada em
--    Rake Total e ainda não está marcado assim.
update clubs c
set taxa_tipo = 'variavel'
where taxa_tipo is distinct from 'variavel'
  and exists (
    select 1 from regra_entidades re
    where re.entidade_id = c.id and re.entidade_tipo = 'clube' and re.campo = 'rake_total'
  );

-- 3) Corrige: taxa_tipo vira "fixa" pra quem NÃO tem Regra vinculada em
--    Rake Total e ainda não está marcado assim.
update clubs c
set taxa_tipo = 'fixa'
where taxa_tipo is distinct from 'fixa'
  and not exists (
    select 1 from regra_entidades re
    where re.entidade_id = c.id and re.entidade_tipo = 'clube' and re.campo = 'rake_total'
  );

-- 4) Confere DEPOIS — mesma contagem da consulta 1, já corrigida (deve
--    sobrar só 2 linhas: variavel+tem_regra=true, fixa+tem_regra=false).
select
  c.taxa_tipo as taxa_tipo_atual,
  (exists (
    select 1 from regra_entidades re
    where re.entidade_id = c.id and re.entidade_tipo = 'clube' and re.campo = 'rake_total'
  )) as tem_regra_rake_total,
  count(*) as clubes
from clubs c
group by 1, 2
order by 1, 2;

commit;

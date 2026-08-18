-- Regra tipo 'faixa' (Cálculo de Acerto) agora tem um campo explícito
-- dizendo sobre qual taxa do clube (Fee MTT/Cash/Operacional/SpinUp) ela
-- vale — escolhido na própria tela, em vez de adivinhado a partir do
-- indicador usado na condição SE/ENTÃO. O jeito antigo deixava passar
-- regra "silenciosa": se a condição usasse um indicador fora da lista
-- mapeada (ex: "Fee Total"), a regra nunca aplicava em nada e o único
-- aviso disso ficava escondido na tela de Vínculos.

alter table regras add column if not exists campo text check (campo in ('fee_mtt', 'fee_cash', 'taxa_op', 'spinup'));

-- Backfill: pras regras que já existem, tenta inferir o campo do jeito
-- antigo (mesma lógica de lib/indicadores.ts campoFromCondicoes) — assim
-- quem já tinha uma Faixa funcionando não perde o vínculo ao abrir a tela
-- de novo. Só preenche se ainda não tiver campo definido.
update regras r
set campo = sub.campo
from (
  select distinct on (rc.regra_id) rc.regra_id,
    case i.nome
      when 'rake' then 'fee_cash'
      when 'rake_cash' then 'fee_cash'
      when 'rake_mtt' then 'fee_mtt'
      when 'rake_spinup' then 'spinup'
    end as campo
  from regra_condicoes rc
  join regra_condicao_termos rct on rct.regra_condicao_id = rc.id
  join indicadores i on i.id = rct.indicador_id
  where i.nome in ('rake', 'rake_cash', 'rake_mtt', 'rake_spinup')
  order by rc.regra_id, rc.ordem
) sub
where r.id = sub.regra_id and r.campo is null;

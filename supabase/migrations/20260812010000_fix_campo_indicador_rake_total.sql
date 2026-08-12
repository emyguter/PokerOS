-- Bug: o indicador "Rake" (Rake Total = Rake MTT + Rake Cash) não estava no
-- mapa indicador->campo. Fee Cash é a única das 4 taxas cuja % variável
-- multiplica sobre o Rake Total (não sobre a própria base) — então uma regra
-- com condição em "Rake" (sozinho ou somado com Ganhos, ex: "Rake+Ganhos",
-- usado pra WtR) deveria virar vínculo de Fee Cash. Sem esse mapeamento, o
-- vínculo era salvo com campo = null e o motor de acertos pulava ele inteiro
-- (regra_entidades.campo is null -> continue), ou seja, a regra não afetava
-- nenhum cálculo mesmo já vinculada. Repara os vínculos já existentes que
-- ficaram sem campo por causa disso.
do $$
declare
  r record;
  campo_calc text;
begin
  for r in
    select re.id as vinculo_id, re.regra_id
    from regra_entidades re
    where re.campo is null and re.entidade_tipo = 'clube'
  loop
    select case i.nome
      when 'rake_cash' then 'fee_cash'
      when 'rake' then 'fee_cash'
      when 'rake_mtt' then 'fee_mtt'
      when 'rake_spinup' then 'spinup'
    end
    into campo_calc
    from regra_condicoes rc
    join regra_condicao_termos rct on rct.regra_condicao_id = rc.id
    join indicadores i on i.id = rct.indicador_id
    where rc.regra_id = r.regra_id
      and i.nome in ('rake_cash', 'rake', 'rake_mtt', 'rake_spinup')
    order by rc.ordem, rct.ordem
    limit 1;

    if campo_calc is not null then
      update regra_entidades set campo = campo_calc where id = r.vinculo_id;
    end if;
  end loop;
end $$;

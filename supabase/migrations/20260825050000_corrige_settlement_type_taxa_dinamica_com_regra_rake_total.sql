-- Corrige clubes cadastrados como Taxa Dinâmica que na verdade são Taxa
-- Fixa/Variável — a Regra de taxa deles está vinculada no campo "Rake
-- Total" (regra_entidades.campo = 'rake_total'), que só é lido pelo motor
-- de cálculo (lib/acertos-engine.ts, calcularAcerto) quando
-- settlement_type = 'taxa_fixa_variavel'. Em Taxa Dinâmica o motor olha
-- fee_cash/fee_mtt/taxa_op/spinup — que ficam em branco nesses clubes —
-- então a Regra vinculada nunca era aplicada, mesmo estando corretamente
-- cadastrada (achado investigando o caso do Gallus, reportado pelo
-- Cássio: "tem taxa atrelado, pq não tá acatando").
--
-- Só corrige quem bate no padrão completo: Taxa Dinâmica, sem fee_cash_pct
-- nem fee_mtt_pct fixos cadastrados (não tem fallback nenhum), com Regra
-- vinculada em Rake Total e SEM nenhuma Regra vinculada em Fee Cash/Fee
-- MTT (pra não mexer em clube que já é Taxa Dinâmica de verdade e só tem
-- um vínculo de Rake Total sobrando por outro motivo).

begin;

-- 1) Confere ANTES: quais clubes batem no padrão.
select c.id, c.name, c.external_id, c.settlement_type, c.taxa_tipo, re.regra_id, r.nome as regra_nome
from clubs c
join regra_entidades re
  on re.entidade_id = c.id and re.entidade_tipo = 'clube' and re.campo = 'rake_total'
left join regras r on r.id = re.regra_id
where c.settlement_type = 'taxa_dinamica'
  and c.fee_cash_pct is null
  and c.fee_mtt_pct is null
  and not exists (
    select 1 from regra_entidades re2
    where re2.entidade_id = c.id and re2.entidade_tipo = 'clube' and re2.campo in ('fee_cash', 'fee_mtt')
  );

-- 2) Corrige: settlement_type vira Taxa Fixa/Variável pra esses clubes.
update clubs c
set settlement_type = 'taxa_fixa_variavel'
where c.settlement_type = 'taxa_dinamica'
  and c.fee_cash_pct is null
  and c.fee_mtt_pct is null
  and exists (
    select 1 from regra_entidades re
    where re.entidade_id = c.id and re.entidade_tipo = 'clube' and re.campo = 'rake_total'
  )
  and not exists (
    select 1 from regra_entidades re2
    where re2.entidade_id = c.id and re2.entidade_tipo = 'clube' and re2.campo in ('fee_cash', 'fee_mtt')
  );

-- 3) Confere DEPOIS — mesmos clubes, já corrigidos.
select c.id, c.name, c.external_id, c.settlement_type, c.taxa_tipo
from clubs c
join regra_entidades re
  on re.entidade_id = c.id and re.entidade_tipo = 'clube' and re.campo = 'rake_total'
where c.id in (select re3.entidade_id from regra_entidades re3 where re3.entidade_tipo = 'clube' and re3.campo = 'rake_total');

commit;

-- IMPORTANTE: isso só corrige o CADASTRO pra frente. Acertos de semanas já
-- calculadas desses clubes continuam com o valor antigo (errado) até
-- alguém clicar em "Recalcular" no import daquela semana — não recalculei
-- nada automaticamente aqui porque pode ter Pagamento/Envio já vinculado a
-- esses Acertos antigos (mesmo cuidado da limpeza de duplicatas anterior).

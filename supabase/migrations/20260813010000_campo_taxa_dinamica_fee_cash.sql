-- Confirmado: a regra "Taxa Dinâmica" (escala 0%-15% por WtR 4 Semanas) é a
-- taxa de Fee Cash — está escrito literalmente como "Taxa Dinâmica - Cash%"
-- na planilha manual de acerto do Cássio. O vínculo dessa regra com os
-- clubes nunca teve o campo definido (mesma causa do bug do indicador
-- "Rake" corrigido antes: WtR sozinho não aponta pra nenhuma taxa
-- específica, só o nome da própria regra confirma que é Fee Cash aqui) —
-- então o motor de acertos pulava a regra inteira pra esses clubes.
update regra_entidades re
set campo = 'fee_cash'
from regras r
where re.regra_id = r.id
  and re.entidade_tipo = 'clube'
  and re.campo is null
  and r.nome in ('Taxa Dinâmica', 'H&H Tx Dinâmica');

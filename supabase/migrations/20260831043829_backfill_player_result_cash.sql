-- Ganhos de Cash (player_result_cash) zerado em Acertos de semanas antes de
-- 28/08 -- até então o sistema só calculava e salvava o TOTAL (cash+MTT); a
-- correção pra separar Ganhos de Cash só passou a valer pra importações
-- NOVAS a partir daquela data, sem backfill do que já estava importado.
-- Isso deixava o WtR 4 Semanas errado (média puxada pra perto de 0 por
-- semanas com Ganhos de Cash = 0 que na verdade não são zero) — achado
-- investigando o caso Liga H&H.
--
-- Recuperável sem reimportar nada: o dado bruto de cada importação (aba
-- "Geral da liga" do PPPoker) fica salvo em import_rows.raw_data, com a
-- coluna "Ring Games" = exatamente o Ganhos de Cash (mesma fórmula usada
-- hoje no import, confirmado comparando com Acertos recentes já corretos).
-- Só atualiza onde dá pra confirmar a origem (raw_data tem a chave "Ring
-- Games") e onde hoje está zerado mas o Total não é zero — formatos sem
-- Ganhos de Cash próprio (GGPoker, clube-direto, mapeamento genérico,
-- SUL HG) corretamente continuam de fora, sem essa chave no raw_data.
--
-- Rodada em 2026-08-31: 858 Acertos zerados suspeitos -> 106 restantes
-- (esses 106 checados manualmente: raw_data sem a chave "Ring Games", ou
-- com "Ring Games" == 0 de verdade — não são bug, são formato sem
-- Ganhos de Cash próprio ou resultado de cash realmente zero naquela
-- semana).

-- Backfill em import_rows (fonte).
update import_rows ir
set player_result_cash = (ir.raw_data->>'Ring Games')::numeric
where ir.player_result_cash = 0
  and ir.player_result <> 0
  and jsonb_typeof(ir.raw_data) = 'object'
  and ir.raw_data ? 'Ring Games';

-- Backfill em acertos (o que a tela de Acertos/WtR realmente lê).
update acertos a
set player_result_cash = (ir.raw_data->>'Ring Games')::numeric
from import_rows ir
where ir.import_id = a.import_id
  and ir.club_external_id = a.club_external_id
  and a.player_result_cash = 0
  and a.player_result <> 0
  and jsonb_typeof(ir.raw_data) = 'object'
  and ir.raw_data ? 'Ring Games';

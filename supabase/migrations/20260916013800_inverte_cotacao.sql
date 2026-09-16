-- Cotação mudou de sentido: antes era "1 BRL vale quantos {moeda do clube}?"
-- (ex: 0,16667 pro CAZZINO, em USD), agora é "1 {moeda do clube} vale
-- quantos {moeda_conversao}?" (ex: 6,0) — mais natural com a moeda base
-- sendo o dólar (pedido do Cássio). Inverte os valores já cadastrados pra
-- manter exatamente o mesmo resultado final de conversão (a fórmula no
-- código trocou de dividir pra multiplicar, ver ClubAcertoCard.tsx).
update clubs set cotacao = 1 / cotacao where cotacao is not null and cotacao <> 0;
update acertos set cotacao = 1 / cotacao where cotacao is not null and cotacao <> 0;

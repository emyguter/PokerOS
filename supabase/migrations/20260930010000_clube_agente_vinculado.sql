-- Um Clube pode ser, na vida real, a MESMA pessoa/entidade que também atua
-- como Agente (ou Super Agente) em outro Clube/Liga totalmente diferente —
-- caso real "GetStar": clube na Liga Particular, clube na Orion (já resolvido
-- pelo Clube Vinculado, ver vinculo_acerto_grupo_id) e Super Agente no
-- SulHomeGaming. Faltava um jeito de declarar essa 3ª identidade — pedido do
-- Cássio: "não sei como dizer que ele é um agente".
--
-- agente_vinculado_id: 1 Clube -> 1 Agente (não é grupo aberto como o Clube
-- Vinculado — é só "esse Clube também é esse Agente"). Usado em
-- ClubAcertoCard.tsx pra somar o Acerto como Agente dentro do Total do Grupo
-- Econômico (ver lib/cadastro-api.ts, getAgenteVinculado/setAgenteVinculado).

alter table clubs add column if not exists agente_vinculado_id uuid references agentes(id) on delete set null;

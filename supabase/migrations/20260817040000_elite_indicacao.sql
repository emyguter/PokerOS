-- Bônus de Indicação (pedido do Cássio): quem indica outro clube ganha um
-- bônus automático sobre o PRÓPRIO rake — 10% (até R$1.000) se o clube for
-- Elite, senão 5% (até R$300). "Elite" é uma classificação do próprio
-- clube (não da indicação), por isso vive em clubs — ver etapa
-- Identificação do Cadastro de Clube. O valor calculado por Acerto fica em
-- acertos.indicacao_valor (não editável, sempre recalculado).
alter table clubs add column if not exists elite boolean not null default false;
alter table acertos add column if not exists indicacao_valor numeric not null default 0;

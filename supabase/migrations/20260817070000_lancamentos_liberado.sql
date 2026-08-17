-- "Liberar para Acerto": Bloqueio/Reembolso da Segurança e Bônus/Promoção/
-- Outro do Suporte já entram na soma do Valor do Acerto (o motor de cálculo
-- nunca mudou nisso), mas só ficam visíveis pro clube depois que o Suporte
-- libera explicitamente — dá tempo de revisar antes do clube ver.
alter table lancamentos add column if not exists liberado boolean not null default false;
alter table lancamentos add column if not exists liberado_em timestamptz;
alter table lancamentos add column if not exists liberado_por uuid references auth.users(id);

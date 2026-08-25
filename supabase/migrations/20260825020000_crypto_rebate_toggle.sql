-- Crypto Rebate ganha ON/OFF (mesmo padrão do toggle de Rebate normal) e os
-- lançamentos de Pagamento/Antecipação passam a poder ficar marcados como
-- pagos em crypto, pra aparecer identificado no Controle de Pagamentos.
alter table clubs add column if not exists crypto_rebate_ativo boolean not null default false;

-- Clubes que já tinham Crypto Rebate (%) preenchido antes desse toggle
-- existir continuam ativos, sem precisar reconfigurar nada.
update clubs set crypto_rebate_ativo = true where crypto_rebate_pct is not null;

alter table lancamentos add column if not exists pago_crypto boolean not null default false;

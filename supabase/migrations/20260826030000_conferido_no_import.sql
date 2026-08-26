-- "Liberar Acerto" na Conferência do App: carimbo de que o Suporte já
-- conferiu Rake/Ganhos dos clubes de maior rake desse import direto na
-- plataforma. Só um registro (data de quando conferiu) — não trava nem
-- libera nada em nenhuma outra tela, de propósito (pedido do Cássio).
alter table imports add column if not exists conferido_em timestamptz;

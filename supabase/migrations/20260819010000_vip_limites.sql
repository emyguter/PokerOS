-- Limite máximo de VIP por clube, configurável — antes era um teto fixo pra
-- liga toda (LIMITES_VIP em lib/vip.ts, agora removido). Cada clube passa a
-- ter seu próprio máximo por tipo, editado em VIP → Configurar Limites. Sem
-- valor configurado (null) = tratado como 0 — "se acabar, acabou" até
-- alguém definir o máximo daquele clube; o modal de confirmação continua
-- deixando lançar mesmo assim, é só aviso (ver ConfirmVipLimiteModal.tsx).
alter table clubs add column if not exists limite_vip_silver integer;
alter table clubs add column if not exists limite_vip_black integer;
alter table clubs add column if not exists limite_vip_platinum integer;

-- vip.relatorio e vip.limites não herdam de "vip" de propósito — mesmo
-- padrão de relatorios.taxas: visão cross-clube/administrativa sensível,
-- só abre pra quem for liberado explicitamente (tela de Permissões).
insert into permissoes (chave, nome, categoria) values
  ('vip.relatorio', 'VIP - Relatório', 'Financeiro'),
  ('vip.limites', 'VIP - Configurar Limites', 'Financeiro')
on conflict (chave) do nothing;

-- Tela de Segurança (pedido do Cássio): registra Bloqueio (débito, quando o
-- clube fez algo ilegal) ou Reembolso (crédito, quando o clube sofreu um
-- golpe) por incidente — Bot, Collusion, Chip Dumping, Multi-Accounting,
-- Prohibited Jurisdiction, VPN ou Outro. Cada lançamento entra no Acerto do
-- clube normalmente (como qualquer lançamento que não seja Caução — ver
-- AcertosView/ClubAcertoCard) e aparece no extrato do clube como "Bloqueio
-- da Segurança"/"Reembolso da Segurança"; a categoria específica do
-- incidente fica em categoria_seguranca, só pra referência interna.
alter table lancamentos drop constraint if exists lancamentos_origem_check;
alter table lancamentos add constraint lancamentos_origem_check check (origem in ('suporte', 'genia', 'seguranca'));
alter table lancamentos add column if not exists categoria_seguranca text;

insert into permissoes (chave, nome, categoria) values
  ('seguranca', 'Segurança', 'Segurança')
on conflict (chave) do nothing;

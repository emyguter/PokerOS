-- Histórico de Dívidas / Acertos Pendentes de anos anteriores (2021-2026),
-- importado da planilha manual que o Cássio mantinha antes do relatório
-- "Histórico de Acertos Pendentes" (lib/acertos-pendentes.ts) existir —
-- aquele é 100% calculado ao vivo em cima de acertos/lancamentos, então não
-- alcança anos/clubes de antes do sistema rastrear isso (muitos já nem
-- existem mais como clube cadastrado). Tabela só de leitura/referência —
-- não conta em Acerto nem em Dívidas/Acordos ativos (tabela `dividas`),
-- são conceitos separados.
create table if not exists dividas_historico (
  id uuid primary key default gen_random_uuid(),
  -- Aba de origem na planilha (Liga Particular / ORION) — guardado como
  -- veio da planilha, independente da Liga atual do clube (um clube pode
  -- ter trocado de Liga desde então).
  liga_planilha text not null check (liga_planilha in ('LP', 'ORION')),
  ano int not null,
  data date not null,
  -- Preenchido quando o nome bateu com um clube cadastrado hoje (match por
  -- nome, ver script de import) — null quando o clube já não existe mais
  -- no cadastro (comum, muitos são de 2021-2023).
  clube_id uuid references clubs(id),
  club_name_original text not null,
  status text,
  debet numeric not null default 0,
  pago numeric not null default 0,
  total numeric not null default 0,
  start_to_pay text,
  obs text,
  created_at timestamptz not null default now()
);

create index if not exists dividas_historico_clube_id_idx on dividas_historico(clube_id);
create index if not exists dividas_historico_ano_idx on dividas_historico(ano);

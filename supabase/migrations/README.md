# Migrations

A partir de agora, toda mudança de schema no Supabase vira um arquivo `.sql`
aqui, commitado junto com o PR que precisa dela — em vez de aplicada só na
mão, sem registro no repo (como vinha acontecendo até aqui).

## Convenção

- Nome do arquivo: `YYYYMMDDHHMMSS_descricao_curta.sql` (timestamp de quando
  foi escrita, não precisa ser exato — só serve pra manter ordem cronológica).
- Cada arquivo é **idempotente** sempre que der (`create table if not exists`,
  `add column if not exists`, `on conflict do nothing`), pra poder rodar de
  novo sem erro caso já tenha sido aplicado.
- Cada arquivo cobre **uma mudança/feature**, não várias misturadas.

## Como aplicar

Não estamos usando o Supabase CLI (sem setup local de banco ainda) — os
arquivos aqui são aplicados manualmente no SQL Editor do Supabase (dashboard)
ou via `mcp__Supabase__apply_migration` quando disponível. O arquivo commitado
no repo é a fonte de verdade do que *deveria* estar aplicado; se algum dia
migrar pro CLI de verdade (`supabase migration up`), esses mesmos arquivos já
servem de ponto de partida.

## Arquivos

- `00000000000000_baseline_reference.sql` — snapshot de referência do schema
  como estava *antes* dessa convenção começar (colunas/tipos/PK/FK/checks das
  tabelas principais). **Não é um script de recriação garantido** — não inclui
  policies de RLS, índices, triggers/functions nem sequences. Serve só pra
  contexto histórico; pra DDL exata, usa o dashboard do Supabase.
- `20260808010000_stoploss_control.sql` — cria `stoploss_atual` em `clubs`,
  tabelas `stoploss_historico`/`stoploss_ajustes`, RLS básica e as permissões
  `stoploss`/`stoploss.aprovar`. Já aplicada em produção (PR da feature de
  Controle de Stoploss).

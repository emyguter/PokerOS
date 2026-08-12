-- Histórico incremental do clube: toda vez que caução, ratio, stoploss
-- inicial ou alguma taxa muda, grava uma "foto" completa desses campos com a
-- data da alteração — não só o que mudou, mas tudo junto, pra poder
-- reconstruir "como o clube estava" numa data qualquer sem precisar juntar
-- pedaços espalhados. `clubs` continua sendo a tabela transacional (sempre o
-- valor de agora); essa aqui é só pra consulta de histórico/relatório.
create table if not exists clubs_historico (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  alterado_em timestamptz not null default now(),
  campos_alterados text[] not null,
  caucao_atual numeric,
  ratio_caucao_stoploss numeric,
  stoploss_inicial numeric,
  fee_cash_pct numeric,
  fee_mtt_pct numeric,
  taxa_op_pct numeric,
  spinup_pct numeric,
  hora_virada_semana integer
);
create index if not exists idx_clubs_historico_club_alterado on clubs_historico(club_id, alterado_em desc);
alter table clubs_historico disable row level security;

-- Dispara sozinho em qualquer INSERT/UPDATE em clubs — não depende de
-- nenhuma tela lembrar de gravar, nem escapa de uma edição feita direto no
-- Supabase. Só grava linha nova se algum dos campos rastreados realmente
-- mudou (evita ruído quando o UPDATE mexeu só em outro campo qualquer).
create or replace function fn_clubs_historico() returns trigger as $$
declare
  campos text[] := array[]::text[];
begin
  -- Cast explícito pra ::text em cada append: sem ele, o Postgres as vezes
  -- resolve "text[] || 'palavra'" como se fosse concatenar dois arrays (tenta
  -- interpretar 'palavra' como literal de array, tipo "{a,b}") em vez de
  -- adicionar o texto como item novo — e quebra com "malformed array literal".
  if TG_OP = 'UPDATE' then
    if new.caucao_atual is distinct from old.caucao_atual then campos := campos || 'caucao_atual'::text; end if;
    if new.ratio_caucao_stoploss is distinct from old.ratio_caucao_stoploss then campos := campos || 'ratio_caucao_stoploss'::text; end if;
    if new.stoploss_inicial is distinct from old.stoploss_inicial then campos := campos || 'stoploss_inicial'::text; end if;
    if new.fee_cash_pct is distinct from old.fee_cash_pct then campos := campos || 'fee_cash_pct'::text; end if;
    if new.fee_mtt_pct is distinct from old.fee_mtt_pct then campos := campos || 'fee_mtt_pct'::text; end if;
    if new.taxa_op_pct is distinct from old.taxa_op_pct then campos := campos || 'taxa_op_pct'::text; end if;
    if new.spinup_pct is distinct from old.spinup_pct then campos := campos || 'spinup_pct'::text; end if;
    if new.hora_virada_semana is distinct from old.hora_virada_semana then campos := campos || 'hora_virada_semana'::text; end if;
    if array_length(campos, 1) is null then return new; end if;
  else
    campos := array['criacao']::text[];
  end if;

  insert into clubs_historico (
    club_id, campos_alterados, caucao_atual, ratio_caucao_stoploss, stoploss_inicial,
    fee_cash_pct, fee_mtt_pct, taxa_op_pct, spinup_pct, hora_virada_semana
  ) values (
    new.id, campos, new.caucao_atual, new.ratio_caucao_stoploss, new.stoploss_inicial,
    new.fee_cash_pct, new.fee_mtt_pct, new.taxa_op_pct, new.spinup_pct, new.hora_virada_semana
  );

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_clubs_historico on clubs;
create trigger trg_clubs_historico
after insert or update on clubs
for each row execute function fn_clubs_historico();

-- Backfill: clube que já existia antes dessa migração não tem histórico
-- anterior de verdade (a gente não guardou isso até agora), então cria 1
-- linha "de largada" com os valores atuais na data de criação do clube —
-- é a melhor aproximação possível pro passado; a partir de agora todo
-- histórico novo fica exato.
insert into clubs_historico (club_id, alterado_em, campos_alterados, caucao_atual, ratio_caucao_stoploss, stoploss_inicial, fee_cash_pct, fee_mtt_pct, taxa_op_pct, spinup_pct, hora_virada_semana)
select id, coalesce(created_at, now()), array['criacao'], caucao_atual, ratio_caucao_stoploss, stoploss_inicial, fee_cash_pct, fee_mtt_pct, taxa_op_pct, spinup_pct, hora_virada_semana
from clubs c
where not exists (select 1 from clubs_historico h where h.club_id = c.id);

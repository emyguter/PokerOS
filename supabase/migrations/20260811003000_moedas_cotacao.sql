-- Cadastro de Moedas: cada moeda estrangeira usada por alguma Liga (campo
-- `moeda`, quando "Conversão do Dia" está ativa) tem uma taxa de câmbio
-- própria, de dois tipos:
--   'padrao'      — fica valendo até alguém trocar manualmente no Cadastro.
--   'cotacao_dia' — precisa ser preenchida/confirmada todo dia em que for
--                   calcular Acertos (ver `atualizado_em`).
create table if not exists moedas_cotacao (
  id uuid primary key default gen_random_uuid(),
  moeda text not null unique,
  tipo text not null default 'padrao' check (tipo in ('padrao', 'cotacao_dia')),
  valor numeric,
  atualizado_em date,
  created_at timestamptz default now()
);

insert into permissoes (chave, nome, categoria) values
  ('cadastro.moedas', 'Cadastro de Moedas', 'Cadastro')
on conflict (chave) do nothing;

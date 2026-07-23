# PokerOS — League Platform

> Infraestrutura financeira automatizada para ligas, clubes e agentes.
> *From game data to financial settlements — automatically.*

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 16 + React 19 + TypeScript |
| Estilo | Tailwind CSS v3 |
| Banco | Supabase (PostgreSQL) |
| Auth | Supabase Auth (login por email/senha) |
| Processamento assíncrono | Supabase Edge Functions (Deno) + Database Webhooks + pg_cron |
| Deploy | Vercel |

---

## Estrutura

    PokerOS/
    app/admin/cadastro/       -> mega-ligas, superligas, ligas, clubes, super-agentes, agentes, jogadores
    app/admin/permissoes/     -> tela de Permissões (papéis e usuários)
    app/importacao/           -> upload de planilhas (.xlsx)
    app/relatorios/           -> relatório de acertos
    app/lancamento/           -> lançar bônus/promoção/caução/pagamento por clube + aba de extrato (staff)
    app/extrato/              -> extrato do próprio clube (login de clube, sem sidebar de staff)
    app/login/                -> login (Supabase Auth)
    components/cadastro/      -> modais e tabela genérica de cadastro
    components/permissoes/    -> PermissoesView, RoleModal, UserModal
    components/importacao/    -> ImportacaoXlsx (fluxo bronze -> silver)
    components/acertos/       -> AcertosView
    components/lancamento/    -> LancamentoView (tabs), LancarForm, ExtratoView
    components/               -> Sidebar, Footer, PermissionGuard
    lib/                      -> types.ts, cadastro-api.ts, supabase.ts, permissions.tsx, acertos-engine.ts, indicadores.ts
    supabase/functions/       -> Edge Functions (harmonizar-import, limpar-bronze, criar-usuario)

---

## Hierarquia de Dados

    Mega Liga -> Superliga -> Liga -> Clube -> Indicacoes (clube sem liga)
                                          -> Agente -> Super Agente (agente com outros agentes vinculados)
                                                    -> Jogador

Um **Agente** vira **Super Agente** automaticamente quando outro agente aponta pra ele
(`superagente_id`) — não existe um papel separado de "Sub-Agente" no sistema.

---

## Motor de Cálculo (Acertos)

`lib/acertos-engine.ts` processa cada linha importada aplicando a regra do clube:

| Tipo de taxa (`settlement_type`) | Como calcula |
|---|---|
| `taxa_dinamica` (fixa) | Fee MTT fixo sobre rake MTT + `fee_cash_pct` fixo sobre rake cash + Taxa Operacional sobre rake cash + SpinUp |
| `taxa_dinamica` (variável) | Fee MTT fixo + a faixa SE/ENTÃO que bater (`regra_condicoes`, ex: "Ganhos+Rake") aplicada sobre o rake total + Taxa Operacional sobre rake cash |
| `taxa_fixa_variavel` | % fixo sobre rake total |
| `rakeback` | % de rakeback sobre rake total (rebate, não fee) |
| `weekly_usd` | Fee MTT fixo − (rebate + crypto rebate) |

As condições SE/ENTÃO (`regra_condicoes` + `regra_condicao_termos`) permitem montar variáveis
compostas somando mais de um indicador (ex: "Ganhos + Rake"), reaproveitável em Liga, Clube ou
Agente (`regra_entidades`).

---

## Importação de Planilhas — Arquitetura Bronze / Silver / Gold

A importação é resiliente a mudanças de formato: o navegador nunca escreve direto nas tabelas
finais.

1. **Bronze** — o arquivo original vai pro Supabase Storage (bucket `bronze-uploads`, retenção de
   7 dias) e os dados já parseados no navegador (mas ainda não interpretados como "verdade") viram
   um payload JSON em `bronze_rows`.
2. **Silver** — a gravação em `bronze_rows` dispara um Database Webhook que chama a Edge Function
   `harmonizar-import`, que escreve nas tabelas normalizadas (`import_rows`, `jogadores`,
   `agentes`, `clubs`, vínculos). Roda assíncrono, em segundo plano — a tela de Importação
   acompanha o status ao vivo via Supabase Realtime (`pendente` -> `processando` ->
   `harmonizado`/`erro`), nunca deixando o usuário sem saber o resultado.
3. **Gold** — `acertos`, calculado por `processarAcertos` (`lib/acertos-engine.ts`) a partir dos
   dados já harmonizados.
4. **Limpeza** — a Edge Function `limpar-bronze`, chamada 1x por dia via `pg_cron`, apaga o
   arquivo do Storage e as linhas de `bronze_rows` de importações já harmonizadas (ou com erro) há
   mais de 7 dias. O registro em `imports` e os dados normalizados nunca são apagados.

Deploy: `supabase functions deploy harmonizar-import --no-verify-jwt` e
`supabase functions deploy limpar-bronze --no-verify-jwt` (chamadas por webhook/cron, sem usuário
logado por trás). Já `criar-usuario` (usada pela tela de Permissões) é `supabase functions deploy
criar-usuario` **sem** `--no-verify-jwt` — quem chama é sempre um usuário logado no navegador, então
o próprio Supabase já barra chamada sem token válido antes de a function checar se é super admin.

---

## Permissões

Tela em `/admin/permissoes` (só visível/acessível pra quem é `is_super_admin` em `profiles`).

- **Papéis** (`roles`): conjunto de telas liberadas (`role_permissoes`), reaproveitável entre
  usuários.
- **Usuários**: cada usuário pode ter um ou mais papéis (`user_roles`) + exceções diretas
  (`user_permissoes`, "sempre permitir"/"sempre bloquear" além do que o papel já dá).
- Uma permissão (`permissoes`) existe pra cada tela hoje visível no menu (Mega Ligas, Superligas,
  Ligas, Clubes, Super Agentes, Agentes, Jogadores, Importação, Relatórios, Lançamento).
- **Tipo de acesso**: ao editar um usuário, dá pra escolher entre **Staff da liga** (papéis +
  exceções, como acima) ou **Login de clube** (`profiles.clube_id` preenchido) — esse segundo tipo
  ignora papéis/permissões por tela: o `Sidebar` detecta `clube_id` e mostra só o link "Extrato",
  travado no próprio clube.
- **Criar usuário** (botão "Novo Usuário" na aba Usuários): cria o login direto pelo front, sem
  precisar abrir o Supabase. Como isso exige a Admin API do Supabase (não dá pra criar usuário com
  a anon key no navegador), passa pela Edge Function `criar-usuario`, que confere se quem tá
  chamando é super admin antes de criar — email, senha (gerada automaticamente, com botão de
  copiar), nome, tipo de acesso e papéis/clube tudo na mesma tela.

**Importante:** hoje isso é enforcement de **front** (esconde menu, bloqueia a página client-side)
via `lib/permissions.tsx` + `PermissionGuard`. Não é ainda uma trava no banco (RLS por permissão) —
alguém acessando o Supabase diretamente não é barrado por isso. Virar RLS de verdade é o próximo
passo de hardening, ainda não feito.

---

## Lançamento & Extrato

Fluxo pra operação da liga registrar bônus, promoção, caução ou pagamento por clube, e o próprio
clube acompanhar o saldo.

- **`/lancamento`** (staff, permissão `lancamento`): duas abas.
  - **Lançar** — formulário rápido (clube, tipo, natureza crédito/débito, valor, data, descrição
    opcional) gravando em `lancamentos`, com lista dos últimos 10 lançamentos feitos (qualquer
    clube).
  - **Extrato** — mesmo componente `ExtratoView` usado em `/extrato`, com seletor de clube +
    filtros de tipo e período.
- **`/extrato`** (login de clube): mesma `ExtratoView`, mas com o clube travado em
  `profiles.clube_id` — sem seletor, sem acesso a outros clubes.
- `ExtratoView` calcula saldo corrente (créditos − débitos, ordem cronológica) e mostra cards de
  resumo (Créditos / Débitos / Saldo) + tabela com saldo acumulado por linha.
- Hoje é só visualização — o clube não contesta lançamento nenhum. O componente já foi desenhado
  pra isso caber depois (cada linha é uma entidade própria com `id`, dá pra pendurar um botão de
  contestação em cima sem redesenhar a tela).

---

## Como rodar local

    git clone <repo> && cd PokerOS
    npm install
    cp .env.local.example .env.local  # preencher credenciais
    npm run dev

Acesse: http://localhost:3000

---

## Variaveis de Ambiente

    NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxx

As Edge Functions usam `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, injetadas automaticamente
pelo Supabase — não precisa configurar manualmente.

---

## MVP — Status

### Concluído
- [x] Design system + layout base (sidebar, footer, navegação)
- [x] Cadastro: Mega Ligas, Superligas, Ligas, Clubes, Super Agentes, Agentes, Jogadores — CRUD completo
- [x] Login (Supabase Auth)
- [x] Condições SE/ENTÃO reutilizáveis (Liga/Clube/Agente), com indicadores compostos
- [x] Importação de .xlsx (PPPoker, GGPoker) com arquitetura bronze/silver/gold assíncrona
- [x] Motor de cálculo de acertos (taxa fixa, variável, rakeback, weekly USD)
- [x] Permissões por tela (papéis + exceções por usuário), com front de administração
- [x] Login de clube (`profiles.clube_id`) + menu "Lançamento" (bônus/promoção/caução/pagamento) e "Extrato" por clube

### Próximas fases
- [ ] RLS por permissão (hoje o controle de acesso é só client-side)
- [ ] Relatórios adicionais do escopo original (rake líquido da liga, resumo de acertos, PnL)
- [ ] Contestação de lançamento pelo clube
- [ ] Auditoria (histórico de importações, alterações de regras, ações de usuários)
- [ ] Exportação Excel

---

## Decisoes Tecnicas

**Front chama Supabase direto:** ok pra esse estágio, com RLS nas tabelas sensíveis.
Processamento pesado/assíncrono (harmonização de importação, limpeza) já roda em Edge Functions,
não no navegador.

**Sem microservicos:** monolito bem estruturado é o correto para o tamanho atual.

**Tailwind v3:** downgrade do v4 para garantir compatibilidade total.

---

*Simbolos: Espadas Copas Ouros Paus — From game data to financial settlements — automatically.*

# PokerOS — League Platform

> Infraestrutura financeira automatizada para ligas, clubes e agentes.
> *From game data to financial settlements — automatically.*

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 16 + React 19 + TypeScript |
| Estilo | Tailwind CSS v3, fontes via `next/font` (Playfair Display + DM Sans) |
| i18n | Toggle PT/EN client-side, sem roteamento (`lib/i18n.tsx`) |
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
    app/relatorios/           -> relatório de acertos (aba Por Clube + aba Por Agente)
    app/lancamento/           -> lançar bônus/promoção/caução/pagamento por clube + aba de extrato (staff)
    app/extrato/              -> extrato do próprio clube (login de clube, sem sidebar de staff)
    app/agente/extrato/       -> "Meus Ganhos" do próprio agente (login de agente, sem sidebar de staff)
    app/login/                -> login (Supabase Auth)
    components/cadastro/      -> modais e tabela genérica de cadastro
    components/permissoes/    -> PermissoesView, RoleModal, UserModal, NewUserModal
    components/importacao/    -> ImportacaoXlsx (fluxo bronze -> silver)
    components/acertos/       -> AcertosView, ClubAcertoCard (Acerto Geral por clube), AgentesAcertosView
    components/lancamento/    -> LancamentoView (tabs), LancarForm, ExtratoView
    components/               -> Sidebar, Footer, PermissionGuard
    lib/                      -> types.ts, cadastro-api.ts, supabase.ts, permissions.tsx, acertos-engine.ts, indicadores.ts, i18n.tsx
    lib/locales/              -> pt.ts, en.ts (dicionário do toggle de idioma)
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

**Parsing do PPPoker (`components/importacao/ImportacaoXlsx.tsx`):** a aba "Geral da liga" não
preenche a coluna "Geral" (total) de Ganhos do jogador nem de Ganhos do clube — só as colunas
quebradas por tipo de jogo/taxa vêm com valor. Confirmado com a planilha de acerto manual do
Cássio (fórmula real das abas "Taxa Dinâmica" + "BASE TX DINAMICA"):

- **Rake MTT** = Taxa (jogos PPST) + Taxa (jogos não PPST)
- **Rake Cash** = Taxa (jogos PPSR) + Taxa (jogos não PPSR)
- **Rake Total** = Rake MTT + Rake Cash
- **Ganhos** (player_result) = soma de Ring Games + MTT/SitNGo + SPINUP + Caribbean+ + Color Game
  + Crash + Lucky Draw + Jackpot + Dividir EV

PPST/PPSR não têm nada a ver com hierarquia de liga apesar do nome parecido — são só como o
PPPoker rotula as duas categorias de taxa nesse relatório. Importações antigas não precisam ser
reimportadas: `bronze_rows`/`import_rows.raw_data` já guarda os valores originais por nome de
coluna, então um `UPDATE` retroativo em `import_rows` + clicar "Recalcular" no import (na tela de
Relatórios) já refaz as contas certas em cima do que já foi importado.

**Sinal na tela de Acertos (`components/acertos/AcertosView.tsx`):** "Taxa" (fee cobrado do clube
pelo serviço de liga) sempre aparece negativo. O antigo "Result. Jogador" virou **"Ganhos"**. Pro
tipo de cobrança "taxa" (dinâmica ou fixa/variável), o **Valor do Acerto = Rake Total + Ganhos −
Taxa** — confirmado com a fórmula real da planilha manual do Cássio (`=ARRED(SOMA(...);2)`, soma
lisa de todas as linhas do card de Acerto Geral). Bug corrigido em duas partes: primeiro o Valor do
Acerto repetia exatamente a Taxa (ignorando os Ganhos), depois — mesmo já somando os Ganhos —
ainda faltava o Rake Total na conta.

**Acerto Geral por clube (`components/acertos/ClubAcertoCard.tsx`):** clicando no nome do clube na
tabela de Acertos abre o card no formato tradicional que a liga já usa (linha a linha: Ganhos, Rake
MTT/Cash/Total, Fee MTT/Cash/Operacional/SpinUp, Rebate, WtR 4 Semanas, Bilhetes, Pendências de
Antecipação, Taxa AA Home Game, Security, Lançamentos do período, Total). `fee_calculado` do motor
foi quebrado em 4 componentes (`fee_mtt_valor`, `fee_cash_valor`, `fee_operacional_valor`,
`fee_spinup_valor`) pra dar pra mostrar cada linha separada. Bilhetes/Pendências de
Antecipação/Taxa AA Home Game são campos editáveis por clube/semana (gravados direto em `acertos`,
preservados entre recálculos); WtR 4 Semanas é a média móvel automática das últimas 4 importações
do mesmo clube.

**Lançamentos na tabela de Acertos:** a pedido do Cássio ("essa tabelona, só que completa"), a
tabela de Acertos e o card tradicional agora somam os lançamentos (bônus/promoção/caução/pagamento,
tela `/lancamento`) do próprio clube dentro do período do import (`data_lancamento` entre
`period_start`/`period_end`). A coluna "Acerto (Rake)" continua mostrando só o cálculo automático
por rake; "Lançamentos" mostra o líquido (créditos − débitos) do período; e "Valor Acerto" — o
número final — já é a soma dos dois. Sem período no import, os lançamentos ficam de fora (não tem
como filtrar por data).

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

## Acerto de Agentes (Rakeback)

Um Agente pode atender vários Clubes ao mesmo tempo (`clube_agentes`, N:N), e o **% de rakeback é
por clube** — não é uma taxa única do agente (`clube_agentes.rakeback_pct`).

- **Cálculo:** `processarAcertosAgentes` (`lib/acertos-engine.ts`), disparado junto com "Recalcular"
  na tela de Acertos, agrupa `import_jogadores` (já existente desde o harmonizar-import, com
  `agente_id`/`clube_id`/`rake_total` por jogador) por Agente × Clube, soma o rake e aplica o
  `rakeback_pct` daquele par específico, gravando em `acertos_agentes` (um registro por Agente ×
  Clube × Import).
- **Staff (Cássio):** aba "Por Agente" em Relatórios (`components/acertos/AgentesAcertosView.tsx`)
  — lista todos os agentes, com o total consolidado e um clique pra expandir e ver o detalhe por
  clube (rake, %, valor do rakeback).
- **Login de agente:** `/agente/extrato` reaproveita o mesmo componente travado no próprio
  `profiles.agente_id` (`agenteIdFixo`) — o agente só vê o próprio consolidado, por clube, sem
  acesso aos outros agentes.

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
  exceções, como acima), **Login de clube** (`profiles.clube_id` preenchido) ou **Login de agente**
  (`profiles.agente_id` preenchido) — esses dois últimos ignoram papéis/permissões por tela: o
  `Sidebar` detecta `clube_id`/`agente_id` e mostra só um link travado ("Extrato" ou "Meus Ganhos"),
  sem o menu completo de staff.
- **Criar usuário** (botão "Novo Usuário" na aba Usuários): cria o login direto pelo front, sem
  precisar abrir o Supabase. Como isso exige a Admin API do Supabase (não dá pra criar usuário com
  a anon key no navegador), passa pela Edge Function `criar-usuario`, que confere se quem tá
  chamando é super admin antes de criar — email, senha (gerada automaticamente, com botão de
  copiar), nome, tipo de acesso e papéis/clube/agente tudo na mesma tela.

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

## Idioma (PT/EN)

Botão PT/EN no topo da Sidebar (e no canto da tela de login, que fica fora da Sidebar). Troca os
textos na hora, guarda a escolha no `localStorage` do navegador — não mexe em rotas nem faz round
trip com o servidor.

- `lib/i18n.tsx` — `I18nProvider`/`useI18n()`, mesmo padrão do `PermissionsProvider`.
- `lib/locales/pt.ts` e `lib/locales/en.ts` — dicionário, chaves por seção (`nav`, `login`,
  `permissoes`, `lancamento`, `extrato`, uma por tela de cadastro, etc).
- **Cobertura atual:** navegação, login, as 7 telas de cadastro (cabeçalho/busca/botão novo),
  tabela genérica, Permissões e Lançamento/Extrato inteiros. Os modais grandes de Liga/Clube/Agente/
  Jogador (formulários de regra financeira SE/ENTÃO) ainda estão só em português — é bastante texto
  de regra de negócio pra traduzir com cuidado, fica pra uma próxima rodada.
- Já existiu uma tentativa de i18n via `next-intl` (rotas por idioma) que nunca chegou a ser
  ligada de verdade — foi removida em favor dessa abordagem mais simples, que é o que a operação
  pediu (sem mudar URL).

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
- [x] Criar usuário direto pelo front (Edge Function `criar-usuario`)
- [x] Toggle de idioma PT/EN (navegação, login, cadastros, Permissões, Lançamento/Extrato)
- [x] Sidebar retrátil (botão pra esconder/mostrar) + viewport meta tag pro celular
- [x] Acerto Geral por clube no formato tradicional (card ao clicar no nome do clube em Relatórios)
- [x] Acerto de Agentes: rakeback por clube (`clube_agentes.rakeback_pct`), aba "Por Agente" em
  Relatórios pro staff, e tela própria "Meus Ganhos" pro login de agente
- [x] Login de agente (`profiles.agente_id`) como terceiro tipo de acesso em Permissões

### Próximas fases
- [ ] RLS por permissão (hoje o controle de acesso é só client-side)
- [ ] Relatórios adicionais do escopo original (rake líquido da liga, resumo de acertos, PnL)
- [ ] Contestação de lançamento pelo clube
- [ ] Layout responsivo completo (hoje só o viewport + sidebar retrátil; tabelas/formulários do admin ainda assumem tela grande)
- [ ] Auditoria (histórico de importações, alterações de regras, ações de usuários)
- [ ] Exportação Excel
- [ ] Tradução EN dos modais de Liga/Clube/Agente/Jogador (regras financeiras SE/ENTÃO)

---

## Decisoes Tecnicas

**Front chama Supabase direto:** ok pra esse estágio, com RLS nas tabelas sensíveis.
Processamento pesado/assíncrono (harmonização de importação, limpeza) já roda em Edge Functions,
não no navegador.

**Sem microservicos:** monolito bem estruturado é o correto para o tamanho atual.

**Tailwind v3:** downgrade do v4 para garantir compatibilidade total.

---

*Simbolos: Espadas Copas Ouros Paus — From game data to financial settlements — automatically.*

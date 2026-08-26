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
| `taxa_dinamica` (fixa) | Fee MTT fixo sobre rake MTT + `fee_cash_pct` fixo sobre rake cash + Taxa Operacional sobre rake **total** + SpinUp |
| `taxa_dinamica` (variável) | Fee MTT fixo + a faixa SE/ENTÃO que bater (`regra_condicoes`, ex: "Rake+Ganhos", indicador WtR) aplicada sobre o rake **cash** + Taxa Operacional sobre rake **total** — base de cada taxa confirmada célula a célula contra a planilha manual "LPLPG_ACERTOS" do Cássio (fixa e variável usam a mesma base) |
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

**Bilhetes e Pendências/Antecipação no card do Acerto (`ClubAcertoCard.tsx`):** os dois eram campos
manuais, digitados à mão toda semana. Confirmado com o Cássio: **Bilhetes** = Valor do ticket ganho
(coluna S, índice 18) − Buy-in de ticket (coluna T, índice 19) da aba "Geral da liga" do PPPoker —
vem calculado do próprio arquivo (`import_rows.bilhetes`), sem edição manual. **Pendências /
Antecipação** = soma dos lançamentos tipo Antecipação do Suporte já conciliados (`conciliado_com`
preenchido) dentro do período do acerto — por isso Antecipação saiu da lista "Lançamentos do
período" do card (contar nos dois lugares dobrava o valor). Os dois são recalculados do zero a cada
"Recalcular"; só a Taxa AA Home Game continua manual e preservada.

**Taxa Operacional vira on/off (`clubs.taxa_op_ativo`):** antes, sempre que `taxa_op_pct` tinha um
valor o motor cobrava — não dava pra desligar sem apagar o número. Agora tem o mesmo toggle que o
Rebate já tinha (`ClubModal.tsx`, etapa Taxas): desligado, o motor ignora o % (`fee_operacional_valor`
fica 0) mesmo que o campo continue preenchido — religar depois não perde o número digitado. Clubes já
cadastrados nascem com `taxa_op_ativo = true` (mantém o comportamento de sempre cobrar que já tinham);
clube novo pré-cadastrado automático no import nasce com `false` (mesma regra das outras taxas em
branco). O card de Acerto (`ClubAcertoCard.tsx`) mostra "Taxa Operacional (desativada)" quando
estiver off, em vez do "(0%)" enganoso.

**Controle de Pagamentos (Suporte) e Cobrança (Financeiro) — `lib/pagamentos.ts`:** espelha a
planilha "Controle de Pagamentos" do Cássio. Lançamentos tipo `pagamento` do Suporte agora se
vinculam a um Acerto (`lancamentos.acerto_id`) — escolhido num seletor novo que aparece em Lançar
quando tipo=Pagamento — e cada um vira um "Envio". As duas telas usam os mesmos dados
(`agregarPagamentos`: Valor do Acerto − soma assinada dos Envios do período = Diferença), só a
apresentação muda: Suporte (`ControlePagamentosView.tsx`) mostra cada Envio numa coluna própria,
Financeiro (`CobrancaView.tsx`, aba "Cobrança") só o total pago. A cor da Diferença é invertida
entre as duas (`corDiferenca`): no Suporte é do ponto de vista do clube (vermelho = clube precisa
pagar, azul = precisa receber); no Financeiro é do ponto de vista da liga (vermelho = liga precisa
pagar, azul = liga vai receber) — mesmo número, framing oposto, confirmado com o Cássio. Lançamentos
de pagamento antigos (antes dessa migration) ficam com `acerto_id` nulo e não aparecem
retroativamente nessas telas, só os lançados daqui pra frente.

**Bônus de Indicação (`club_indicacoes.taxa_indicacao_pct`, `acertos.indicacao_valor`):**
quando um clube indica outro (etapa Garantias & Limites do Cadastro, "Indicações"), ele ganha um
bônus automático sobre o rake **do clube indicado** (não o próprio) igual à % digitada naquele
vínculo, sem teto. Com mais de uma indicação, cada uma usa o rake do seu próprio indicado e os
valores em R$ somam (não dá pra somar os percentuais antes — cada indicação pode ter uma base de
rake diferente). `calcularIndicacao` (`lib/acertos-engine.ts`) recalcula sozinho toda vez que o
Acerto roda. Aparece como uma linha própria "Indicação (X%)" no card de Acerto — como o valor não é
mais uma simples fração do próprio rake do clube, o % mostrado é buscado direto dos vínculos
cadastrados hoje (soma de `taxa_indicacao_pct`), mesma simplificação já usada nos outros % do card
(Taxa MTT/Cash etc: mostra a config atual, não a histórica de quando o Acerto foi calculado — só o
valor em R$ é o gravado). Sem mexer na Taxa A-A Home Game (linha separada, continua manual).
**Histórico:** esse já foi o modelo original
(`taxa_indicacao_pct`), depois virou um bônus fixo por `clubs.elite` (10%/5%, teto R$1.000/R$300) —
confirmado com o Cássio que aquilo era do programa VIP (fora do MVP) e a Indicação devia ter ficado
simples o tempo todo; voltou a ser a % digitada por vínculo. `clubs.elite` ficou na base sem uso
(dado histórico) — o toggle "Clube Elite" saiu do Cadastro.

**Sinal na tela de Acertos (`components/acertos/AcertosView.tsx`):** "Taxa" (fee cobrado do clube
pelo serviço de liga) sempre aparece negativo. O antigo "Result. Jogador" virou **"Ganhos"**. Pro
tipo de cobrança "taxa" (dinâmica ou fixa/variável), o **Valor do Acerto = Rake Total + Ganhos −
Taxa** — confirmado com a fórmula real da planilha manual do Cássio (`=ARRED(SOMA(...);2)`, soma
lisa de todas as linhas do card de Acerto Geral). Bug corrigido em duas partes: primeiro o Valor do
Acerto repetia exatamente a Taxa (ignorando os Ganhos), depois — mesmo já somando os Ganhos —
ainda faltava o Rake Total na conta.

**Bug: base errada de Fee Cash/Taxa Operacional:** o motor multiplicava Fee Cash variável sobre o
Rake Total e Taxa Operacional sobre o Rake Cash — o oposto do que a planilha manual do Cássio
mostra célula a célula (Fee Cash, fixo ou variável, sempre sobre o Rake Cash; Taxa Operacional
sempre sobre o Rake Total). Corrigido; acertos calculados antes disso com Fee Cash variável e/ou
Taxa Operacional variável precisam de "Recalcular".

**Lançamentos na tela de Acertos não somam Caução:** `bônus`/`promoção`/`pagamento` do período
entram no Valor do Acerto (pedido do Cássio, ver abaixo), mas `caução` fica de fora de propósito —
ela vive no extrato dela mesma e alimenta o Stoploss; somar no Acerto semanal de rake misturaria as
duas contas.

**Acerto Geral por clube (`components/acertos/ClubAcertoCard.tsx`):** clicando no nome do clube na
tabela de Acertos abre o card no formato tradicional que a liga já usa (linha a linha: Ganhos, Rake
MTT/Cash/Total, Fee MTT/Cash/Operacional/SpinUp, Rebate, WtR 4 Semanas, Bilhetes, Pendências de
Antecipação, Taxa AA Home Game, Security, Lançamentos do período, Total). `fee_calculado` do motor
foi quebrado em 4 componentes (`fee_mtt_valor`, `fee_cash_valor`, `fee_operacional_valor`,
`fee_spinup_valor`) pra dar pra mostrar cada linha separada. Bilhetes/Pendências de
Antecipação/Taxa AA Home Game são campos editáveis por clube/semana (gravados direto em `acertos`,
preservados entre recálculos); WtR 4 Semanas é a média móvel automática das últimas 4 importações
do mesmo clube — a menos que o clube ainda não tenha 4 semanas seguidas de histórico no banco. Nesse
caso, se existir um `wtr4_semanas_manual` cadastrado (Cadastro > Clube > etapa Regras), ele entra
como tapa-buraco; assim que o histórico ficar suficiente (ex: Cássio subindo os imports que faltam),
o cálculo automático volta a mandar sozinho, mesmo com o campo manual ainda preenchido — não precisa
apagar na mão. Seed inicial com os valores da planilha do Cássio: migration
`20260813030100_seed_wtr4_semanas_manual.sql` (39 clubes).

**Lançamentos na tabela de Acertos:** a pedido do Cássio ("essa tabelona, só que completa"), a
tabela de Acertos e o card tradicional agora somam os lançamentos (bônus/promoção/caução/pagamento,
tela `/lancamento`) do próprio clube dentro do período do import (`data_lancamento` entre
`period_start`/`period_end`). A coluna "Acerto (Rake)" continua mostrando só o cálculo automático
por rake; "Lançamentos" mostra o líquido (créditos − débitos) do período; e "Valor Acerto" — o
número final — já é a soma dos dois. Sem período no import, os lançamentos ficam de fora (não tem
como filtrar por data).

**Bug: "Lançamentos" dobrado na tabela de Acertos:** a consulta de lançamentos do Acertos
(`AcertosView`/`ClubAcertoCard`) não filtrava por `origem` — somava tanto o que o Suporte lançou
quanto o espelho de conferência que o Financeiro (`genia`) lança pra mesma transação depois de
confirmada (ver Conciliação), dobrando o valor. Corrigido com `.in('origem', ['suporte',
'seguranca'])`, igual à regra que o `ExtratoView` já seguia.

**Tela de Segurança (`/seguranca`, permissão `seguranca`):** pedido do Cássio — registra Bloqueio
(débito, clube fez algo ilegal) ou Reembolso (crédito, clube sofreu um golpe), com a categoria do
incidente (Bot, Collusion, Chip Dumping, Multi-Accounting, Prohibited Jurisdiction, VPN, Other —
lista fixa em `CATEGORIAS_SEGURANCA`, ampliável) só como referência interna. Grava em `lancamentos`
com `origem = 'seguranca'` e `tipo` = `seguranca_bloqueio`/`seguranca_reembolso`, então entra no
Acerto do clube normalmente (mesma regra de qualquer lançamento que não seja Caução) e aparece no
extrato do clube (`/extrato`) como "Bloqueio da Segurança"/"Reembolso da Segurança" — sem a
categoria específica, que fica só nas telas internas (Segurança, Relatório de Lançamentos). Suporte,
Financeiro e Segurança podem editar/apagar um lançamento já feito (`EditarLancamentoModal`,
reaproveitado nas três telas — pra Segurança ele troca o Tipo/Natureza genéricos pelos mesmos
campos Ação + Categoria da tela de Segurança, mantendo Bloqueio/Reembolso sempre coerente com
débito/crédito).

**Bug: `acertos.club_id` sempre nulo:** `calcularAcerto` gravava `club_id` a partir de
`import_rows.club_id` — campo que a `harmonizar-import` nunca preenche (só grava
`club_name`/`club_external_id` ali). O cálculo em si sempre usou o clube certo (casado por
`external_id` ou nome), só o `club_id` salvo no acerto ficava nulo — quebrando silenciosamente
tanto os Lançamentos quanto o carregamento das taxas do clube dentro do card (`Taxa Atual %`,
Security etc, que dependem de `acerto.club_id`). Corrigido pra gravar o `id` do clube já casado.
Acertos calculados antes dessa correção precisam só de "Recalcular" (não precisa reimportar).

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

## Testes

    npm test

Testes automatizados (Vitest) cobrindo as partes de cálculo puro mais sensíveis do app —
funções que não fazem chamada de rede, então rodam em milissegundos e não precisam de um projeto
Supabase de verdade:

- `lib/__tests__/acertos-engine.test.ts` — motor de cálculo de Acertos (`valorIndicador`,
  `avaliarCondicoes`, `calcularAcerto`) pros 4 tipos de cobrança (`taxa_dinamica` fixa e variável,
  `taxa_fixa_variavel`, `rakeback`, `weekly_usd`), incluindo a base de cada taxa (Fee Cash sobre
  Rake Cash, Taxa Operacional sobre Rake Total).
- `lib/__tests__/stoploss.test.ts` — virada de semana (`inicioSemanaAtual`, a lógica de fuso BRL
  fixo UTC-3 mais delicada do sistema), fórmula do Stoploss Atual e o corte de ajuste
  Permanente/Só-essa-semana (`somarHistorico`), incluindo reconstrução "como estava numa data
  passada".
- `lib/__tests__/indicadores.test.ts` — mapeamento indicador → campo do clube
  (`campoFromCondicoes`), com teste de regressão do bug do indicador "Rake" (total) não reconhecido
  que já quebrou um vínculo de verdade.

`valorIndicador`, `avaliarCondicoes`, `calcularAcerto` e `somarHistorico` foram exportados de
`lib/acertos-engine.ts`/`lib/stoploss.ts` especificamente pra dar pra testar direto (antes só as
funções com I/O de banco eram exportadas) — não muda nenhum comportamento.

**Cobertura atual:** só a lógica de cálculo pura. Fluxos que dependem do Supabase (importação,
salvar cadastro, aprovar ajuste) ainda não têm teste automatizado — hoje isso é validado testando
manualmente na tela a cada mudança, como já vinha sendo feito.

---

## Migrations

Mudança de schema vira um `.sql` versionado em `supabase/migrations/`, commitado junto com o PR
que precisa dela — ver `supabase/migrations/README.md` pra convenção de nome e como aplicar.

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
- [x] Sidebar retrátil no desktop (botão pra esconder/mostrar) + viewport meta tag pro celular
- [x] Acerto Geral por clube no formato tradicional (card ao clicar no nome do clube em Relatórios)
- [x] Acerto de Agentes: rakeback por clube (`clube_agentes.rakeback_pct`), aba "Por Agente" em
  Relatórios pro staff, e tela própria "Meus Ganhos" pro login de agente
- [x] Login de agente (`profiles.agente_id`) como terceiro tipo de acesso em Permissões
- [x] Controle de Stoploss por clube (inicial travado, atual auditável, ajuste do Suporte com
  aprovação do papel Admin, escopo Permanente/Só essa Semana com hora de virada por clube) +
  migrations versionadas em `supabase/migrations/`
- [x] Ajuste "Bug do PPPoker" e Margem de Monitoria (10% autoaplicável, uso único) no Stoploss
- [x] Campo "Projeto" (Mega Liga/Superliga/Liga/Clube) com herança em cascata, usado pra agrupar o
  Relatório de Stoploss
- [x] Relatório de Lançamentos em `/relatorios` (consulta cross-clube, filtro multi-clube tipo
  Excel via `BuscaSelectMulti`), com permissão própria (`relatorios.lancamentos`) separada da de
  Acertos — dá pra liberar só esse relatório pra um setor (ex: CS) sem abrir Lançamento/Financeiro
  de verdade
- [x] Sidebar responsiva: vira gaveta (menu hambúrguer, sobreposta com fundo escurecido) abaixo de
  768px; acima disso continua a sidebar de mesa retrátil de sempre. Telas principais (Acertos,
  Importação, Relatórios, Stoploss) com padding/tabelas ajustados pra não estourar a largura no
  celular
- [x] `clubs_historico`: snapshot automático (trigger no banco) de caução/ratio/stoploss
  inicial/taxas toda vez que o cadastro do clube muda — dá pra reconstruir "como o clube estava"
  numa data qualquer. Filtro de Período no Relatório de Stoploss usa isso pra mostrar Stoploss
  Atual/Caução/Ratio como estavam numa semana já importada, não só hoje
- [x] Índices nas colunas de chave estrangeira mais usadas (`clube_id`, `agente_id`, `regra_id`,
  `import_id`, etc) — Postgres não indexa FK automaticamente, e a maioria das consultas do app
  filtra por essas colunas
- [x] Testes automatizados (Vitest) do motor de cálculo de Acertos, Stoploss e do mapeamento
  indicador→campo — ver seção "Testes"
- [x] Submenu na Sidebar (`components/Sidebar.tsx`): Cadastros, Lançamento, Financeiro e Segurança
  ganharam um submenu expansível com atalho direto pras abas/páginas que já existiam dentro deles —
  abre sozinho na seção ativa, senão fica na mão do usuário (seta). Pra Lançamento/Financeiro/
  Segurança o link usa `?tab=X` e cada view lê isso do `window.location.search` no mount (não usa
  `useSearchParams` de propósito — a Sidebar renderiza em toda página via `app/layout.tsx`, e esse
  hook exigiria Suspense ali e tiraria o app inteiro da renderização estática)
- [x] Controle de Pagamentos (Suporte) e Cobrança (Financeiro) — `lib/pagamentos.ts`: Envios
  (lançamentos tipo Pagamento) agora se vinculam a um Acerto (`lancamentos.acerto_id`), pra
  acompanhar Valor do Acerto / Valor Pago / Diferença por clube, semana a semana, igual a planilha
  manual do Cássio — ver seção "Decisões Técnicas" acima
- [x] Coluna "Pre Payment" no Relatório de Stoploss (`lib/stoploss.ts`: `getAntecipacaoBatch`) — soma
  de toda Antecipação já conciliada por clube, mesmo nome/conceito da planilha manual do Cássio;
  respeita o filtro de Período igual às outras colunas (reconstrói como estava numa data passada)
- [x] Popup de recalcular Acertos trocado de `window.confirm` nativo pra um modal no design system da
  plataforma (`ConfirmRecalcularModal.tsx`), com texto curto: "Os itens recalculados serão
  sobrescritos. Deseja recalcular do zero?"
- [x] Bloqueio/Reembolso da Segurança (`ehTipoSeguranca()` em `ExtratoView.tsx`) só aparecem como
  opção de Tipo onde a origem 'seguranca' de fato é usada — extrato consolidado do clube e a própria
  tela de Segurança; removidos do formulário "Novo lançamento" do Suporte/Financeiro e do filtro do
  extrato do Suporte, onde vazavam sem sentido (ou, no caso do formulário, permitiam criar um
  lançamento de Segurança com origem errada)
- [x] Tela de VIP (`/vip`, `components/vip/VipView.tsx`) — controle de convites VIP por clube: Silver
  até 20/mês, Black até 10/mês, Platinum até 5/mês (`lib/vip.ts`, constantes fixas da liga). Lançamento
  simples (Data, Clube, Tipo, Observação); se o clube já bateu o limite do mês naquele tipo, confirma
  antes de deixar enviar mesmo assim. Extrato mensal com cada linha colorida conforme o total já
  usado pelo clube naquele tipo/mês: vermelho (atingiu o limite), amarelo (80%+ do limite), branco
  (tranquilo)
- [x] Cotação (câmbio) consolidada num único lugar: `clubs.cotacao`, campo na Identificação do Clube.
  Removidos os 3 mecanismos antigos que existiam espalhados e nunca chegavam a ser aplicados em
  nenhum cálculo (`lib/acertos-engine.ts` nunca lia nenhum deles) — Regra tipo "Cotação do dia",
  tela Cadastro de Moedas (`moedas_cotacao`) e o toggle "Conversão do Dia" da Liga com o popup de
  confirmação diária no cálculo de Acertos. Regras agora só tem um tipo (Faixa SE/ENTÃO)
- [x] Liberar para Acerto: Bloqueio/Reembolso da Segurança e Bônus/Promoção/Outro do Suporte sempre
  entraram na soma do Valor do Acerto — agora só ficam visíveis pro clube (`app/extrato`) depois que o
  Suporte libera explicitamente (tudo ou selecionado). `lancamentos.liberado` + `ExtratoView`'s novo
  `mostrarLiberar`; nova aba Extra no Suporte junta Bônus/Promoção/Outro já conciliados com a Genia com
  o mesmo botão
- [x] Acertos: import com clube em USD (`clubs.moeda`) mostra a Cotação atual (Identificação do Clube)
  e pergunta se segue com ela antes de calcular — se não, abre o campo pra digitar o valor novo
- [x] Nova aba Conferência do App (Suporte): checklist manual de Rake/Ganhos/Bilhetes calculados vs. o
  que o Suporte vê direto no app da plataforma, pros 3 clubes de maior rake do import — sinaliza
  bateu/não bateu na hora, não grava nada
- [x] Nova tela Dívidas e Acordos (`/dividas`, `components/dividas/DividasView.tsx`, `lib/dividas.ts`):
  clube pode ter dívida simples (valor único) ou Acordo parcelado — juros simples aplicado uma vez
  sobre o valor integral, Pagamento Mínimo funciona como piso da parcela (recalcula a quantidade de
  parcelas se precisar), parcelas semanais a partir da Data da 1ª Parcela, última parcela absorve o
  arredondamento. Regras ganhou um novo tipo "Multa de Acerto" (`regras.tipo`, faixas em
  `regra_multa_faixas`: dias/semanas de atraso → percentual) — a faixa mais alta já atingida substitui
  as demais (não acumula) e o percentual incide sobre a parcela atrasada, não o saldo total
- [x] Card de Acerto (COMMON SETTLEMENT) virou personalizável por clube (`lib/relatorio-acerto.ts`,
  `components/acertos/ClubAcertoCard.tsx`): Regras ganhou um 3º tipo "Layout do Acerto" — lista dos
  campos do card arrastável (nativo, sem lib nova) pra reordenar, com liga/desliga nos opcionais
  (Taxa MTT/Cash, WtR, Rake MTT/Cash, Taxa Operacional, Rebate, Taxa A-A Home Game, Indicação,
  Lançamentos do período, Dívidas/Acordos). 8 campos sempre aparecem (Semana, Clube, Pendências, Rake
  Total, Ganhos, Bilhetes, Segurança, SpinUp) — só a ordem deles muda. O Total do card sempre soma
  tudo por trás, visível ou não (mesma regra do Liberar para Acerto): o layout só decide o que
  aparece, nunca quanto o clube recebe. Parcela de Acordo em aberto (ou dívida Simples ativa) agora
  entra automaticamente no Acerto, com a multa por atraso já aplicada
- [x] "Valor Acerto" unificado em TUDO que soma dinheiro do clube (`lib/relatorio-acerto.ts`,
  `calcularTotalAcerto`) — antes só o card completo somava Bilhetes/Pendências/Segurança/Taxa A-A Home
  Game/Indicação/Dívidas; a lista de Acertos e o Controle de Pagamentos/Cobrança só somavam Rake e
  Lançamentos, deixando o resto de fora. Agora os três (`ClubAcertoCard`, `AcertosView`,
  `lib/pagamentos.ts`) usam a mesma fórmula, em cima do valor já correto do motor
  (`acertos.valor_acerto`, que respeita cada settlement_type) — nada fica de fora e nunca mais dá
  número diferente em tela diferente
- [x] Fix: clicar num item do submenu (Lançamento/Financeiro/Segurança na Sidebar) não trocava de
  aba quando já se estava na página — as 3 telas liam o `?tab=` só uma vez no carregamento
  (`window.location.search` num efeito de mount), mas navegar de um item do submenu pro outro não
  troca de rota (mesma página, só a query muda), então o efeito nunca rodava de novo. Trocado por
  `useSearchParams` (que reage à mudança), com Suspense em volta nas 3 páginas — bug antigo, ficou
  bem mais fácil de notar depois que Lançamento ganhou 2 abas novas (Extra/Conferência)
- [x] Scrollbar mais grossa em todo o app (`app/globals.css`, 4px → 10px) + fallback pro Firefox.
  Sidebar: abrir vários submenus ao mesmo tempo agora rola dentro do próprio menu (não empurra mais
  o rodapé/usuário-logout pra fora da tela). Área de conteúdo (`.main-content`) ganhou scroll
  horizontal — telas mais largas que a viewport (sem tabela já embrulhada em scroll próprio) agora
  rolam pro lado em vez de cortar o conteúdo
- [x] Fix: cor da Diferença no Financeiro (Cobrança) não estava de fato invertida em relação ao
  Suporte (Controle de Pagamentos) — o código de `corDiferenca` tinha os dois ramos (`suporte` e
  `financeiro`) idênticos, apesar do comentário dizer que deveria inverter. Agora `lib/pagamentos.ts`
  tem uma única `corDiferenca` (positivo = azul, negativo = vermelho) e uma nova `diferencaDaLiga`
  que espelha o número: o Suporte mostra a Diferença como o clube vê (positivo = clube vai receber),
  o Financeiro mostra o espelho — a visão da liga (positivo = liga vai receber do clube) — sinal E
  cor diferentes nas duas telas pro mesmo Acerto, como deveria ser desde o início
- [x] Fix: Acertos abria sempre no aviso "Selecione um import ao lado" — agora seleciona sozinho o
  import mais recente ao carregar a tela, mesmo padrão que Cobrança e Controle de Pagamentos já usam
- [x] Controle de Pagamentos (Suporte) ganhou 2 colunas pra bater com a planilha do Cássio: "Caução"
  (lançada no período — só referência, não entra na Diferença) e "Total" (soma dos Envios). O
  Financeiro (Cobrança) continua só com o total, sem itemizar — já era assim de propósito
- [x] Fix: arrasta-e-solta do Layout do Acerto (Regras) tava movendo a linha errada depois do
  primeiro reordenamento — rastreava o item arrastado pelo índice de onde começou o arrasto, que
  fica velho assim que a lista já mexeu uma vez. Trocado pra rastrear pelo nome do campo. Também
  ganhou setinhas ↑↓ ao lado do arrasto — o arrasto nativo do navegador não funciona em touch/celular
- [x] Fix de segurança: editar uma Regra existente e trocar o tipo (Cálculo de Acerto / Multa de
  Acerto / Layout do Acerto) na hora de salvar apagava a configuração do tipo antigo sem avisar
  nada — perigoso pra regra já vinculada a clube de verdade. Agora pede confirmação explícita antes
  de salvar, avisando quantos vínculos tem e o que vai ser apagado
- [x] Regras: tipo trava por completo assim que a regra tem 1+ vínculo — não dá mais nem pra tentar
  trocar (substitui o aviso de confirmação anterior, que dava pra clicar sem ler). Pra experimentar
  outro tipo, novo botão "Duplicar" na lista (`CadastroTable`, ícone ao lado de editar) cria uma cópia
  sem vínculo nenhum — aí sim o tipo pode mudar livre, por ser o primeiro ajuste dela
- [x] Removido "Taxa A-A HOME GAME" do card de Acerto e de tudo que soma Valor do Acerto — era um
  campo digitado à mão de antes da Indicação virar automática, e representava a mesma coisa
  (confirmado pelo Cássio). A coluna no banco (`acertos.taxa_aa_home_game`) continua existindo com o
  histórico antigo, só não é mais lida nem exibida em lugar nenhum
- [x] Fix: card de Acerto mostrava a % da Taxa MTT/Cash duas vezes — uma linha só com a %, e logo
  embaixo a linha com valor já repetindo a mesma % no rótulo. Removida a linha solta, ficou só a
  linha com valor (que já traz a % junto), igual o Cássio pediu
- [x] Regra do tipo Layout do Acerto não pede mais Nome — não fazia sentido nomear "em que ordem os
  campos aparecem". Aparece na lista de Regras sempre como "Layout do Acerto" (nome fixo, inclusive
  ao duplicar). Cálculo de Acerto e Multa de Acerto continuam pedindo Nome normalmente
- [x] Regra do tipo Cálculo de Acerto ganhou um seletor explícito "Aplica em" (Fee MTT / Fee Cash /
  Taxa Operacional / SpinUp) na hora de criar/editar — antes o campo era adivinhado a partir do
  indicador usado na condição SE/ENTÃO (`campoFromCondicoes`), reconhecia só 4 nomes de indicador
  específicos, e não avisava se não reconhecesse nada — uma regra montada com indicador "Fee Total",
  por exemplo, ficava vinculada mas não afetava cálculo nenhum, sem aviso nenhum além de um texto
  pequeno escondido no painel de Vínculos. Agora `regras.campo` é uma coluna própria, escolhida na
  tela (obrigatória pra tipo Faixa), e é isso que o motor de cálculo (`lib/acertos-engine.ts`) lê —
  não depende mais de adivinhar nada. Regras existentes foram migradas automaticamente pra manter o
  campo que já estava funcionando (mesma lógica antiga, só rodada uma vez via SQL de migração)
- [x] "Aplica em" ganhou uma 5ª opção: "Rake Total". É a taxa única dos clubes `taxa_fixa_variavel`
  e `weekly_usd` (% sobre o Rake Total inteiro, sem separar MTT/Cash) — diferente de Taxa
  Operacional, que só existe em clubes `taxa_dinamica`. Antes, esses dois tipos de clube não tinham
  como usar Regra de Faixa nenhuma: a % vinha sempre fixa do cadastro, sem opção de SE/ENTÃO.
  `lib/acertos-engine.ts` agora lê a Regra vinculada no campo Rake Total nesses dois tipos de
  cobrança, caindo pro % fixo do cadastro quando não tem vínculo
- [x] Tela de Vínculos agora avisa quando o campo escolhido não tem efeito no tipo de cobrança do
  clube (ex: vincular Rake Total num clube `taxa_dinamica`, ou Fee Cash/MTT num clube
  `taxa_fixa_variavel`/`weekly_usd`/`rakeback`) — mostra quais clubes selecionados seriam afetados,
  explica em quais tipos de cobrança aquele campo funciona de verdade, e só deixa salvar depois de
  marcar "entendi, vincular mesmo assim". Vínculos já existentes nessa situação (inclusive de antes
  dessa mudança) ganham um selo "sem efeito" na lista. `lib/types.ts` ganhou `CAMPOS_POR_SETTLEMENT`
  como fonte única dessa compatibilidade — precisa ficar em sync manual com o switch de
  `lib/acertos-engine.ts`
- [x] Novo relatório "Resumo de Taxas" (aba em Relatórios) — visão executiva cross-clube de todas as
  taxas cadastradas (Fee MTT/Cash, Taxa Operacional, SpinUp, Rake Total, Rebate, Crypto Rebate,
  Rakeback), mostrando fixo do cadastro ou faixa min–max quando tem Regra vinculada. Cada coluna só
  aparece pro tipo de cobrança que realmente a usa (mesma fonte `CAMPOS_POR_SETTLEMENT`). Ganhou
  permissão própria (`relatorios.taxas`, não herda da "relatorios" genérica de propósito — é dado
  sensível, só deve ser liberado explicitamente na tela de Permissões pra quem for executivo).
  Clube também ganhou um marcador manual "Termos especiais" (checkbox na etapa Taxas do cadastro,
  não afeta cálculo nenhum) que aparece como selo nesse relatório
- [x] Renomeados 3 rótulos no card de Acerto e no Layout do Acerto (pedido do Cássio): "Taxa Atual -
  MTT" → "Taxa MTT", "Taxa Dinâmica - Cash" → "Taxa Cash", "SpinUp Lucro" → "SpinUp Rake" — só o
  texto exibido mudou, nenhum campo/cálculo foi alterado
- [x] Nova taxa "Taxa da Liga" (pedido do Cássio): incide sobre Rake Total + SpinUp Rake (todo o rake
  do período somado) e desconta do Valor do Acerto, em cima de qualquer taxa que o clube já tenha —
  vale pra qualquer tipo de cobrança. % fixo fica no cadastro da Liga (reaproveita
  `leagues.taxa_app_pct`, que já existia no banco mas nunca tinha tela nem cálculo). Pode virar Faixa
  SE/ENTÃO via Regra vinculada à própria Liga — "Aplica em" ganhou essa 6ª opção, só selecionável pra
  vínculo com Liga (a tela de Vínculos avisa e pede confirmação se tentar vincular num Clube, mesmo
  padrão do aviso "sem efeito" dos outros campos). Nova linha no card de Acerto e no Layout do Acerto
  (togglável, não obrigatória)
- [x] Fix: Diferença no Controle de Pagamentos (Suporte) e Cobrança (Financeiro) estava calculada como
  Valor do Acerto **menos** o Total pago — como Valor do Acerto já vem negativo quando o clube deve, a
  subtração dobrava a dívida em vez de quitar (ex: devia R$2.237,30, pagou R$2.238,00 — mostrava
  diferença de -R$4.475,30 em vez dos ~R$0,70 corretos). Agora soma os dois (`lib/pagamentos.ts`,
  `agregarPagamentos`), confirmado pelo Cássio
- [x] Fix: tela de Cadastro (Mega Ligas/Superligas/Ligas/Clubes/Super Agentes/Agentes/Jogadores)
  repetia o mesmo menu que já existe no submenu "Cadastros" da Sidebar — um segundo menu idêntico
  dentro da própria tela (`app/admin/cadastro/layout.tsx`). Removido; a tela agora só cuida do
  bloqueio por permissão, sem duplicar navegação
- [x] Cobrança (Financeiro) e Controle de Pagamentos (Suporte) ganharam 2 filtros novos: "Data do
  import" (de/até — pela data que o import foi feito na Central de Importação, `imports.created_at`,
  não a semana que os dados cobrem) e "Projeto" (mesmo campo do cadastro do Clube usado no Stoploss)
  — filtra as linhas da semana já selecionada. `buscarImportsComAcerto` agora traz `created_at`, e
  `buscarPagamentosPorImport` traz o `projeto` de cada clube (`lib/pagamentos.ts`)
- [x] Tela de Nova/Editar Regra reformulada: Cálculo de Acerto, Layout do Acerto e Multa de Acerto
  deixaram de ser um seletor de tipo excludente (escolhe 1) e viraram etapas que coexistem. Cálculo e
  Layout sempre nascem juntos (não fazem sentido isolados — um define a %, o outro o que aparece no
  card de Acerto); Multa é a única etapa de verdade opcional (desmarcada por padrão). Cada etapa vira
  sua própria Regra na lista, cada uma com seu próprio vínculo depois. Por baixo continuam sendo
  regras separadas (`regras.tipo` não mudou) — só a tela de criação virou um fluxo de etapas em vez
  de um either/or. Editando uma regra existente, a etapa fica fixa pra sempre (não existe mais
  "trocar o tipo" de uma regra já criada) — por isso a trava por vínculo (`vinculoCount > 0`) não faz
  mais sentido e foi removida; "Duplicar" continua existindo pra partir de uma regra parecida sem
  mexer na original
- [x] VIP ganhou 2 abas novas além do Lançamento: "Relatório" (cross-clube, filtro Todos/clube
  específico + mês, mostra enviados/limite e quanto falta pro teto por clube+tipo) e "Configurar
  Limites" (admin — define o máximo mensal de VIP por clube e por tipo). O limite deixou de ser a
  constante global fixa `LIMITES_VIP` (Silver 20/Black 10/Platinum 5 pra liga toda) e passou a viver
  em `clubs.limite_vip_silver/black/platinum`, configurável por clube; sem valor definido conta como
  0 — o modal de confirmação de limite continua permitindo lançar mesmo assim, é só aviso. Abas novas
  usam permissões próprias (`vip.relatorio`, `vip.limites`), que não herdam de `vip` (mesmo padrão de
  `relatorios.taxas`: dado sensível, só abre pra quem for liberado explicitamente)
- [x] Dívida/Acordo ganhou "Pagar com Rake?" — antes, toda Dívida descontava automático do Acerto
  toda semana até alguém lembrar de marcar como paga na mão (risco real de descontar duas vezes se
  esquecesse). Agora só quem tiver essa opção ligada desconta/aparece no Acerto — pra Dívida Simples é
  um campo só, pra Acordo é por parcela (dá pra ajustar parcela a parcela na tela de Dívidas). E o
  próprio `processarAcertos` passa a marcar sozinho como paga a Dívida/parcela que acabou de ser
  descontada daquele período (`marcarDividasPagasComRake`), fechando o buraco do desconto duplicado.
  Dívidas já cadastradas migram como "Sim" (mantém o comportamento de hoje)
- [x] Regra de Cálculo virou "mãe": ao criar/editar um Cálculo de Acerto, o Layout e a Multa
  anexados a ele (`regras.regra_pai_id`) são editados juntos no mesmo modal — vincular só o Cálculo
  a uma Liga/Clube/Agente já traz o Layout e a Multa anexados junto, sem precisar vincular os três
  separado. Layout/Multa anexados não têm vínculo próprio (`regra_entidades`); pertencem a um
  Cálculo só — duplicar o Cálculo é o jeito de reusar o mesmo Layout/Multa em outro lugar. "Nova
  Regra" pergunta primeiro o que criar (Cálculo completo ou Multa Avulsa, essa sim solta, com
  vínculo próprio). A tela de Regras (`/admin/regras`) volta a mostrar uma lista só (sem submenu por
  tipo) — Layout/Multa anexados não aparecem como linha própria
- [x] Todas as abas dentro do conteúdo de uma tela viraram submenu da Sidebar (mesmo padrão que já
  existia em Lançamento/Financeiro/Segurança): Relatórios (Acertos/Lançamentos/Resumo de Taxas), VIP
  (Lançamento/Relatório/Configurar Limites), Stoploss (Relatório/Resumo/Extrato/Fila de Aprovação) e
  Permissões (Papéis/Usuários) ganharam submenu na Sidebar com `?tab=X`, e a barra de abas dentro da
  própria tela foi removida — inclusive de Lançamento/Financeiro/Segurança, que já tinham o submenu
  mas ainda mostravam a barra de abas redundante por cima. Cada view visível continua decidindo
  sozinha se aquela aba é permitida pra quem está logado (mesma regra de permissão de antes, só sem
  o botão de trocar de aba dentro da tela)
- [x] Novo relatório "Resumo de Acertos" (`/relatorios`, aba própria) — visão executiva de 1 linha por
  clube, cruzando todas as Ligas de uma semana só, a partir de uma planilha de referência do Cássio
  (`Settlement Summary`, que ele montava manualmente toda semana cruzando várias abas). Filtro de
  Projeto e de Semana. Colunas: Rake, Fee (com % efetivo reconstituído e Peso — fatia desse clube
  sobre o Fee total da semana), Operacional, Ganhos/Perdas, Bilhetes, Segurança, Extras (lançamentos
  do período), Multas (só a parte de multa das parcelas atrasadas — `getMultaAplicadaDoClube`,
  isolando o delta de `valorComMulta`), SpinUp PnL e Indicação — tudo já calculado nas outras telas de
  Acerto, só lado a lado. Permissão própria (`relatorios.resumo_acertos`), não herda de `relatorios`
  genérico (mesmo padrão de `relatorios.taxas`: dado sensível cross-clube/cross-liga)
- [x] Controle de Pagamentos (Suporte) reordenado pra bater com a planilha do Cássio: Club ID, Club
  Name, Total (soma dos Envios pagos até agora), Acerto (Valor do Acerto), Caução, Envio 1 em diante,
  Diferença. Sempre pelo menos 40 colunas de Envio abertas (mesmo sem nenhum envio ainda) — um clube
  pode fazer várias dezenas de envios numa semana só, a coluna já precisa estar lá esperando
- [x] Relatório de Stoploss reordenado/ampliado pra bater com a planilha do Cássio: ID, Projeto,
  Clube, Liga, Caução, Stoploss Inicial, **Bug PPPoker**, **Liberado pela Gerência**, Pre Payment,
  **Margem de Monitoria**, Stoploss Atual, Ratio. As 3 colunas em negrito já existiam como tipo de
  ajuste (`stoploss_historico.tipo`: `bug_ppp`/`ajuste_suporte`/`margem_monitoria`) mas não apareciam
  isoladas no relatório — `lib/stoploss.ts` ganha `getBugPppBatch`/`getLiberadoGerenciaBatch`/
  `getMargemMonitoriaBatch` (mesmo padrão de `getAntecipacaoBatch`, agora todos via um helper
  genérico `getSomaTipoBatch` por trás)
- [x] Pre Payment, Bug PPPoker e Margem de Monitoria passam a somar como `escopo: 'semanal'` (igual
  Liberado pela Gerência quando aprovado assim) — somem sozinhos da conta do Stoploss Atual na virada
  da semana do clube, sem precisar de nenhuma ação manual. Margem de Monitoria ganha checagem "ativa
  nessa semana" calculada ao vivo (`margemMonitoriaAtivaEstaSemana`) em vez de confiar só na flag
  `clubs.margem_monitoria_ativa` — assim ela libera pra usar de novo sozinha na virada, mesmo que
  ninguém clique em "Retirar" antes. Os formulários de "Solicitar Ajuste" e "Bug do PPPoker" (Resumo
  de Stoploss) ganham campo de Data do Lançamento — decide em que semana o valor conta; lançar com
  data de uma semana já virada soma lá, não na semana atual (`criado_em` do registro vira a data
  escolhida, não mais sempre "agora")
- [x] Resumo de Stoploss ganha 2 ações novas pra "Acerto pendente": **Corte 50%** (corta o Stoploss
  Atual do clube pela metade na hora — ajuste permanente, precisa de um Ajuste manual pra reverter,
  igual Bug PPPoker; pede confirmação antes) e **Bloquear** (toggle Bloquear/Desbloquear —
  `clubs.bloqueado`, só sinaliza o clube pro time, não trava nada tecnicamente no sistema). Corte 50%
  fica atrás da mesma permissão de aprovar ajuste (`stoploss.aprovar`); Bloquear fica aberto pra quem
  já acessa a tela
- [x] Fila de Cotação (Acertos) passa a valer pra qualquer moeda diferente de BRL, não só USD, e só
  entra na fila quem ainda não tem Cotação cadastrada no clube — quem já tem, usa direto, sem
  perguntar nada. Ao salvar a Cotação do primeiro clube da fila, pergunta se quer replicar o mesmo
  valor pros demais; se sim, confirma mais uma vez que nenhum deles tem uma cotação diferente antes de
  aplicar em lote
- [x] Clube Vinculado (Editar Clube → Identificação): liga o mesmo clube quando ele existe em mais de
  uma plataforma (ex: ClubGG + Sul HG) — grupo aberto (`clubs.vinculo_acerto_grupo_id`, mesmo padrão
  de âncora auto-referenciada), busca-e-adiciona igual Indicações. Só afeta o Resumo de Acertos: clubes
  vinculados aparecem numa linha só, com os valores somados e o detalhe de cada plataforma listado
  embaixo do nome. Acertos e Controle de Pagamentos continuam mostrando cada clube separado
- [x] Novo menu **Acertos** (topo do menu): Clube, Liga e Valor do Acerto (mesma fonte de verdade —
  `calcularTotalAcerto`), clique numa linha abre o card completo com o layout configurado do clube
  (mesmo `ClubAcertoCard` de sempre). Acesso por hierarquia — login vinculado a uma
  MegaLiga/SuperLiga/Liga/Clube (`profiles.mega_liga_id`/`super_league_id`/`liga_id`/`clube_id`) vê os
  Acertos da própria entidade + tudo abaixo dela na cascata (nunca pros lados nem pra cima —
  `lib/acesso-hierarquia.ts`); staff enxerga tudo com a permissão `acertos.ver`. Tela de Permissões
  ganha os 3 tipos de acesso novos (Liga/SuperLiga/MegaLiga) pra criar esses logins, mesmo padrão de
  Clube/Agente já existente
- [x] Novo submenu **Acertos Pendentes** (Relatórios): "Acertos Pendentes da Semana" (Acerto mais
  recente ainda não totalmente pago, mesma fonte do Controle de Pagamentos) + "Atrasados" (até 8
  semanas) e "Inadimplentes" (mais de 8 semanas) — Acerto não pago (rake + bilhetes + pendências +
  indicação + segurança − Envios), sem multa/acordo/dívida (isso é outro conceito, `lib/dividas.ts`,
  fica de fora de propósito), somado semana a semana pra cada clube ao longo do último ano, `Data` =
  semana mais antiga ainda em aberto. Mesmo layout nas duas, só muda o corte de 8 semanas. + "Histórico
  de Acertos Pendentes": todo mundo que já deveu no período, pago ou não, com Taxa de Pagamento (Total
  Pago / Dívida) por linha e no total, vide planilha anual do Cássio. Todas ordenadas do menor pro
  maior pela Diferença/Total Pendente, Status = Stoploss (Ativo/50%/Bloqueado). Só abre com a
  Conciliação zerada (reaproveita `useConciliacao`); com pendência, mostra aviso com atalho pra
  corrigir antes. Corte 50% ganha status reversível: `clubs.corte_50_ativo` liga ao aplicar e desliga
  com o novo botão "Reverter status" no Resumo de Stoploss — o valor já cortado continua permanente,
  só o status muda
- [x] Acordo (Dívidas e Acordos) ganha: **Editar** (Valor/Juros/Parcelas/Data travam depois da
  primeira parcela paga, Descrição e Pagar com Rake continuam editáveis sempre); **Juros compondo por
  parcela** conforme o período (parcela N = base × (1+juros%)^N — antes era um juros único somado no
  início, vide planilha de referência do Cássio); **Pagar com Rake sem cronograma** (quita tudo de uma
  vez no próximo Acerto processado, igual Dívida Simples, sem gerar parcela nenhuma — mostra Dívida
  Inicial / Pago em X / Em Aberto); **Interromper e Renegociar** — encerra o Acordo atual
  (`status='interrompido'`) e abre um Acordo filho (`divida_pai_id`) já com o saldo que faltava como
  Valor Integral, com termos novos. Multa continua só pra quem tiver Regra de Multa vinculada, igual
  sempre foi — sem mudança aí
- [x] Multa de Acerto: nota explicando que a última faixa cadastrada já vale pra sempre dali pra
  frente (comportamento que já existia em `percentualMulta`, só deixado explícito na tela)
- [x] **Descontar da Caução** (Controle de Pagamentos): pra quando sobra Diferença sem pagar no Acerto
  da semana (ex: devia 5.040, pagou 5.000, sobram 40) — desconta o valor direto da Caução do clube,
  sem passar pela fila do Financeiro. Lança um Envio (quita a Diferença) + um débito de Caução, e
  atualiza `clubs.caucao_atual` na hora — Stoploss Atual cai sozinho no próximo cálculo, já que é
  sempre recalculado ao vivo a partir da Caução
- [x] Corte 50% agora reverte de verdade: "Reverter status" credita de volta no Stoploss Atual o
  mesmo valor que o corte debitou (antes só desligava o status, o corte ficava permanente). Débito
  e crédito ficam os dois registrados no Extrato de Stoploss como lançamentos tipo Corte 50%
- [x] `window.confirm()` nativo trocado por modal próprio (`components/ConfirmModal.tsx`, na paleta do
  sistema) em todo lugar que ainda usava — Corte 50% (aplicar/reverter), Descontar da Caução, e o
  fluxo de replicar Cotação pro resto da fila (Acertos). O confirm nativo mostra a URL do app
  ("poker-os.vercel.app diz...") e não seguia o visual do resto da tela
- [x] **Histórico de Acertos Pendentes** virou submenu próprio em Relatórios (antes era só mais uma
  tabela dentro de Acertos Pendentes), com filtro de Clube, Projeto, Status e Período (Data de/até) —
  mesmo layout de tabela de antes. `buscarHistoricoAcertosPendentes` (novo, `lib/acertos-pendentes.ts`)
  aceita o recorte de período direto na consulta em vez do lookback fixo de 52 semanas; Atrasados e
  Inadimplentes continuam na tela combinada, sem filtro, olhando só quem deve hoje
- [x] Filtro por nome na lista de Clubes (Cadastros), ao lado do filtro de Liga que já existia
- [x] **Bônus de Indicação** volta a ser a % digitada por vínculo (`club_indicacoes.taxa_indicacao_pct`
  — coluna antiga, tinha saído de uso), sem teto de valor — em vez do bônus fixo por `clubs.elite`
  (10%/5%, teto R$1.000/R$300), que era do programa VIP misturado ali por engano (VIP não entra no
  MVP, confirmado com o Cássio). Toggle "Clube Elite" saiu do Cadastro. Card de Acerto agora mostra
  "Indicação (X%)" com o % de fato aplicado naquele Acerto (reconstruído do valor já gravado, não
  lido de novo do cadastro — não muda se o % do clube mudar depois)
- [x] **Layout do Acerto Avulso**: nova opção em "Nova Regra" (`/admin/regras`) pra criar um Layout do
  Acerto sem precisar criar um Cálculo de Acerto junto — antes só existia Cálculo+Layout juntos ou
  Multa Avulsa, então clube de Taxa Fixa (sem faixa SE/ENTÃO, não precisa de Cálculo) não tinha como
  configurar um layout próprio e caía sempre no `LAYOUT_PADRAO` (com colunas de Fee MTT/Cash que nem
  se aplicam a ele). Vincula direto ao clube pela mesma tela de Vínculos de sempre
- [x] Reorganiza campos entre as etapas Identificação/Plataforma do Cadastro de Clube (pedido do
  Cássio): **ID do Clube** e **Nome do Clube** saem de Plataforma e vão pra Identificação; **Moeda** e
  **Cotação** saem de Identificação e vão pra Plataforma. Comportamento de cada campo não muda, só a
  etapa onde aparece
- [x] **Clube Vinculado muda de lugar**: tirado do Resumo de Acertos, passa a somar no card "Acerto
  Geral" (Common Settlement) — pedido do Cássio, com print de referência da planilha antiga (clube
  "PIXGAME" somando ClubGG + Sul HG num card só). Abrindo o Acerto Geral de um clube vinculado que
  também tem Acerto na mesma semana: todas as linhas (Rake, Ganhos, Taxas, Bilhetes, Pendências,
  Segurança, Indicação, Lançamentos do período, Dívidas/Acordos) somam os dois clubes, o nome vira
  "Clube A + Clube B", e uma quebra nova "Acerto por clube vinculado" mostra o Acerto R$ de cada
  plataforma separado logo acima do Total (que é a soma dos dois — bate exatamente). % das taxas
  (Taxa MTT, Cash etc.) mostradas usam a config do clube que foi clicado, não uma média combinada.
  VIP Cashback (aparecia na planilha de referência) fica de fora — programa VIP não entra no MVP,
  confirmado com o Cássio antes. Resumo de Acertos volta a mostrar cada plataforma na sua própria
  linha, sem juntar
- [x] **Taxa da Liga inverte prioridade**: cadastro da Liga (% fixo) manda sempre que estiver
  preenchido; a Regra de Faixa vinculada só entra como fallback quando o cadastro está vazio (era o
  contrário — Regra sempre mandava quando existia). Mudou no motor de cálculo real
  (`calcularAcerto`, único lugar que gera `acertos.taxa_liga_valor` — Acertos, Acerto Geral,
  Controle de Pagamentos etc. todos leem esse valor já calculado, não recalculam) e no Resumo de
  Taxas (preview do que vale pra cada clube). Só Taxa da Liga — Fee MTT/Cash/Operacional/SpinUp
  continuam com Regra mandando quando vinculada, sem mudança aí
- [x] Cadastro de Clube trava o campo (Fee MTT/Cash/Taxa Operacional/SpinUp) que já tiver Regra de
  Cálculo vinculada naquele campo específico — mostra "Campo seguindo regra vinculada" no lugar do
  número, em vez de deixar preencher um valor que nunca seria usado (a Regra sempre manda pro campo
  dela). Cadastro de Liga ganha o mesmo aviso como placeholder no campo Taxa da Liga quando vazio e
  tem Regra vinculada — aqui não trava (cadastro manda quando preenchido, ver item acima)
- [x] Corrigido erro `[object Object]` que aparecia em telas de Acertos/Relatórios/Cadastro/
  Permissões quando uma consulta ao Supabase falhava: o `catch` usava
  `e instanceof Error ? e.message : String(e)`, que não funciona porque erros do Supabase são
  objetos simples, não `Error` de verdade — `String()` neles vira literalmente `"[object Object]"`.
  Trocado pelo helper já existente `errMsg()` (`lib/errors.ts`) em todos os 12 arquivos que tinham
  esse mesmo padrão, pra sempre mostrar a mensagem de erro real
- [x] Corrigido erro de FK ao excluir/editar Regras: `regra_condicoes`, `regra_condicao_termos`
  (indicadores compostos) e `regra_entidades` (vínculos) não tinham `on delete cascade` no banco, e
  `deleteRegra`/`updateRegra` não limpavam essas tabelas antes de apagar — excluir uma Regra já
  vinculada, ou editar uma condição com mais de 1 indicador, falhava com violação de chave
  estrangeira (o que aparecia como `[object Object]`, item acima). Corrigido em
  `lib/cadastro-api.ts` limpando as tabelas filhas na ordem certa antes do delete. Acertos já
  calculados não são afetados — guardam os valores finais prontos, não recalculam nada a partir da
  Regra
- [x] Corrigido erro real por trás do `[object Object]` na tela de Acertos: a consulta
  (`lib/meus-acertos.ts`) pedia a coluna `acertos.taxa_tipo`, que nunca existiu nessa tabela
  (`taxa_tipo` é campo do Cadastro de Clube, não do Acerto calculado — nunca foi copiado pra lá, e
  o card não usava esse valor em lugar nenhum). Removida a coluna da consulta e do tipo `AcertoCard`
  — a tela volta a listar os Acertos calculados normalmente
- [x] Corrigido "Carregando…" preso pra sempre na tela de Acertos: o efeito que busca os Acertos
  dependia do objeto inteiro `profile` (`usePermissions()`), que ganha uma referência nova a cada
  recarga — inclusive a recarga silenciosa que já acontece sempre que a aba volta a ficar em foco
  (ver comentário em `lib/permissions.tsx`). Cada recarga reiniciava a busca do zero, então o
  "Carregando…" nunca tinha chance de terminar. Trocado pra depender só dos campos que realmente
  importam (`clube_id`/`liga_id`/`super_league_id`/`mega_liga_id`), com uma guarda de cancelamento
  pra não deixar uma resposta antiga sobrescrever uma mais nova
- [x] **Bônus de Indicação corrigido**: passa a incidir sobre o rake do **clube indicado**, não mais
  sobre o próprio rake de quem indicou (confirmado com o Cássio — inverte o que tinha sido
  confirmado antes). Com mais de uma indicação, cada uma usa o rake do seu próprio indicado e os
  valores em R$ somam. Card de Acerto: como o valor não é mais uma fração simples do próprio rake do
  clube, o "Indicação (X%)" mostrado busca direto os vínculos cadastrados hoje em vez de reconstruir
  a partir do valor gravado — mesma simplificação já usada nos outros % do card (mostra a config
  atual, só o R$ é o histórico)
- [x] Recalcular Acertos (Relatórios → aba Acertos) mantém o card aberto no mesmo clube: como
  `processarAcertos` apaga e reinsere as linhas do import, o `id` de cada Acerto muda a cada
  recálculo — o card que já estava aberto ficava com os números antigos (referência à linha velha),
  e a lista reordena por `valor_acerto`, então também não dava pra achar de novo o clube que se
  estava conferindo. Agora guarda qual clube estava aberto antes de recalcular e reabre o mesmo já
  com os dados novos
- [x] Cadastro de Clube (clubes `taxa_fixa_variavel`/`weekly_usd`, sem separar MTT/Cash): campo da
  taxa própria do clube estava rotulado **"Taxa da Liga (%)"**, colidindo com o nome da Taxa da
  Liga de verdade (camada separada, configurada no cadastro da Liga vinculada, soma em cima dessa
  aqui — ver item "Taxa da Liga inverte prioridade"). Isso levava a configurar o campo errado
  achando que tinha preenchido a Taxa da Liga, e ela ficava 0% no Acerto. Renomeado pra "Taxa sobre
  Rake Total (%)", com nota explicando a diferença — sem mudança de cálculo, só de rótulo
- [x] **Bug real de Taxa da Liga zerada mesmo com Regra vinculada**: `leagues.taxa_app_pct` tinha
  `default 0` no banco desde antes de existir tela/cálculo pra esse campo (coluna reaproveitada). A
  prioridade da Taxa da Liga (cadastro manda sempre que `!= null`, Regra só é fallback quando
  `null`, ver item "Taxa da Liga inverte prioridade") tratava esse 0 "de fábrica" como "cadastro
  preenchido com 0%", ignorando qualquer Regra vinculada de verdade. Migration
  `20260825010000_taxa_liga_default_null.sql` tira o default da coluna — novas Ligas nascem sem
  taxa nenhuma definida (o front já mandava `null` explícito no create, isso só tira a armadilha
  pra insert que não passe o campo). Ligas já existentes com `taxa_app_pct = 0` **e** Regra vinculada
  em Taxa da Liga precisam de um UPDATE pontual pra virar `null` — não incluído aqui de propósito
  (mudança de dado, não de schema), passado à parte
- [x] Controle de Stoploss: mensagem verde "Stoploss cortado pela metade" ficava presa na tela pra
  sempre depois de aplicar um Corte 50% — nunca era resetada ao reverter o corte nem ao trocar de
  clube selecionado, então continuava aparecendo mesmo depois de revertido (ou olhando outro
  clube que nunca teve corte nenhum). Resetada em `handleReverterCorte50` e na troca de clube. Card
  "Stoploss Atual" agora mostra "—" quando o clube está Bloqueado
- [x] **"Taxa da Liga" no card do Acerto ganha fallback pra Regra do clube**: clubes
  `taxa_fixa_variavel`/`weekly_usd` (sem separar MTT/Cash) não tinham NENHUMA taxa própria visível
  no card — Taxa MTT/Cash só existem de verdade em `taxa_dinamica`. O valor (`fee_calculado`, via
  Regra de Faixa vinculada ao clube no campo Rake, ou % fixo do cadastro) já era descontado do
  Total, só não aparecia em lugar nenhum, o que gerou confusão com a Taxa da Liga de verdade (Liga
  cadastro/Regra, camada separada). Pedido confirmado: "Taxa da Liga" no card passa a mostrar o que
  estiver configurado na própria Liga quando tiver algo (`taxa_liga_valor != 0`), senão cai pro que
  a Regra vinculada ao clube calculou (`fee_calculado`) — mesma linha, não duas separadas. Não entra
  nesse fallback em `taxa_dinamica` (já vem itemizado em Taxa MTT/Cash/Operacional/SpinUp)
- [x] **WtR 4 Semanas corrigido pra razão das somas**: era a média de cada razão semanal
  (Ganhos/Rake de cada semana, depois tira a média das 4) — confirmado com o Cássio (planilha real
  comparando os dois métodos) que o certo é somar o Ganhos e somar o Rake das até-4 semanas
  primeiro, e dividir os totais uma vez só no final — os dois métodos dão resultados bem diferentes
  quando o Rake varia muito semana a semana. Corrigido em `calcularWtr4Semanas`
  (`lib/acertos-engine.ts`, usado pra decidir a faixa de taxa de verdade) e na conta equivalente do
  card de Acerto (`ClubAcertoCard.tsx`, só exibição) — os dois tinham que ficar iguais, senão o
  número mostrado no card não bateria com o que decidiu a taxa aplicada. 3 novos testes cobrindo a
  fórmula (inclusive o exemplo exato da planilha)
- [x] **Bônus/Promoção/Outro não passam mais por Conciliação**: `useConciliacao` só excluía Caução
  da consulta — Bônus/Promoção/Outro (que já tinham o próprio fluxo, "Liberar para Acerto", ver
  `TIPOS_LIBERAVEIS` em `lib/lancamentos.ts`) entravam junto na tela de Conciliação, tentando casar
  com o lado da Genia igual Caução/Pagamento/Antecipação (que sim usam Conciliação de propósito).
  Bloqueio/Reembolso da Segurança já ficavam de fora sozinhos (usam `origem: 'seguranca'`, fora do
  par Suporte/Genia que a Conciliação casa). Extrato do clube já escondia esses tipos até serem
  liberados — não precisou mudar nada ali
- [x] Reordenadas as colunas do Controle de Pagamentos: Club ID, Club Name, Diferença, Valor do
  Acerto, Valor Pago, botão Descontar da Caução, Caução, Envio 1..40 (pedido explícito de ordem)
- [x] **Controle de Pagamentos/Cobrança: seletor por semana, não mais por import de uma Liga só**:
  cada Liga gera 1 import por semana, então a mesma semana aparecia repetida no seletor (uma vez
  por Liga) — e olhar 1 import só mostrava as taxas de 1 Liga por vez, não a semana inteira. Novo
  `buscarPeriodosComAcerto`/`buscarPagamentosPorPeriodo` (`lib/pagamentos.ts`) agrupam por
  `period_end`: cada semana aparece 1 vez no seletor e traz os Acertos de todas as Ligas daquela
  semana juntos. `buscarImportsComAcerto`/`buscarPagamentosPorImport` continuam existindo do jeito
  que eram — `lib/acertos-pendentes.ts` ainda depende deles por import individual. Filtro "Data do
  Import" (De/Até) trocado por filtro de nome do clube nas duas telas
- [x] **Aba Extra voltou a mostrar Bônus/Promoção/Outro**: a exigência `apenasConciliados` em
  `ExtratoView`/`LancamentoView` só mostrava esses lançamentos na aba Extra depois de conciliados
  com a Genia — mas o ajuste anterior (Bônus/Promoção/Outro fora da Conciliação, ver item acima)
  tornou essa condição impossível de cumprir, escondendo tudo pra sempre. Removida a exigência —
  a aba Extra volta a listar Bônus/Promoção/Outro normalmente, liberação pro Acerto continua igual
- [x] **Crypto Rebate ganha ON/OFF, Total Crypto Rebate em Acertos e botão "Pagar com Crypto"**:
  Crypto Rebate (%) do clube (Cadastro → Clube → Taxas, só weekly_usd) agora tem toggle igual o
  Rebate normal — desligar zera o %. Resumo de Acertos ganha uma linha "Total Crypto Rebate"
  embaixo do Valor Acerto: valor ÷ (1 + % Crypto Rebate), mesma fórmula da planilha do Cássio
  (`corrigirValorCrypto`, `lib/relatorio-acerto.ts`) — só aparece quando algum clube do import tem
  Crypto Rebate ligado. No Lançamento (Suporte/Genia), Tipo "Pagamento" ganha um botão amarelo
  "Pagar com Crypto" ao lado do seletor de Tipo (só quando o clube tem % cadastrado): preenche o
  Valor já com o desconto aplicado, e o lançamento fica marcado (`lancamentos.pago_crypto`) — no
  Controle de Pagamentos, o Envio correspondente ganha um ₿ do lado do valor. Requer migration
  manual (`crypto_rebate_ativo` em `clubs`, `pago_crypto` em `lancamentos`)
- [x] **Descontar da Caução exige saldo e pergunta Total ou Parcial**: botão só fica habilitado
  quando o clube ainda tem Caução Atual disponível (antes descontava sempre, mesmo sem saldo).
  Clicar abre um popup perguntando Total (a Diferença inteira) ou Parcial (digita o valor, até o
  limite da Diferença) antes de confirmar. `ConfirmModal` ganha a prop `confirmDisabled` pra isso.
  Descrição dos lançamentos gerados não fala mais em "rollover" (some do Extrato)
- [x] **Botão Rollover em Acertos Pendentes**: clube que não pagou o Acerto da semana pode "rolar"
  a Diferença pra próxima semana em vez de descontar da Caução ou virar Dívida/Acordo — sem cobrar
  juros, sem multa, sem mexer na Caução. Some das Pendências (lançamento tipo "pagamento" quita a
  Diferença dessa semana, igual um Envio) e reaparece sozinho como Pendência/Antecipação no
  PRÓXIMO Acerto calculado desse clube (lançamento tipo "antecipacao" sem `acerto_id`, consumido só
  uma vez por `processarAcertos` — `buscarRolloverPendente`, `lib/acertos-engine.ts`). Requer
  migration manual (`lancamentos.rollover_consumido_import_id`)
- [x] **Taxa Operacional passa a valer pra Taxa Fixa/Variável**: o cadastro sempre deixou ligar
  Taxa Operacional pra qualquer tipo de clube, mas o motor só aplicava de verdade em Taxa Dinâmica
  — em Taxa Fixa/Variável ficava sempre zerada, mesmo configurada e ligada (bug reportado pelo
  Cássio, clube AK AMAKHA club 2). Agora soma como fee ADICIONAL sobre o Rake Total, em cima da
  taxa fixa/variável já existente (confirmado pelo Cássio)
- [x] **Ajustes de UI em Vínculos/Layout do Acerto/Cadastro de Clube**: tirado o aviso vermelho de
  "Regra sem 'Aplica em' definido" ao criar um Vínculo (`VinculosPanel.tsx`) — informava algo que
  não precisava travar o fluxo. Indicação, Lançamentos do período e Dívidas/Acordos agora são
  campos **obrigatórios** no Layout do Acerto (sempre visíveis, junto com Pendências/Segurança/etc,
  não dá mais pra esconder). Tirado o texto explicativo embaixo de Taxa Operacional no cadastro de
  clubes Taxa Fixa/Variável (`ClubModal.tsx`) — deixou de fazer sentido depois que Taxa Operacional
  passou a valer de verdade pra esse tipo (item acima)
- [x] **Clube Vinculado e Indicações lado a lado no cadastro do Clube**: a seção "Indicações"
  (Clube que esse clube indicou + %) saiu da aba "Garantias & Limites" e foi pra aba
  "Identificação", ao lado de "Clube Vinculado" (grid de 2 colunas) — as duas telas de vínculo
  ficam juntas, ao invés de espalhadas em abas diferentes
- [x] **Fee/%Fee do Resumo de Acertos passa a refletir a regra sendo aplicada**: antes usava
  `fee_calculado` puro, que em Taxa Dinâmica já vinha misturado com Operacional/SpinUp — dobrando
  a conta, já que essas duas têm coluna própria na tela. Agora: Taxa Dinâmica soma só Fee MTT + Fee
  Cash (o que é cobrado separado por rake); qualquer outro tipo (Taxa Fixa/Variável, Weekly USD,
  Rakeback) usa o valor da Taxa da Liga — com o mesmo fallback do card de Acerto pro fee_calculado
  do clube quando a Liga não tem nada configurado (`calcularFeeRegra`,
  `lib/relatorio-resumo-acertos.ts`, com testes)
- [x] **Cobrança: coluna Valor do Acerto também invertida pra visão da liga**: só a Diferença
  já vinha invertida (visão do Financeiro/liga) — Valor do Acerto continuava mostrando o número
  cru do clube, incoerente com a Diferença ao lado. Agora as duas seguem a mesma convenção:
  positivo = a liga vai receber, negativo = a liga precisa pagar (`diferencaDaLiga`,
  `CobrancaView.tsx`)
- [x] **Importação avisa e substitui em vez de duplicar**: subir um arquivo pra uma Liga/semana
  que já tem importação (mesmo `league_id` + `period_start`/`period_end`) agora mostra um aviso
  perguntando se quer substituir, em vez de criar uma segunda importação igual — que fazia cada
  clube contar 2x no Controle de Pagamentos/Cobrança/Resumo de Acertos. Confirmando, a importação
  antiga é limpa (Acertos/linhas cruas) e reaproveitada com o arquivo novo (mesmo id, sem
  duplicar); se já tiver Pagamento vinculado a algum Acerto antigo, aborta com aviso em vez de
  duplicar por cima (`ImportacaoXlsx.tsx`). Duplicidades que já existiam no banco: consulta de
  diagnóstico (só leitura) entregue à parte, pra revisar antes de decidir o que apagar
- [x] **Corrige race condition que duplicava Acertos ao Calcular**: o botão "Calcular Acertos" só
  travava (`disabled`) depois de uma consulta assíncrona de cotação — nesse intervalo, um clique
  duplo rápido (ou tela lenta) passava os dois cliques pela checagem `acertos.length > 0` (ainda 0
  nos dois) e disparava `processarAcertos` duas vezes, duplicando TODA linha do import (achado
  investigando as duplicidades relatadas na Cobrança — o import em si não tinha nada de errado,
  cada clube tinha só 1 linha em `import_rows`, a duplicação era só em `acertos`). Agora o botão
  trava assim que clicado, antes da consulta de cotação (`AcertosView.tsx`)
- [x] **Reorganização dos menus da Sidebar**: "VIP" virou "VIP Cards" e saiu de item
  independente pra entrar dentro de Suporte (Lançar/Configurar Limites), junto com "Acertos
  Pendentes" (subiu de Relatórios pra Suporte). Todos os Extratos (Suporte, Segurança, Stoploss)
  saíram de seus menus originais e foram pra dentro de Relatórios, junto com o Relatório de VIP
  Cards — mesma rota/tela de sempre, só o link mudou de lugar. Dentro de Relatórios, o item
  "Acertos" (que só reabria a mesma tela do Recalcular, já acessível pelo item "Acertos" fora de
  Relatórios) foi removido por ser redundante — "Resumo de Acertos" (a visão semanal) continua no
  lugar dele. Controle de Stoploss: aba "Resumo" renomeada pra "Alteração" (`Sidebar.tsx`,
  `RelatoriosView.tsx`)
- [x] **Descontar da Caução: coluna Caução ficava sempre "—" e não travava no saldo do clube**: o
  lançamento de débito de Caução gerado por "Descontar da Caução" era datado de hoje, não da semana
  do Acerto sendo quitado — como a coluna "Caução" do Controle de Pagamentos/Cobrança filtra por
  período, o desconto nunca aparecia ali pra semanas passadas. Agora é datado do fim do período do
  Acerto. Também não existia trava: dava pra tentar descontar mais do que o clube tinha de Caução
  Atual disponível (ex: clube com 400 de Caução, Diferença de 500 — deixava tentar descontar os 500
  inteiros). Agora o teto (nos botões Total/Parcial) é sempre o menor entre a Diferença e a Caução
  Atual disponível, com o valor disponível mostrado no popup de confirmação
  (`descontarDaCaucao`/`lib/pagamentos.ts`, `ControlePagamentosView.tsx`)
- [x] **Sidebar ganha um 3º nível de menu (sub-subitens)**: "VIP" dentro de Suporte deixa de ser 2
  itens soltos (Lançar/Configurar Limites) e vira uma pasta "VIP Cards" que abre/fecha, com as duas
  abas dentro dela — `SubNavItem` agora aceita `subItems` aninhado, e `renderNavItems` renderiza
  esse nível extra recursivamente (`Sidebar.tsx`)
- [x] **Corrige regressão: tela do Recalcular tinha sumido**: descoberto que `/acertos`
  (`app/acertos/page.tsx`) sempre renderizou `MeusAcertosView` pra TODO mundo — nunca teve o
  branch por tipo de login que a gente pensava que já existia. A tela de Recalcular
  (`AcertosView`) só era alcançável pela aba "Acertos" dentro de Relatórios, que a reorganização de
  menus removeu por parecer redundante (achava que as duas rotas já mostravam o mesmo componente).
  Corrigido: `/acertos` agora mostra `AcertosView` (Recalcular) pra Suporte/Admin e continua
  mostrando `MeusAcertosView` pra login de Clube/Liga/SuperLiga/MegaLiga (`app/acertos/page.tsx`)
- [x] **Mais ajustes de menu (pedido do Cássio)**: Relatório de Stoploss sai do submenu do próprio
  Stoploss e vai pra dentro de Relatórios, com o nome "Stoploss". "Relatório de VIP Cards" vira só
  "VIP Cards". Dentro de Relatórios, os Extratos de Suporte/Segurança/Stoploss viram uma pasta só
  "Extratos" (sub-subitens "Suporte"/"Segurança"/"Stoploss"), com um 4º item novo: **Extrato do
  Financeiro** — não existia ainda (`ExtratoView` nunca aceitava origem `'genia'`, de propósito, por
  ser vista como só o espelho interno da Conciliação); agora `FinanceiroView` ganhou uma aba
  "Extrato" própria mostrando os lançamentos `'genia'` (`ExtratoView.tsx`, `FinanceiroView.tsx`,
  `Sidebar.tsx`)
- [x] **Avisa quando a importação cadastra um clube novo sozinha**: clube que aparece na planilha
  mas ainda não tá em Cadastro > Clubes já era pré-cadastrado automaticamente pelo motor
  (`processarAcertos`, nome + ID externo + liga, sem taxa/regra nenhuma) — mas sem NENHUM aviso: o
  `settlement_type` cai no default `'taxa_dinamica'` da tabela, e com taxa em branco vira 0% em
  tudo, então o Acerto sai com status "calculado" ✓ e valor zerado, sem cair no aviso de "sem_regra"
  que só cobre linha malformada sem ID externo — bem fácil de passar batido. Agora
  `processarAcertos` devolve quais clubes foram criados nesse cálculo, e a tela de Acertos mostra um
  aviso destacado com o nome de cada um e link direto pra Cadastro > Clubes (`acertos-engine.ts`,
  `AcertosView.tsx`)
- [x] **Recalcular duplicava Acerto em vez de atualizar**: `processarAcertos` fazia "apaga tudo
  desse import e insere de novo" — mas sem checar se o delete deu erro. Se qualquer Acerto do
  import já tinha Pagamento/Envio vinculado (`lancamentos.acerto_id` é FK), o delete em massa
  quebrava silenciosamente e o código seguia pro insert do mesmo jeito, empilhando um Acerto novo
  em cima do antigo a cada clique em Recalcular (achado investigando o PIXGAME duplicado 3x,
  reportado pelo Cássio — "toda vez que recalcula, ele tá acrescentando, é update"). Agora
  Recalcular atualiza a linha existente de cada clube (mesmo `id`, preserva o vínculo de
  Pagamento) e só insere linha nova pra clube que ainda não tinha Acerto nesse import
  (`acertos-engine.ts`)
- [x] **Recalcular perdia o import selecionado**: `loadImports` sempre reselecionava o import mais
  recente da lista — certo na primeira carga da tela (senão abria vazia), mas essa mesma função
  também roda de novo depois de Recalcular (pra atualizar o status na lista), e ali trocava a
  seleção pro import mais novo em vez de manter o que o usuário estava vendo, exigindo dar refresh
  pra voltar pro import certo. Agora só auto-seleciona quando ainda não tem nada selecionado
  (`AcertosView.tsx`)
- [x] **Busca de import por nome de clube**: o campo "Buscar por arquivo ou liga..." (tela de
  Acertos) passa a também buscar por nome de clube — e não só nos 30 imports mais recentes já
  carregados, busca em TODO o histórico (`import_rows.club_name`) e traz todos os arquivos que já
  tiveram aquele clube, mesmo que não estejam entre os mais recentes. Busca com debounce de 300ms,
  a partir de 2 letras (`AcertosView.tsx`)
- [x] **Clube vinculado sem Acerto na semana sumia do card "Acerto Geral"**: o card só mostrava a
  quebra "Acerto por clube vinculado" quando os DOIS clubes do vínculo tinham Acerto na mesma
  semana — se um deles não jogou (sem import essa semana), ele desaparecia inteiro da tela em vez
  de aparecer com R$0 (achado no caso PIXGAME/Liga Particular + PIXGAME/Orion). Agora a quebra
  aparece sempre que o clube TEM vínculo cadastrado, e cada membro sem Acerto entra com total R$0
  (`ClubAcertoCard.tsx`)
- [x] **Clube Vinculado no cadastro não salvava de verdade**: selecionar o clube na busca de "Clube
  Vinculado" (Cadastro > Clubes) só deixava ele pronto num chip com um botão "+" separado pra
  confirmar — clicar no resultado da busca parecia já ter vinculado, mas sem esse segundo clique
  (fácil de não perceber, é uma ação independente do "Salvar Clube" principal) o vínculo nunca era
  salvo (reportado pelo Cássio, caso PIXGAME Liga Particular + PIXGAME Orion). Agora salva direto
  ao clicar no resultado da busca, sem passo intermediário (`ClubModal.tsx`)
- [x] **Crypto Rebate só aparecia no cadastro pra clube Weekly USD**: o toggle "Crypto Rebate"
  (Cadastro > Clubes > Taxas) só era exibido pra clubes com `settlement_type = weekly_usd`,
  diferente do toggle "Rebate" logo acima (esse já sem nenhuma restrição por tipo). Como a tela de
  Acertos já aplica o Crypto Rebate de forma genérica pra qualquer clube com `crypto_rebate_pct`
  cadastrado (card "Total Crypto Rebate", `AcertosView.tsx` + `corrigirValorCrypto` em
  `relatorio-acerto.ts`), a restrição no cadastro só impedia configurar pros demais tipos de clube.
  Agora o toggle aparece pra qualquer clube (`ClubModal.tsx`). Achado um segundo problema na mesma
  investigação: a função `clean()` que roda ao salvar o clube (`app/admin/cadastro/clubes/page.tsx`)
  apagava o `crypto_rebate_pct` de propósito pra clube Taxa Dinâmica e Rakeback — mesmo com o campo
  liberado na tela, salvar zerava o valor de novo. Agora só limpa quando o toggle "Crypto Rebate"
  está desligado, igual já funciona pro Rebate normal, independente do tipo de cobrança
- [x] **Lançamento de Antecipação travava exigindo escolher um Acerto**: a tela de Lançamento
  (Suporte/Financeiro) obrigava escolher "Qual Acerto está sendo pago?" pra Tipo Antecipação, igual
  Pagamento — mas Antecipação não paga Acerto nenhum, ela só aumenta o Stoploss vigente do clube
  quando concilia com a Genia (`registrarAntecipacaoNoStoploss`, `useConciliacao.ts`),
  independente de ter Acerto pendente ou não (reportado pelo Cássio). Agora só Pagamento exige
  escolher o Acerto — pra Antecipação o campo continua disponível (útil se quiser rastrear no
  Controle de Pagamentos mesmo assim), mas é opcional. Corrigido nos dois formulários
  (`LancarForm.tsx` e `EditarLancamentoModal.tsx`), incluindo um bug lateral onde não vincular
  nenhum Acerto salvava uma string vazia em vez de `null` no banco
- [x] **`taxa_tipo` (Fixa/Variável) virou automático**: esse campo (usado só como etiqueta
  informativa pra clube Taxa Fixa/Variável, nunca teve controle na tela pra escolher manualmente e
  não afeta o cálculo — o motor já usa a Regra vinculada quando existe, senão o número fixo,
  independente do valor desse campo) ficava sempre travado em "fixa" desde a criação do clube. Agora
  é derivado sozinho ao salvar o cadastro: clube com Regra vinculada no campo Rake vira "variavel",
  sem Regra vinculada vira "fixa" — sem precisar de nenhum toggle manual (`ClubModal.tsx`). Migration
  `20260826000000_backfill_taxa_tipo_por_regra_vinculada.sql` corrige de uma vez os clubes que já
  existem hoje, sem precisar reabrir e salvar cada um na mão
- [x] **Crypto Rebate no Weekly USD passa a corrigir por divisão, não mais subtrair do rake**:
  discutido com o Cássio — no cálculo do Acerto de clube Weekly USD, o Crypto Rebate era somado ao
  Rebate normal e subtraído linear da fee (`rake_total × %`), igual um desconto qualquer. Agora o
  Rebate normal (Weekly USD) e o Rakeback continuam subtraídos assim, sem mudança — Crypto Rebate
  sai do motor de cálculo por completo, o Valor do Acerto guardado não muda mais por causa dele.
  Em vez disso, o card "Acerto Geral" (`ClubAcertoCard.tsx`) passa a mostrar duas linhas novas
  embaixo do Total, pra qualquer tipo de clube (não só Weekly USD) que tenha % de Crypto Rebate
  cadastrado: "Acerto com Crypto" (o Total corrigido pela mesma fórmula do "Total Crypto
  Rebate"/"Pagar com Crypto" — `corrigirValorCrypto`: valor ÷ (1 + %)) e "Desconto" (a diferença
  entre os dois). O Total normal continua exatamente igual, alimentando Controle de Pagamentos e
  Resumo de Acertos sem nenhuma mudança
- [x] **Migration: Weekly USD vira Taxa Fixa/Variável**: decisão do Cássio — os 18 clubes Weekly
  USD passam pra Taxa Fixa/Variável, ciente do impacto (Resultado do Jogador passa a entrar na
  conta do Acerto, Taxa Operacional passa a valer se estiver ligada). Migration
  `20260826010000_converte_weekly_usd_para_taxa_fixa_variavel.sql`. Só corrige o cadastro pra
  frente — Acertos de semanas já calculadas continuam com a fórmula antiga até "Recalcular"
- [x] **Taxa Dinâmica passa a considerar Regra vinculada em Rake Total**: achado no caso Mts Poker —
  clube Taxa Dinâmica com uma única Regra pro rake todo (vinculada no campo "Rake"/`rake_total`, em
  vez de duplicar a mesma regra em Fee MTT E Fee Cash) não tinha efeito nenhum, porque o motor só
  lia Regra vinculada especificamente em Fee MTT/Fee Cash — mesmo com a Regra visível no cadastro,
  nenhuma taxa era cobrada. Agora a Regra de Rake Total serve de fallback pros dois campos (aplicada
  sobre a base de cada um — Rake MTT e Rake Cash), só perdendo pra regra própria de cada campo
  quando ela existir. O aviso vermelho na etapa Regras também para de disparar nesse caso
  (`lib/acertos-engine.ts`, `RegrasAplicadas.tsx`). Faltava travar visualmente os campos Fee
  MTT/Fee Cash na etapa Taxas do cadastro nesse mesmo caso — ficavam abertos pra digitar mesmo já
  seguindo a Regra de Rake Total por baixo, o que confundia (campo parecia sem taxa nenhuma
  configurada). Agora aparecem travados também, mostrando "Campo seguindo regra vinculada"
  (`ClubModal.tsx`)
- [x] **Rótulo "sem efeito" na tela de Vínculos ficou desatualizado**: última peça do mesmo caso Mts
  Poker — a lista que decide se um vínculo de Regra "tem efeito" pro settlement_type do clube
  (`CAMPOS_POR_SETTLEMENT`, usada na etapa "Regras" do cadastro e na tela `/admin/regras`) não sabia
  que Rake Total agora também vale pra Taxa Dinâmica (fallback pra Fee MTT/Fee Cash). Continuava
  marcando o vínculo Liga→Clube em Rake como "sem efeito" mesmo já funcionando no cálculo. Corrigido
  adicionando `rake_total` à lista de Taxa Dinâmica (`lib/types.ts`)
- [x] **Taxa da Liga contava a Taxa Operacional duas vezes** (caso AK AMAKHA club 2): quando a Liga
  não tem % nem Regra configurada, o card "Acerto Geral" e o Resumo de Acertos caem pro
  `fee_calculado` do próprio clube como "Taxa da Liga" (clube Taxa Fixa/Variável ou Weekly USD, sem
  Fee MTT/Cash pra itemizar). Só que `fee_calculado` já inclui a Taxa Operacional — que também
  aparece como linha própria no card — dobrando ela na exibição (o clube via 19% de "Taxa da Liga"
  quando só 10% era taxa de rake de verdade, os outros 9% já apareciam de novo embaixo em "Taxa
  Operacional"). Corrigido subtraindo a Taxa Operacional do fallback nos dois lugares
  (`ClubAcertoCard.tsx`, `lib/relatorio-resumo-acertos.ts`) — o Total/Valor do Acerto em si nunca
  esteve errado, só a quebra visual das linhas
- [x] **SpinUp Rake vira crédito do clube, não fee cobrada dele**: decisão do Cássio — diferente de
  Taxa MTT/Fee Cash/Taxa Operacional (que a liga cobra do clube, Taxa Dinâmica), o % de SpinUp é
  ganho do clube, e deve somar no Valor do Acerto em vez de descontar. `fee_spinup_valor` sai do
  `fee_calculado` (que continua só MTT+Cash+Operacional) e passa a somar direto no Valor do Acerto.
  O card "Acerto Geral" também troca o sinal da linha "SpinUp Rake" pra positivo
  (`lib/acertos-engine.ts`, `ClubAcertoCard.tsx`). **Importante**: só vale pra Acerto recalculado
  daqui pra frente — Acertos de semanas já calculadas continuam com o SpinUp descontado até
  "Recalcular"
- [x] **Card "Acerto Geral": Indicação separada por clube + Total em USD**: pedido do Cássio,
  comparando com a planilha de referência dele — duas mudanças no card: (1) a linha "Indicação"
  somava todos os clubes indicados numa linha só (% e valor combinados); agora mostra uma linha por
  clube indicado ("Indicação (3%) CHIP COIN", "Indicação (3%) LEGENDS"), cada valor calculado sobre
  o rake do respectivo indicado nesse período — mesmo formato da planilha ("Referência 3% CHIP
  COIN" / "Referência 3% LEGENDS"). (2) Nova linha "Total USD" logo abaixo do Total, convertendo
  pela Cotação cadastrada do clube (Moeda ÷ Cotação) — só aparece quando o clube tem Moeda diferente
  de BRL e Cotação preenchida (`ClubAcertoCard.tsx`)
- [x] **Cadastro de Clube: "Converter para" — conversão de moeda genérica, não só USD**: generaliza o
  item anterior pra qualquer par de moedas (não só USD), do jeito que o Cássio pediu ("cotação pra
  USD, PEN, ou quaisquer outras moedas"). Novo campo `clubs.moeda_conversao` (opcional, vazio por
  padrão = sem conversão) na etapa "Plataforma" do cadastro: um seletor "Converter para (opcional)"
  que, ao escolher uma moeda, revela o campo Cotação já existente com um rótulo explicando a conta
  ("1 USD vale quantos PEN?"). Reaproveita o `clubs.cotacao` que já existia — nenhum campo/tabela
  novo além do seletor. O card "Acerto Geral" troca a linha fixa "Total USD" por `Total {moeda
  escolhida}`, calculada como Total ÷ Cotação (`ClubModal.tsx`, `ClubAcertoCard.tsx`,
  `20260826020000_moeda_conversao_no_clube.sql`)
- [x] **Corrige Antecipação e Pagamento contando 2x no Valor do Acerto**: achado investigando o
  CHIP COIN — em 5 lugares que somam "Lançamentos do período" (bônus/promoção/outro) em cima do
  Acerto (card "Acerto Geral", lista de Acertos, Controle de Pagamentos/Cobrança, Resumo de Acertos
  e "Meus Acertos"), faltava excluir os tipos Antecipação e Pagamento — cada um já entra certo por
  outro caminho (Antecipação via `pendencias_antecipacao`, Pagamento via o `acerto_id` vinculado que
  já quita a Diferença daquele Acerto específico), então contar de novo aqui inflava o total sempre
  que a data caía dentro da semana (ex: Antecipação lançada durante a semana, ou Pagamento que
  fechou a semana anterior datado bem na virada). Confirmado pelo Cássio: uma vez que o Pagamento
  quita a Diferença, "é nóis" — não deve mexer em mais nada; sobra vira Diferença e rola pra próxima
  semana sozinho (`AcertosView.tsx`, `ClubAcertoCard.tsx`, `pagamentos.ts`, `relatorio-resumo-acertos.ts`,
  `meus-acertos.ts`)
- [x] **Conferência do App sem o título "Lançamento" em cima**: pedido do Cássio ("não faz sentido
  lá em cima") — essa aba mora dentro do menu Lançamento por conveniência, mas não é um lançamento
  (é só um checklist visual de Rake/Ganhos calculado vs visto na plataforma), então o título e
  subtítulo fixos da página ("Lançamento" / "Bônus, promoções, caução e pagamentos por clube") agora
  somem só nessa aba (`LancamentoView.tsx`)
- [x] **Conferência do App: botão "Liberar Acerto"**: pedido do Cássio — só libera (fica clicável)
  quando Rake E Ganhos dos 3 clubes conferidos baterem com o que o Suporte viu direto na plataforma.
  Ao clicar, só registra um carimbo (`imports.conferido_em`) com a data/hora — de propósito, não
  trava nem libera nada em nenhuma outra tela do sistema, é só o "olhei e tá certo" do Suporte pra
  aquela semana. Uma vez conferido, o botão vira um "Conferido em ..." fixo (`ConferenciaAppView.tsx`,
  `conferencia.ts`, `pagamentos.ts`, `20260826030000_conferido_no_import.sql`)
- [x] **Rollover some da tela de Conciliação/Financeiro**: achado no INTERLAGOS CLUB — o Rollover
  (ver `rolloverAcerto`) cria dois lançamentos só do lado do Suporte, sem par nenhum da Genia (é uma
  decisão interna, sem dinheiro de verdade se movendo), então ficavam pendurados pra sempre com
  status "Falta Financeiro" — ninguém nunca ia preencher o outro lado. Agora lançamentos com
  descrição "Rollover" não aparecem mais na Conciliação nem na fila de Pendências (continuam
  existindo normal no banco e entrando certinho no próximo Acerto do clube, sem multa — só param de
  pedir uma conferência que nunca ia acontecer) (`useConciliacao.ts`)
- [x] **Controle de Pagamentos: Envio contando 2x quando o Pagamento já foi conciliado**: achado no
  CHIP COIN (semana 10/08-16/08, Valor Pago mostrando -1.355,94 em vez de -677,97, com "Envio 1" e
  "Envio 2" repetindo o mesmo valor). A busca de Envios por Acerto não filtrava por origem, então
  puxava os DOIS lados de um Pagamento já conciliado (o lançamento do Suporte e o par da Genia, cada
  um com o mesmo `acerto_id`) como se fossem dois pagamentos diferentes. Agora conta só o lado
  Suporte — mesma regra já usada em Pendências/Antecipação (`pagamentos.ts`)
- [x] **Dívida Simples "Pagar com Rake" ganha modo gradual (% Rakeback + Pagamento Mínimo)**: pedido
  do Cássio — antes, "Pagar com Rake" numa Dívida Simples só descontava o Valor Integral inteiro de
  uma vez no próximo Acerto. Agora, com "% Rakeback" preenchido, desconta só esse % do Rake do clube
  a cada semana (`dividas.saldo_restante` cai aos poucos até zerar, quitando sozinha) — Pagamento
  Mínimo (reaproveita o campo que já existia só pro Acordo) é o piso: numa semana em que o % render
  menos que o Mínimo, não desconta nada, espera uma semana melhor (comportamento confirmado com a
  planilha de referência do Sevens Pkr House — "Complemento Pgto Mínimo"). Vazio, continua exatamente
  como sempre foi (`DividaModal.tsx`, `DividasView.tsx`, `dividas.ts`,
  `20260826040000_divida_rakeback_pct.sql`)
- [x] **Lista de Acertos: colunas Rake MTT/Rake Cash/Acerto (Rake) trocadas por Bilhetes/Segurança/
  SpinUp Rake**: pedido do Cássio — a tabela principal de Acertos tinha colunas de detalhe do rake
  bruto (MTT/Cash separado, e o "Acerto (Rake)" só com o cálculo automático) que não ajudavam tanto
  quanto ver Bilhetes, Segurança e SpinUp Rake ali direto, sem precisar abrir o card de cada clube
  (`AcertosView.tsx`)
- [x] **Espanhol (fase 1 — infraestrutura + as ~280 frases já traduzíveis hoje)**: pedido do Cássio.
  O seletor de idioma (Sidebar + tela de Login) virou PT/EN/ES em vez do toggle PT/EN de antes, e o
  dicionário `lib/locales/es.ts` traduz palavra por palavra o mesmo conteúdo que já existe em inglês
  (`en.ts`) — checado por tipo (`typeof pt`), garante que nenhuma chave fica faltando. **Importante**:
  isso cobre só as ~49 telas que já passavam pelo sistema de tradução — outras ~40 telas (Cadastro de
  Clube, Dívidas, a lista de Acertos, entre outras) têm texto em português direto no código, sem
  passar pelo `t()` nenhum, então continuam em português mesmo com EN/ES selecionado. Destravar essas
  telas (ligar cada texto no `t()` + escrever a tradução) é trabalho grande, vem em fases seguintes
  (`i18n.tsx`, `es.ts`, `Sidebar.tsx`, `login/page.tsx`)
- [x] **Espanhol (fase 2 — telas de Dívidas)**: destrava as 3 telas de Dívidas e Acordos
  (`DividaModal.tsx`, `DividasView.tsx`, `InterromperAcordoModal.tsx`), que até agora tinham texto
  100% em português direto no código, sem passar pelo sistema de tradução — agora trocam para
  EN/ES normalmente junto com o resto do sistema. ~55 frases novas nos três dicionários
  (`pt.ts`, `en.ts`, `es.ts`)
- [x] **Espanhol (fase 3 — tela de Acertos)**: destrava a tela principal de Acertos (`AcertosView.tsx`)
  e os modais de Recalcular/Cotação (`ConfirmRecalcularModal.tsx`, `ConfirmCotacaoModal.tsx`) — a
  maior tela do sistema, tinha texto 100% em português direto no código desde sempre. ~65 frases
  novas nos três dicionários
- [x] **Espanhol (fase 4 — card de detalhe do Acerto)**: destrava o card "Common Settlement / Acerto
  Geral" (`ClubAcertoCard.tsx`) — abre toda vez que alguém clica num clube na lista de Acertos, era
  100% português direto no código. ~25 frases novas nos três dicionários
- [x] **Espanhol (fase 5 — modal de Clube)**: destrava o `ClubModal.tsx` (maior modal de Cadastro do
  sistema, 5 etapas — Identificação, Plataforma, Taxas, Regras, Garantias & Limites) e o `StepModal.tsx`
  compartilhado (usado por todos os modais em etapas — "Cancelar"/"Salvar" agora traduzidos globalmente).
  ~50 frases novas nos três dicionários
- [x] **Espanhol (fase 6 — modal de Regras)**: destrava o `RegraModal.tsx` (Cálculo de Acerto SE/ENTÃO,
  Multa por atraso e Layout do card de Acerto) — era 100% português direto no código. ~50 frases novas
  nos três dicionários
- [x] **Espanhol (fase 7 — modais de Jogador e Agente)**: destrava `JogadorModal.tsx` e `AgenteModal.tsx`
  (identificação, plataformas, clubes vinculados, hierarquia de Super Agente, Rakeback). ~60 frases novas
  nos três dicionários
- [x] **Espanhol (fase 8 — modal de Liga + painel de Regras Aplicadas)**: destrava `LeagueModal.tsx` e o
  `RegrasAplicadas.tsx` compartilhado (painel usado em Clube, Regra, Agente e Liga — traduzido uma vez,
  vale pros quatro cadastros). ~40 frases novas nos três dicionários
- [x] **Espanhol (fase 9 — painel de Vínculos)**: destrava `VinculosPanel.tsx` (tela /admin/regras — de
  quem pra quem cada Regra vale, com busca De/Para, seleção múltipla e aviso de incompatibilidade).
  ~30 frases novas nos três dicionários
- [x] **Espanhol (fase 10 — modais de confirmação genéricos)**: destrava `ConfirmDelete.tsx`,
  `CadastroModal.tsx` e o `ConfirmModal.tsx` compartilhado (usados em excluir/confirmar em telas por
  todo o sistema — Cadastro, Segurança, Stoploss, etc). ~5 frases novas + 1 chave nova em `common`
- [x] **Espanhol (fase 11 — buscas com dropdown)**: destrava `BuscaSelect.tsx` e `BuscaSelectMulti.tsx`
  (usados em quase toda tela de Cadastro e Relatórios pra escolher Liga/Clube/Agente etc) — reaproveitou
  chaves já existentes, sem frases novas. `Footer.tsx` conferido — já era 100% em inglês, sem mudança

### Próximas fases
- [ ] RLS por permissão (hoje o controle de acesso é só client-side)
- [ ] Relatórios adicionais do escopo original (rake líquido da liga, PnL)
- [ ] Contestação de lançamento pelo clube
- [ ] Layout responsivo completo — sidebar (gaveta no celular) e as telas principais já se adaptam;
  falta revisar formulário a formulário os modais grandes de cadastro (Liga/Clube/Agente), que ainda
  podem ficar apertados em telas bem pequenas
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

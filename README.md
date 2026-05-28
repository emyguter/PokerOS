# PokerOS — League Platform

> Infraestrutura financeira automatizada para ligas, clubes e agentes.
> *From game data to financial settlements — automatically.*

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 16 + React 18 + TypeScript |
| Estilo | Tailwind CSS v3 |
| Banco | Supabase (PostgreSQL 15) |
| Auth | Supabase Auth (a implementar) |
| Deploy | Vercel (planejado) |

---

## Estrutura

    PokerOS/
    app/admin/cadastro/  -> superligas, ligas, clubes, agentes
    components/cadastro/ -> CadastroTable, CadastroModal, ClubModal, ConfirmDelete
    components/          -> Sidebar, Footer
    lib/                 -> types.ts, cadastro-api.ts, supabase.ts

---

## Hierarquia de Dados

    Superliga -> Liga -> Clube -> Indicacoes
                              -> Agente -> Jogador

---

## Modelos de Acerto

| Modelo | Ligas | Campos |
|--------|-------|--------|
| Taxa Dinamica | LP | Fee MTT, Fee Cash, Rebate, SpinUp |
| Weekly USD | ORION | Fee MTT, Rebate, Crypto Rebate |
| Rakeback | SUL_HG | Rakeback % |

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

---

## MVP 1 — Status

### Concluido
- [x] Design system
- [x] Layout base (sidebar, footer, navegacao)
- [x] Cadastro Superligas — CRUD
- [x] Cadastro Ligas — CRUD
- [x] Cadastro Clubes — CRUD + campos condicionais + indicacoes

### Em desenvolvimento
- [ ] Cadastro Agentes
- [ ] Importacao de arquivos .xlsx
- [ ] Motor de regras financeiras
- [ ] Relatorio de acerto

### Proximas fases
- [ ] Autenticacao por liga
- [ ] Isolamento de dados por liga
- [ ] Exportacao Excel
- [ ] API Routes para regras financeiras
- [ ] Deploy Vercel

---

## Decisoes Tecnicas

**Front chama Supabase direto:** OK para MVP interno com RLS.
Migracao para API Routes antes de abrir para usuarios externos.

**Sem microservicos:** monolito bem estruturado e o correto para o tamanho atual.

**Tailwind v3:** downgrade do v4 para garantir compatibilidade total.

---

*Simbolos: Espadas Copas Ouros Paus — From game data to financial settlements — automatically.*
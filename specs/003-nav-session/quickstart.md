# Quickstart / Validação: Navegação e Sessão (003-nav-session)

Roteiro de validação manual ponta a ponta. Não há teste de domínio novo (ver
[research.md](./research.md) D5); a verificação é por estes cenários. Referência de exibição:
[contracts/nav-contract.md](./contracts/nav-contract.md).

## Pré-requisitos

- Postgres em Docker no `:5433` em pé (mesma stack da 001/002).
- `.env` com `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `DATABASE_URL`.
- Pelo menos um usuário CLIENT e um usuário OWNER (promover via seed/script da 002).
- App rodando: `npm run dev`.

## Cenários

### C1 — Visitante entra pela navegação (US1 / SC-001)
1. Abrir `/` sem sessão.
2. **Esperado**: header com "Serviços" e "Entrar"; nenhum link de área logada; sem indicação de sessão.
3. Clicar "Entrar" → fluxo Google inicia **sem digitar URL**.

### C2 — Pós-login mostra navegação do papel (US1+US2 / SC-002, SC-006)
1. Concluir o login com Google e voltar ao app.
2. **Esperado (CLIENT)**: header mostra "Serviços", "Agendar", "Meus agendamentos", a indicação de
   sessão (nome ou email do usuário logado) e "Sair".
3. A indicação de sessão corresponde ao usuário realmente logado (SC-006).

### C3 — OWNER vê o Painel (US2 / SC-004)
1. Logado como OWNER, abrir qualquer página.
2. **Esperado**: tudo do CLIENT **mais** o link "Painel" (`/owner`); abrir "Painel" funciona.

### C4 — CLIENT não vê o Painel, mas o servidor barra a URL direta (US3 / SC-004, SC-005)
1. Logado como CLIENT: **esperado** que "Painel" **não** apareça no header.
2. Navegar manualmente para `/owner`.
3. **Esperado**: o servidor redireciona para `/` (lockdown da 002 inalterado). A proteção não depende
   do header.

### C5 — Logout volta à navegação de visitante (US1 / SC-003)
1. Logado (CLIENT ou OWNER), clicar "Sair".
2. **Esperado**: sessão encerrada; header volta a exibir só "Serviços" + "Entrar" (estado de visitante).

### C6 — Sessão expirada (edge case / SC-007, FR-012)
1. Com sessão ativa, invalidar/expirar a sessão (ex.: remover o registro de sessão no banco) e
   recarregar uma página.
2. **Esperado**: header volta à condição de visitante sem necessidade de digitar URL.

### C7 — Promoção/rebaixamento reflete o papel atual (edge case / FR-009)
1. Logado como CLIENT (sem "Painel" no header). Promover o usuário a OWNER no banco.
2. Recarregar a página.
3. **Esperado**: "Painel" passa a aparecer (papel lido do banco, não claim cacheado). Rebaixar a
   CLIENT e recarregar ⇒ "Painel" some.

### C8 — Consistência em todas as páginas (FR-008)
1. Navegar entre `/`, `/services`, `/booking`, `/my-bookings` (e `/owner` se OWNER).
2. **Esperado**: o header aparece de forma consistente em todas.

## Regressão (não enfraquecer nada)
- `npm run test` continua verde — nenhuma garantia da 001/002 foi alterada.
- Nenhuma rota protegida teve sua proteção modificada (apenas `layout.tsx`, `session.ts` e dois
  componentes novos foram tocados).

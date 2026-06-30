# Research: Navegação e Sessão (003-nav-session)

Consolidação das decisões técnicas. Não há `NEEDS CLARIFICATION` pendente — a feature reusa
integralmente a fundação da 001/002.

## D1 — Onde a navegação vive: header único no layout raiz

- **Decisão**: montar um `<SiteHeader />` em `src/app/layout.tsx`, antes de `{children}`.
- **Rationale**: o layout raiz envolve todas as rotas do App Router, garantindo presença consistente
  (FR-008) sem duplicar markup por página. O header é um Server Component e pode ser `async`.
- **Alternativas consideradas**:
  - Incluir o header em cada `page.tsx` → rejeitado: duplicação e risco de inconsistência (viola DRY /
    Princípio III).
  - Um layout aninhado por segmento → rejeitado: desnecessário; a navegação é global e o papel é
    decidido em um único ponto.

## D2 — Leitura de sessão e papel: no servidor, role do banco (FR-003/FR-007/FR-009)

- **Decisão**: a navegação lê a sessão **no servidor** via `getServerSession` (camada existente
  `src/server/auth/session.ts`), e o `role` é lido do **banco** por requisição — a mesma fonte de
  verdade que `assertOwnerRole`/`requireOwner` já usam. Adicionar um helper `getNavSession()` em
  `session.ts` que devolve `{ user, role }`.
- **Rationale**: a sessão é `database` (`authOptions.session.strategy = "database"`) e o callback
  `session` só expõe `user.id`, **não** o `role`. Para decidir links pelo papel é preciso o `role`
  atual; lê-lo do banco evita um claim cacheado obsoleto após promoção/rebaixamento (FR-009, edge
  case de papel). Usar `useSession` no cliente foi descartado: traria o papel do lado do cliente
  (claim potencialmente defasado) e moveria a decisão para fora do servidor.
- **Por que não duplicar lógica de papel**: `getNavSession` apenas **lê** o `role` (um `findUnique`
  com `select: { role }`), sem reimplementar a regra de autorização. A *decisão de barrar* continua
  exclusivamente em `requireOwner`. A navegação só decide **exibição**, derivando do mesmo dado.
- **Alternativas consideradas**:
  - `useSession` (client) → rejeitado (FR-009: papel viria do cliente, possivelmente obsoleto; decisão
    sairia do servidor).
  - Expor `role` no callback de sessão do NextAuth → rejeitado nesta feature: alteraria a camada de
    auth compartilhada (fora do escopo, Princípio VI) e reintroduziria o risco de claim cacheado que a
    002 deliberadamente evitou lendo o `role` do banco.

## D3 — Login/Logout: ilha client mínima (FR-001/FR-002)

- **Decisão**: um único componente client `src/components/auth-buttons.tsx` (`"use client"`) com os
  botões "Entrar" (`signIn("google")`) e "Sair" (`signOut()`) de `next-auth/react`. O `SiteHeader`
  (servidor) decide **qual** botão renderizar; o componente client só dispara o gatilho.
- **Rationale**: `signIn`/`signOut` são funções client-side do NextAuth. Isolá-las num componente
  pequeno mantém toda a *decisão* de navegação no servidor e o mínimo de JS no cliente (Princípio III).
  Não é necessário `SessionProvider`/`useSession`, pois a sessão é lida no servidor.
- **Nota de renderização**: ler a sessão no layout raiz opta a árvore por renderização dinâmica
  (sessão por requisição). Aceitável nesta escala (uma barbearia); as páginas `/owner` já são
  `force-dynamic`. Sem impacto de performance relevante.
- **Alternativas consideradas**:
  - Formularios `POST` para `/api/auth/signin|signout` sem JS → viável, mas `signIn/signOut` já é o
    padrão do projeto/stack e simplifica callbackUrl; mantido por consistência.

## D4 — Segurança: nenhuma proteção é tocada (FR-010/FR-011/US3)

- **Decisão**: não alterar `requireOwner` (`src/server/auth/owner.ts`) nem as páginas `/owner`. O
  lockdown da 002 — cada página do painel chama `requireOwner` e redireciona `ForbiddenError → "/"`,
  `UnauthorizedError → signin` — **já garante o SC-005** (CLIENT barrado ao acessar a URL direta).
- **Rationale**: a visibilidade de link é conveniência (FR-010); a barreira real permanece no
  servidor (FR-011). Reusar a garantia existente em vez de reimplementar (Princípio VI). O plano
  confirma que nenhuma rota protegida tem sua proteção modificada.
- **Verificação**: SC-005 é validável manualmente (quickstart) reusando o comportamento já entregue
  pela 002; nenhum teste novo é necessário.

## D5 — Testes (Princípio IV/VI)

- **Decisão**: sem novo teste de domínio. A feature é UI + leitura de sessão; não há lógica de
  disponibilidade/conflito nova. SC-005 coberto pelo lockdown da 002. Validação por `quickstart.md`.
- **Rationale**: Princípio IV exige test-first apenas para disponibilidade/conflito (intactos);
  Princípio VI desencoraja testes de renderização supérfluos. Caso se queira cobertura, o ponto de
  maior valor seria um teste do mapeamento papel→links de `getNavSession`/`SiteHeader`, mas é
  opcional e fora do mínimo.

# Implementation Plan: Navegação e Sessão

**Branch**: `003-nav-session` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-nav-session/spec.md`

## Summary

Tornar o Trimote navegável sem digitar URLs: um **header único** montado no layout raiz
(`src/app/layout.tsx`) que aparece de forma consistente em todas as páginas (FR-008), com ação
"Entrar" para o visitante, "Sair" para o autenticado, e links condicionados ao papel
(visitante / CLIENT / OWNER) mais a identificação de quem está logado. A decisão de **quais links
mostrar é tomada no servidor**, lendo a sessão pela camada existente (`getServerSession` via
`src/server/auth/session.ts`) e o `role` da **fonte de verdade já usada pelo `requireOwner`** (leitura
do `role` no banco por requisição), de modo que a navegação reflita o papel atual e não um claim
cacheado (FR-009). Apenas os gatilhos `signIn`/`signOut` (client-side do NextAuth) ficam num pequeno
componente client; a navegação em si é renderizada no servidor. **Nenhuma proteção de servidor é
tocada**: o lockdown do painel (002 — cada página `/owner` chama `requireOwner` e redireciona) já
garante o SC-005 e é reusado como está.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (Next.js 16, App Router) — mesma da 001/002.

**Primary Dependencies**: Next.js 16, React 19, NextAuth/Auth.js (Google, sessão `database`), ShadCN UI
+ Tailwind. **Nenhuma dependência nova.**

**Storage**: PostgreSQL (Docker `:5433`). **Nenhuma migration nova** — reusa `User.role` (enum `Role`
da 002) e as tabelas de sessão do NextAuth.

**Testing**: Vitest. Sem novo teste de domínio (a feature é UI + leitura de sessão). O SC-005 já está
coberto pelo lockdown da 002; não criar teste de renderização supérfluo (Princípio VI). Validação
manual via `quickstart.md`.

**Target Platform**: Aplicação web (Server Components / Server Actions em Node.js) — mesma da 001/002.

**Project Type**: Web app full-stack Next.js (projeto único).

**Performance Goals**: Baixo volume (uma barbearia). Ler a sessão no layout raiz opta a aplicação por
renderização dinâmica — aceitável nesta escala (ver research.md D3).

**Constraints**: Decisão de links **no servidor** (FR-009/FR-010); UI nunca é a barreira de segurança
(FR-010/FR-011). Não tocar `requireOwner` nem nenhuma proteção existente (US3/Princípio VI). Sem
estética/tema/redesign.

**Scale/Scope**: 1 barbearia, poucos usuários. Código novo mínimo: header + leitura de sessão/role +
botões de login/logout.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Aderência | Status |
|-----------|-----------|--------|
| I. Segurança (Blue Team) | Decisão de navegação **no servidor**; visibilidade de link é conveniência, nunca barreira. Proteção real (`requireOwner`) inalterada. Sem novos segredos. | ✅ PASS |
| II. Integridade no Banco | Sem novas regras de dados; `role` lido da fonte de verdade no banco por requisição. Nenhuma migration. | ✅ PASS |
| III. SOLID / Clean Code | Reusa `session.ts` e a leitura de `role` da 002; isola o mínimo de client (só os botões `signIn`/`signOut`); header coeso e pequeno. | ✅ PASS |
| IV. Test-First | Não há lógica de domínio nova (disponibilidade/conflito intactos). SC-005 já coberto pelo lockdown da 002. Nenhum teste de UI supérfluo (Princípio VI). | ✅ PASS |
| V. Convenções | Conventional Commits; código/identificadores em inglês, comentários/docs em português; README atualizado com a navegação. | ✅ PASS |
| VI. Escopo Disciplinado | Único código novo: header + botões + leitura de sessão para decidir links. Nada de agendamento/autorização/painel é alterado; `requireOwner` não é tocado. | ✅ PASS |
| VII. Tempo (UTC/SP) | Não envolve lógica temporal. | ✅ PASS |

**Resultado do gate**: PASS — sem violações. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/003-nav-session/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── nav-contract.md          # matriz de visibilidade visitante/CLIENT/OWNER
└── tasks.md                     # (/speckit-tasks — não criado aqui)
```

### Source Code (repository root) — adições/ajustes

```text
src/
├── app/
│   └── layout.tsx               # AJUSTE: monta <SiteHeader /> antes de {children} (FR-008)
├── components/
│   ├── site-header.tsx          # NOVO (server): lê sessão+role e decide os links
│   └── auth-buttons.tsx         # NOVO (client "use client"): botões Entrar/Sair
│                                #   (signIn("google") / signOut) — único client da feature
└── server/
    └── auth/
        └── session.ts           # AJUSTE: + helper getNavSession() que devolve
                                 #   { user, role } lendo role do banco (mesma fonte do requireOwner)
```

**Structure Decision**: Mantém a arquitetura da 001/002. O header é um **Server Component**
(`src/components/site-header.tsx`) que lê a sessão e o `role` no servidor e renderiza a lista de links
conforme o papel; a única ilha client é `auth-buttons.tsx` (somente os gatilhos `signIn`/`signOut`,
que são client-side no NextAuth). A leitura de papel é centralizada num helper novo em `session.ts`
(`getNavSession`) que consulta o `role` no **banco** — a mesma fonte de verdade lida por
`assertOwnerRole`/`requireOwner` — evitando depender de um claim de sessão obsoleto (FR-009) e sem
duplicar a regra de autorização. **Nenhum arquivo de proteção é alterado**: os guards `requireOwner`
(`src/server/auth/owner.ts`) e as páginas `/owner` (lockdown da 002) permanecem intactos.

## Complexity Tracking

> Nenhuma violação a justificar. A feature adiciona apenas um header de conveniência e a leitura de
> sessão/role no servidor; não introduz complexidade acidental nem toca nenhuma garantia existente.

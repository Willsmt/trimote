# Contrato de UI: Navegação (003-nav-session)

Contrato de **exibição** do header. Não é contrato de segurança — a barreira real é o servidor
(`requireOwner` + lockdown das páginas `/owner`, da 002). Visibilidade de link = conveniência
(FR-010/FR-011).

## Entrada

`NavState`, derivado no servidor por `getNavSession()` (ver [data-model.md](../data-model.md)):
`VISITOR | CLIENT | OWNER`. Papel não reconhecido → tratado como `CLIENT` (nunca expõe Painel).

## Matriz NavState → links/ações

| Item (rótulo)        | Destino / ação              | VISITOR | CLIENT | OWNER | Requisitos        |
|----------------------|-----------------------------|:-------:|:------:|:-----:|-------------------|
| Serviços             | `/services` (público)       |   ✅    |   ✅   |  ✅   | FR-004            |
| Entrar               | `signIn("google")`          |   ✅    |   —    |  —    | FR-001            |
| Agendar              | `/booking`                  |   —     |   ✅   |  ✅   | FR-005            |
| Meus agendamentos    | `/my-bookings`              |   —     |   ✅   |  ✅   | FR-005            |
| Painel               | `/owner`                    |   —     |   —    |  ✅   | FR-006            |
| Indicação de sessão  | `user.name ?? user.email`   |   —     |   ✅   |  ✅   | FR-007            |
| Sair                 | `signOut()`                 |   —     |   ✅   |  ✅   | FR-002            |

Legenda: ✅ exibido · — não exibido.

## Regras

- **R1 (FR-008)**: o header é montado uma única vez no layout raiz e aparece em todas as páginas.
- **R2 (FR-009)**: o `role` que decide a coluna vem do banco por requisição (fonte do `requireOwner`),
  nunca de um claim cacheado. Promoção/rebaixamento reflete na próxima renderização.
- **R3 (FR-012)**: sem sessão (incl. sessão expirada) ⇒ `NavState = VISITOR` ⇒ só "Serviços" + "Entrar".
- **R4 (FR-010/FR-011)**: esconder "Painel" para CLIENT é conveniência; acesso direto a `/owner` por um
  CLIENT continua barrado pelo servidor (SC-005), independentemente do header.

## Não-objetivos

- Estética, tema, cores, tipografia, responsividade refinada (redesign futuro).
- Ordenação/agrupamento visual dos links além do necessário para existirem e funcionarem.

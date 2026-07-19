---
name: trimote-authz
description: Aplicar SEMPRE que escrever ou revisar Server Actions, route handlers, ou qualquer código que envolva sessão, roles, membership, ou acesso a dados de um negócio (Business) ou cliente.
---

# Autorização e Multi-tenancy

- `businessId` NUNCA vem de input do cliente. Deriva sempre de `getActiveBusiness()` (Session.activeBusinessId, revalidado a cada request).
- `clientId` para dados do próprio cliente vem SEMPRE da sessão, nunca de parâmetro.
- `requireAdmin` valida `User.role` lido do banco; `requireOwner` valida membership (`BusinessMember`) do negócio ATIVO. Não confundir: ADMIN é papel global, OWNER é posse por negócio (vive em BusinessMember, não no Role global).
- Anti-escalação (5 camadas): não existe caminho público para escrever `User.role` ou `BusinessMember`; ADMIN só promove a OWNER; ADMIN não opera negócios de terceiros.
- Validação de entrada é estrita e SEMPRE no servidor. Validação client-side é conveniência de UX, nunca barreira.
- Erros, respostas e logs não vazam segredos, dados sensíveis nem detalhes internos exploráveis.

import { prisma } from "@/server/db/client";

/**
 * Núcleo da duplicação de lançamento inativado (issue #11), testável com `ownerId` explícito.
 * Desfazer uma inativação acidental = criar um lançamento NOVO copiando o inativado — fato novo no
 * razão. O original NUNCA reativa (imutabilidade do ledger + trilha de auditoria do soft delete).
 *
 * Cópia verbatim: type, origin, amount, occurredAt (o fato econômico pertence à data original;
 * a auditoria do ato de duplicar vive em createdAt/createdBy novos), description, category,
 * paymentMethod, bookingId, clientId, clientName e itens (com os amounts do SNAPSHOT original —
 * nunca re-snapshot do catálogo atual). NÃO copiados: externalRef (referência do pagamento
 * ORIGINAL — dois lançamentos não podem apontar o mesmo pagamento externo), createdBy (= quem
 * duplica), isActive (true) e timestamps.
 *
 * Guardas: só lançamento INATIVO é duplicável (`entry_not_inactive`); para origin BOOKING, recusa
 * se já existir outro lançamento ATIVO do mesmo booking (`booking_already_captured`) — preserva a
 * invariante D10 (1 ativo + N inativos por booking; bookingId não tem unicidade no banco). A
 * checagem do booking e o create rodam na MESMA $transaction; a corrida residual (sem índice único
 * parcial no banco) é aceita e fica para issue futura de hardening.
 *
 * Escopo por negócio (007): o lançamento é resolvido por `findFirst({ where: { id, businessId } })`
 * — nunca por `id` só; um lançamento de outro negócio cai em `entry_not_found` (sem oráculo de
 * existência cross-tenant). O `businessId` vem do vínculo da sessão (via `requireOwner`), NUNCA do
 * input.
 *
 * Ordem de verificação (curto-circuito): entry_not_found → entry_not_inactive →
 * $transaction(booking_already_captured → create com nested items).
 */

export interface DuplicateLedgerEntryInput {
  /** Negócio ativo do dono (007) — derivado do vínculo da sessão pela action, NUNCA do input. */
  businessId: string;
  /** OWNER que duplica (createdBy do NOVO lançamento — auditoria do ato). */
  ownerId: string;
  ledgerEntryId: string;
}

export type DuplicateLedgerEntryReason =
  | "entry_not_found"
  | "entry_not_inactive"
  | "booking_already_captured";

export type DuplicateLedgerEntryResult =
  | { ok: true; ledgerEntryId: string }
  | { ok: false; reason: DuplicateLedgerEntryReason };

export async function duplicateLedgerEntryForOwner(
  input: DuplicateLedgerEntryInput,
): Promise<DuplicateLedgerEntryResult> {
  const original = await prisma.ledgerEntry.findFirst({
    where: { id: input.ledgerEntryId, businessId: input.businessId },
    include: { items: true },
  });

  if (!original) {
    return { ok: false, reason: "entry_not_found" };
  }
  if (original.isActive) {
    return { ok: false, reason: "entry_not_inactive" };
  }

  // Guarda do booking + create na MESMA transação: entre a checagem e a escrita nenhum outro
  // lançamento ativo do mesmo booking pode ser observado por esta operação. `null` = guarda violada.
  const created = await prisma.$transaction(async (tx) => {
    if (original.bookingId) {
      const activeSibling = await tx.ledgerEntry.findFirst({
        where: { bookingId: original.bookingId, isActive: true },
        select: { id: true },
      });
      if (activeSibling) {
        return null;
      }
    }

    return tx.ledgerEntry.create({
      data: {
        businessId: input.businessId,
        type: original.type,
        origin: original.origin,
        amount: original.amount,
        occurredAt: original.occurredAt,
        description: original.description,
        category: original.category,
        paymentMethod: original.paymentMethod,
        externalRef: null,
        bookingId: original.bookingId,
        clientId: original.clientId,
        clientName: original.clientName,
        createdBy: input.ownerId,
        items: {
          create: original.items.map((item) => ({
            serviceId: item.serviceId,
            description: item.description,
            amount: item.amount,
          })),
        },
      },
      select: { id: true },
    });
  });

  if (!created) {
    return { ok: false, reason: "booking_already_captured" };
  }
  return { ok: true, ledgerEntryId: created.id };
}

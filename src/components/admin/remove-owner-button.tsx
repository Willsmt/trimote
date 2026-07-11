"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { removeOwner } from "@/server/actions/admin-remove-owner";

// Mapa COMPLETO de reasons → mensagem (aprendizado #24: nenhum reason cai num genérico órfão). O
// last_owner é o aviso que o ADMIN mais vê — fica ao lado do botão, não perdido no topo da página.
const FAILURE: Record<string, string> = {
  business_not_found: "Negócio não encontrado.",
  membership_not_found: "Esse dono não faz mais parte deste negócio.",
  last_owner: "Promova outro dono antes de remover este.",
};

// Ilha client por linha de dono: remove o vínculo (unlink puro, sem desfazer). Confirmação antes do
// delete (destrutivo) + guarda síncrona anti-double-click (padrão #25 do TodaySchedule/LedgerManager).
export function RemoveOwnerButton({
  businessId,
  membershipId,
  ownerLabel,
}: {
  businessId: string;
  membershipId: string;
  ownerLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  function onRemove() {
    // Destrutivo e sem undo: confirma antes. O diálogo nativo é bloqueante — um segundo clique não
    // entra enquanto ele está aberto; o submittingRef cobre a fase assíncrona depois do OK.
    if (
      !confirm(
        `Remover ${ownerLabel} como dono deste negócio? A pessoa perde o acesso ao painel. Não há como desfazer.`,
      )
    ) {
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await removeOwner({ businessId, membershipId });
        if (r.ok) {
          router.refresh();
        } else {
          setMessage(FAILURE[r.reason] ?? "Não foi possível remover o dono.");
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={onRemove}
        disabled={isPending}
        className="text-xs text-red-600 underline disabled:opacity-50"
      >
        {isPending ? "removendo…" : "remover"}
      </button>
      {message && <span className="text-xs text-red-600">{message}</span>}
    </span>
  );
}

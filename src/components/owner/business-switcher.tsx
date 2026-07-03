"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { switchBusiness } from "@/server/actions/switch-business";

// Ilha do seletor de negócio ativo (007, US2). Oculto quando há 1 negócio; estado vazio quando há 0
// (orienta contato com o ADMIN). A troca é server-side (switchBusiness grava na sessão) + refresh.
export interface BusinessSwitcherProps {
  businesses: { id: string; name: string }[];
  activeBusinessId: string | null;
}

export function BusinessSwitcher({ businesses, activeBusinessId }: BusinessSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (businesses.length === 0) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
        Você ainda não é dono de nenhum negócio. Fale com o administrador da plataforma.
      </p>
    );
  }
  if (businesses.length === 1) return null; // um só negócio → seletor oculto (auto-selecionado)

  function onChange(businessId: string) {
    startTransition(async () => {
      await switchBusiness({ businessId });
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-neutral-500">Negócio ativo:</span>
      <select
        className="rounded border border-neutral-300 p-1"
        value={activeBusinessId ?? ""}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
      >
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}

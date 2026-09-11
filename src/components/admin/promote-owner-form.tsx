"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { promoteOwner } from "@/server/actions/admin-promote-owner";

// Ilha client: promover dono por email (US1). Busca EXATA por email de usuário JÁ cadastrado.
const FAILURE: Record<string, string> = {
  business_not_found: "Negócio não encontrado.",
  user_not_found: "Nenhum usuário com esse email. A pessoa precisa ter criado a conta antes.",
  already_member: "Esse usuário já é dono deste negócio.",
};

interface BusinessOption {
  id: string;
  name: string;
}

export function PromoteOwnerForm({ businesses }: { businesses: BusinessOption[] }) {
  const router = useRouter();
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const r = await promoteOwner({ businessId, email });
      if (r.ok) {
        setEmail("");
        setMessage("Dono vinculado ao negócio.");
        router.refresh();
      } else {
        setMessage(FAILURE[r.reason] ?? "Não foi possível promover.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-card border border-borda bg-superficie p-6">
      <h2 className="font-semibold text-texto">Promover dono</h2>
      {message && <p className="text-sm text-texto-secundario">{message}</p>}
      <select className="rounded-input border border-borda p-2 text-sm" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      <input className="rounded-input border border-borda p-2 text-sm" placeholder="email do usuário" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !businessId || !email}
        className="self-start rounded-botao border border-borda px-4 py-1 text-sm text-texto transition-colors hover:border-primaria hover:text-primaria disabled:opacity-50"
      >
        {pending ? "Vinculando…" : "Vincular como dono"}
      </button>
    </section>
  );
}

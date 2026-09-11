"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createBusiness } from "@/server/actions/admin-create-business";
import { slugify } from "@/server/business/reserved-slugs";

// Ilha client: criar negócio (US1). O slug é PRÉ-PREENCHIDO por derivação do nome (kebab-case, sem
// acentos) e editável; a validação real (formato/reservados/unicidade) é no servidor.
const FAILURE: Record<string, string> = {
  invalid_slug: "Slug inválido (use minúsculas, números e hífens).",
  slug_reserved: "Esse slug é reservado pelo sistema. Escolha outro.",
  slug_taken: "Esse slug já está em uso. Escolha outro.",
};

export function CreateBusinessForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [timeZone, setTimeZone] = useState("America/Sao_Paulo");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value)); // pré-preenchimento enquanto o usuário não editar o slug
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const r = await createBusiness({ name, slug, timeZone });
      if (r.ok) {
        setName(""); setSlug(""); setSlugEdited(false);
        setMessage("Negócio criado.");
        router.refresh();
      } else {
        setMessage(FAILURE[r.reason] ?? "Não foi possível criar o negócio.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-card border border-borda bg-superficie p-6">
      <h2 className="font-semibold text-texto">Criar negócio</h2>
      {message && <p className="text-sm text-texto-secundario">{message}</p>}
      <input className="rounded-input border border-borda p-2 text-sm" placeholder="Nome" value={name} onChange={(e) => onName(e.target.value)} />
      <input
        className="rounded-input border border-borda p-2 text-sm"
        placeholder="slug"
        value={slug}
        onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
      />
      <input className="rounded-input border border-borda p-2 text-sm" placeholder="Fuso (timezone)" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !name || !slug}
        className="self-start rounded-botao border border-borda px-4 py-1 text-sm text-texto transition-colors hover:border-primaria hover:text-primaria disabled:opacity-50"
      >
        {pending ? "Criando…" : "Criar"}
      </button>
    </section>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createService } from "@/server/actions/create-service";
import { updateService } from "@/server/actions/update-service";
import { deactivateService } from "@/server/actions/deactivate-service";
import { reactivateService } from "@/server/actions/reactivate-service";

interface OwnerServiceItem {
  id: string;
  name: string;
  price: string;
  durationMinutes: number;
  isActive: boolean;
}

const FAILURE_MESSAGES: Record<string, string> = {
  invalid_input: "Dados inválidos. Verifique nome, preço e duração.",
  name_taken: "Já existe um serviço ativo com esse nome.",
  not_found: "Serviço não encontrado.",
  already_inactive: "Este serviço já está inativo.",
};

export function ServicesManager({ services }: { services: OwnerServiceItem[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({ name: "", price: "", durationMinutes: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function report(result: { ok: true } | { ok: false; reason: string }) {
    setMessage(result.ok ? "Operação concluída." : FAILURE_MESSAGES[result.reason] ?? "Falhou.");
    if (result.ok) router.refresh();
  }

  async function onCreate() {
    setPending(true);
    setMessage(null);
    const result = await createService({
      name,
      price,
      durationMinutes: Number(durationMinutes),
    });
    setPending(false);
    report(result);
    if (result.ok) {
      setName("");
      setPrice("");
      setDurationMinutes("");
    }
  }

  function startEdit(service: OwnerServiceItem) {
    setEditingId(service.id);
    setEditFields({
      name: service.name,
      price: service.price,
      durationMinutes: String(service.durationMinutes),
    });
  }

  async function onSaveEdit(id: string) {
    setPending(true);
    setMessage(null);
    const result = await updateService({
      serviceId: id,
      name: editFields.name,
      price: editFields.price,
      durationMinutes: Number(editFields.durationMinutes),
    });
    setPending(false);
    report(result);
    if (result.ok) setEditingId(null);
  }

  async function onToggleActive(service: OwnerServiceItem) {
    setPending(true);
    setMessage(null);
    const result = service.isActive
      ? await deactivateService({ serviceId: service.id })
      : await reactivateService({ serviceId: service.id });
    setPending(false);
    report(result);
  }

  return (
    <div className="flex flex-col gap-6">
      {message && <p className="text-sm font-medium">{message}</p>}

      <section className="flex flex-col gap-2 rounded border border-neutral-300 p-4">
        <h2 className="font-semibold">Novo serviço</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded border border-neutral-300 p-2"
            placeholder="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-28 rounded border border-neutral-300 p-2"
            placeholder="Preço"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <input
            className="w-28 rounded border border-neutral-300 p-2"
            placeholder="Min"
            inputMode="numeric"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
          />
          <button
            type="button"
            className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
            onClick={onCreate}
            disabled={pending || !name || !price || !durationMinutes}
          >
            Criar
          </button>
        </div>
      </section>

      <ul className="flex flex-col gap-2">
        {services.map((service) => (
          <li key={service.id} className="rounded border border-neutral-300 p-3">
            {editingId === service.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="rounded border border-neutral-300 p-2"
                  value={editFields.name}
                  onChange={(e) => setEditFields({ ...editFields, name: e.target.value })}
                />
                <input
                  className="w-28 rounded border border-neutral-300 p-2"
                  value={editFields.price}
                  onChange={(e) => setEditFields({ ...editFields, price: e.target.value })}
                />
                <input
                  className="w-28 rounded border border-neutral-300 p-2"
                  value={editFields.durationMinutes}
                  onChange={(e) =>
                    setEditFields({ ...editFields, durationMinutes: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                  onClick={() => onSaveEdit(service.id)}
                  disabled={pending}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  className="rounded border border-neutral-300 px-3 py-1 text-sm"
                  onClick={() => setEditingId(null)}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {service.name}{" "}
                    {!service.isActive && (
                      <span className="text-xs text-neutral-400">(inativo)</span>
                    )}
                  </p>
                  <p className="text-sm text-neutral-500">
                    R$ {service.price} · {service.durationMinutes} min
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded border border-neutral-300 px-3 py-1 text-sm"
                    onClick={() => startEdit(service)}
                    disabled={pending}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="rounded border border-neutral-300 px-3 py-1 text-sm"
                    onClick={() => onToggleActive(service)}
                    disabled={pending}
                  >
                    {service.isActive ? "Desativar" : "Reativar"}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";

import { updateBusinessEndereco } from "@/server/actions/update-business-endereco";

// Mesma estrutura de form/useTransition/submittingRef de business-whatsapp-form.tsx — duplicada de
// propósito (mesmo racional da #52: extrair um padrão compartilhado fica pra quando fizer sentido
// generalizar de verdade; aqui nem há máscara pra duplicar, é texto livre puro). <textarea> em vez
// de <input>: endereço tende a ser mais longo que um telefone.
export function BusinessEnderecoForm({ initialEndereco }: { initialEndereco: string | null }) {
  const [value, setValue] = useState(initialEndereco ?? "");
  // Endereço efetivamente SALVO no banco (ou null), distinto do conteúdo do textarea. Governa a
  // visibilidade do "Remover": só há o que remover quando existe valor persistido.
  const [savedEndereco, setSavedEndereco] = useState<string | null>(initialEndereco);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Guarda síncrona anti-double-click (padrão #25): ignora clique repetido enquanto salva.
  const submittingRef = useRef(false);

  function onSave() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        // Vazio limpa (null); senão manda o digitado — o servidor faz trim() e valida não-vazio.
        const r = await updateBusinessEndereco({ endereco: value.trim() === "" ? null : value });
        if (r.ok) {
          setValue(r.endereco ?? "");
          setSavedEndereco(r.endereco);
          setMessage(r.endereco ? "Endereço salvo." : "Endereço removido.");
        } else {
          setMessage("Informe um endereço válido (não pode ficar só com espaços).");
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  // Remover explícito: "apagar o campo e salvar" não é descobrível. Chama a MESMA action com vazio
  // (a action já trata vazio -> null; nenhum backend novo). confirm() leve por ser dado destrutivo.
  function onRemove() {
    if (!confirm("Remover o endereço do negócio?")) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await updateBusinessEndereco({ endereco: "" });
        if (r.ok) {
          setValue("");
          setSavedEndereco(null);
          setMessage("Endereço removido.");
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Endereço do negócio
        <textarea
          rows={2}
          className="rounded border border-neutral-300 p-2"
          placeholder="Rua Aurora, 210 — Vila Romana, São Paulo"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <p className="text-xs text-neutral-500">
        Exibido na sua página pública para que o cliente saiba onde fica e possa traçar a rota.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={isPending}
          className="rounded bg-neutral-900 px-4 py-1 text-sm text-white disabled:opacity-50"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
        {/* Só há o que remover quando existe endereço salvo (deriva do estado persistido). */}
        {savedEndereco && (
          <button
            type="button"
            onClick={onRemove}
            disabled={isPending}
            className="rounded border border-neutral-300 px-4 py-1 text-sm disabled:opacity-50"
          >
            Remover
          </button>
        )}
      </div>
      {message && <p className="text-sm font-medium">{message}</p>}
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";

import { updateBusinessWhatsapp } from "@/server/actions/update-business-whatsapp";

// Máscara BR à mão (sem lib, como o resto do projeto): só CONFORTO visual de digitação. A validação
// autoritativa mora no servidor (domain/phone + action); a máscara nunca é a validação. Mesma função
// de src/components/profile-phone-form.tsx — duplicada aqui de propósito (componente client não
// importa de outro componente client só por uma função utilitária de UI; extrair um util
// compartilhado fica pra quando um 3º consumidor aparecer).
function maskPhoneBR(value: string): string {
  let d = value.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** E.164 armazenado (+5511999999999) → máscara de exibição. O valor guardado é sempre canônico. */
function e164ToMask(phone: string | null): string {
  return maskPhoneBR((phone ?? "").replace(/^\+55/, ""));
}

export function BusinessWhatsappForm({ initialWhatsapp }: { initialWhatsapp: string | null }) {
  const [value, setValue] = useState(e164ToMask(initialWhatsapp));
  // WhatsApp efetivamente SALVO no banco (E.164 ou null), distinto do conteúdo do input. Governa a
  // visibilidade do "Remover": só há o que remover quando existe valor persistido.
  const [savedWhatsapp, setSavedWhatsapp] = useState<string | null>(initialWhatsapp);
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
        // Vazio limpa (null); senão manda o digitado — o servidor normaliza para E.164.
        const r = await updateBusinessWhatsapp({ whatsapp: value.trim() === "" ? null : value });
        if (r.ok) {
          setValue(e164ToMask(r.whatsapp)); // reflete a forma canônica salva
          setSavedWhatsapp(r.whatsapp);
          setMessage(r.whatsapp ? "WhatsApp salvo." : "WhatsApp removido.");
        } else {
          setMessage("Informe um celular válido com DDD, ex.: (11) 99999-9999 (só celular/WhatsApp).");
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  // Remover explícito: "apagar o campo e salvar" não é descobrível. Chama a MESMA action com vazio
  // (a action já trata vazio -> null; nenhum backend novo). confirm() leve por ser dado destrutivo.
  function onRemove() {
    if (!confirm("Remover o WhatsApp do negócio?")) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await updateBusinessWhatsapp({ whatsapp: "" });
        if (r.ok) {
          setValue("");
          setSavedWhatsapp(null);
          setMessage("WhatsApp removido.");
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        WhatsApp do negócio
        <input
          type="tel"
          inputMode="numeric"
          className="rounded border border-neutral-300 p-2"
          placeholder="(11) 99999-9999"
          value={value}
          onChange={(event) => setValue(maskPhoneBR(event.target.value))}
        />
      </label>
      <p className="text-xs text-neutral-500">
        Exibido na sua página pública para que o cliente possa falar direto com você.
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
        {/* Só há o que remover quando existe WhatsApp salvo (deriva do estado persistido). */}
        {savedWhatsapp && (
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

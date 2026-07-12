"use client";

import { useRef, useState, useTransition } from "react";

import { updatePhone } from "@/server/actions/update-phone";

// Máscara BR à mão (sem lib, como o resto do projeto): só CONFORTO visual de digitação. A validação
// autoritativa mora no servidor (domain/phone + action); a máscara nunca é a validação.
function maskPhoneBR(value: string): string {
  let d = value.replace(/\D/g, "");
  // Tolera colar com +55: se passou de 11 dígitos e começa com 55, tira o código do país.
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11); // nacional: DDD (2) + 9 + 8
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** E.164 armazenado (+5511999999999) → máscara de exibição. O valor guardado é sempre canônico. */
function e164ToMask(phone: string | null): string {
  return maskPhoneBR((phone ?? "").replace(/^\+55/, ""));
}

export function ProfilePhoneForm({ initialPhone }: { initialPhone: string | null }) {
  const [value, setValue] = useState(e164ToMask(initialPhone));
  // Telefone efetivamente SALVO no banco (E.164 ou null), distinto do conteúdo do input. Governa a
  // visibilidade do "Remover": só há o que remover quando existe um telefone persistido.
  const [savedPhone, setSavedPhone] = useState<string | null>(initialPhone);
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
        const r = await updatePhone({ phone: value.trim() === "" ? null : value });
        if (r.ok) {
          setValue(e164ToMask(r.phone)); // reflete a forma canônica salva
          setSavedPhone(r.phone);
          setMessage(r.phone ? "WhatsApp salvo." : "WhatsApp removido.");
        } else {
          // Erro deixa claro que é CELULAR/WhatsApp — o helper recusa fixo por design.
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
    if (!confirm("Remover seu WhatsApp?")) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await updatePhone({ phone: "" });
        if (r.ok) {
          setValue("");
          setSavedPhone(null);
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
        WhatsApp
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
        Informe seu WhatsApp para que a barbearia possa confirmar ou avisar sobre mudanças no seu
        agendamento.
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
        {/* Só há o que remover quando existe telefone salvo (deriva do estado persistido). */}
        {savedPhone && (
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

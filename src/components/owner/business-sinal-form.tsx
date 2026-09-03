"use client";

import { useRef, useState, useTransition } from "react";

import { updateBusinessSinal } from "@/server/actions/update-business-sinal";

/**
 * Form de sinal + chave PIX do Business. Ação ÚNICA (um botão "Salvar" só) — os dois campos são
 * gravados juntos numa mesma chamada de updateBusinessSinal, mesma decisão de produto do núcleo
 * (src/server/owner/update-business-sinal.ts): configurar um sem o outro não faz sentido pro dono.
 * Mesmo padrão de estado/loading de BusinessWhatsappForm (sem businessId como prop — a action deriva
 * de requireOwner() no servidor).
 */
export function BusinessSinalForm({
  initialSinalPercentual,
  initialChavePix,
}: {
  initialSinalPercentual: number | null;
  initialChavePix: string | null;
}) {
  const [percentual, setPercentual] = useState(
    initialSinalPercentual !== null ? String(initialSinalPercentual) : "",
  );
  const [chavePix, setChavePix] = useState(initialChavePix ?? "");
  // Estado efetivamente SALVO no banco, distinto do conteúdo dos inputs. Governa a visibilidade do
  // "Remover": só há o que remover quando existe sinal OU chave persistidos.
  const [savedPercentual, setSavedPercentual] = useState<number | null>(initialSinalPercentual);
  const [savedChavePix, setSavedChavePix] = useState<string | null>(initialChavePix);
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
        // Vazio limpa (null); senão manda o número digitado — o servidor valida o intervalo [0,100].
        const parsedPercentual = percentual.trim() === "" ? null : Number(percentual);
        const r = await updateBusinessSinal({
          sinalPercentual: parsedPercentual,
          chavePix: chavePix.trim() === "" ? null : chavePix,
        });
        if (r.ok) {
          setPercentual(r.sinalPercentual !== null ? String(r.sinalPercentual) : "");
          setChavePix(r.chavePix ?? "");
          setSavedPercentual(r.sinalPercentual);
          setSavedChavePix(r.chavePix);
          setMessage(r.sinalPercentual !== null || r.chavePix ? "Sinal salvo." : "Sinal removido.");
        } else {
          setMessage("Informe um percentual inteiro entre 0 e 100.");
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  // Remover explícito: desliga o sinal por completo (percentual e chave juntos), mesma lógica do
  // botão "Remover" de BusinessWhatsappForm — chama a MESMA action com os dois campos vazios.
  function onRemove() {
    if (!confirm("Remover o sinal e a chave PIX do negócio?")) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await updateBusinessSinal({ sinalPercentual: null, chavePix: "" });
        if (r.ok) {
          setPercentual("");
          setChavePix("");
          setSavedPercentual(null);
          setSavedChavePix(null);
          setMessage("Sinal removido.");
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Sinal (% do serviço)
        <input
          type="number"
          min={0}
          max={100}
          className="rounded border border-neutral-300 p-2"
          placeholder="ex: 10"
          value={percentual}
          onChange={(event) => setPercentual(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Chave PIX
        <input
          type="text"
          className="rounded border border-neutral-300 p-2"
          placeholder="CPF, e-mail, telefone ou chave aleatória"
          value={chavePix}
          onChange={(event) => setChavePix(event.target.value)}
        />
      </label>
      <p className="text-xs text-neutral-500">
        Quando preenchido, o cliente vê o valor do sinal e paga por PIX ao agendar.
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
        {/* Só há o que remover quando existe sinal ou chave salvos (deriva do estado persistido). */}
        {(savedPercentual !== null || savedChavePix) && (
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

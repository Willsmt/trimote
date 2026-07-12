"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Chave do dismiss. Guardado em localStorage — NÃO em cookie: criar um cookie de "aceite" para um
// aviso que diz "usamos apenas cookies essenciais" contradiria o próprio aviso e a guarda LGPD do
// CLAUDE.md. Como o aviso é informativo (não opt-in), basta lembrar visualmente que já foi lido.
const DISMISS_KEY = "trimote:cookie-notice-dismissed";

/**
 * Faixa informativa de cookies (issue #36). O Trimote usa apenas cookies essenciais, então NÃO é um
 * banner de consentimento (sem "Aceitar/Recusar", sem cookie wall): é só um aviso claro, dispensável
 * com "Entendi". Não bloqueia o uso da página. Sem estado no banco, sem action.
 *
 * Renderiza `null` até o efeito confirmar, no cliente, que o aviso não foi dispensado — isso evita o
 * flash de mostrar a faixa e escondê-la em seguida (o localStorage não existe no SSR).
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) !== "1") {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-neutral-900 text-neutral-100">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong>Usamos apenas cookies essenciais.</strong> O Trimote utiliza somente cookies
          necessários para manter você conectado com segurança. Não usamos cookies de rastreamento,
          publicidade ou análise. Saiba mais na{" "}
          <Link href="/privacidade" className="text-emerald-400 underline">
            Política de Privacidade
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 self-start rounded bg-white px-4 py-1 font-medium text-neutral-900 sm:self-auto"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}

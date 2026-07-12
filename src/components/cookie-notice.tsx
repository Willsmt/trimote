"use client";

import { useEffect, useRef, useState } from "react";
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
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) !== "1") {
      setVisible(true);
    }
  }, []);

  // A faixa é `fixed` (fora do fluxo), então sobreporia o fim da tela — inclusive o rodapé e seu link
  // da Política, e os botões da base no mobile (BookingFlow, Concluir/Cancelar da agenda). Enquanto
  // visível, reserva no body um padding igual à altura da faixa, para que o conteúdo role acima dela.
  // Mede via ResizeObserver porque a altura muda com a quebra de linha entre breakpoints.
  useEffect(() => {
    if (!visible) return;
    const bar = barRef.current;
    if (!bar) return;
    const apply = () => {
      document.body.style.paddingBottom = `${bar.offsetHeight}px`;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      document.body.style.paddingBottom = "";
    };
  }, [visible]);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <div ref={barRef} className="fixed inset-x-0 bottom-0 z-50 bg-neutral-900 text-neutral-100">
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

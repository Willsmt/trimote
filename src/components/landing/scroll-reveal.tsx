"use client";

import { useEffect } from "react";

// Progressive enhancement do reveal ao rolar. Renderiza nada: no mount, observa todo [data-reveal]
// da landing e marca data-visto ao entrar na viewport (os acima da dobra entram de imediato). Sem JS,
// o <noscript> da page já mantém tudo visível; sob reduced-motion ou sem IntersectionObserver,
// revela tudo na hora. Escopo single-page — só a landing emite [data-reveal].
export function ScrollReveal() {
  useEffect(() => {
    const alvos = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (alvos.length === 0) return;

    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduz || !("IntersectionObserver" in window)) {
      alvos.forEach((el) => el.setAttribute("data-visto", ""));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.setAttribute("data-visto", "");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.16 },
    );
    alvos.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}

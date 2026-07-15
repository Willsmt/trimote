"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

// Saldo do dia que "sobe" na mock do hero (ease-out cubic até o alvo). SSR e no-JS mostram o valor
// final; sob reduced-motion também. A animação é puro adorno — o número correto sempre está no DOM.
const ALVO = 47.1;

function formata(v: number): string {
  return "R$ " + v.toFixed(2).replace(".", ",");
}

export function BalanceCounter() {
  const [valor, setValor] = useState(ALVO);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setValor(0);
    let ini: number | null = null;
    const inicio = window.setTimeout(() => {
      const passo = (ts: number) => {
        if (ini === null) ini = ts;
        const p = Math.min((ts - ini) / 1100, 1);
        setValor(ALVO * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf.current = requestAnimationFrame(passo);
      };
      raf.current = requestAnimationFrame(passo);
    }, 1150);

    return () => {
      window.clearTimeout(inicio);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return <span className={styles.num}>{formata(valor)}</span>;
}

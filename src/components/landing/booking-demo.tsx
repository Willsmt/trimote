"use client";

import { useState } from "react";
import styles from "./landing.module.css";

// Demo clicável de agendamento (só do lado do cliente, sem back-end): escolhe um horário, confirma e
// vê a confirmação. É ilustração da experiência — nada aqui grava agendamento real. Sem JS o painel
// SSR mostra a lista de horários estática (botões inertes), o que já comunica a ideia.
const HORARIOS = ["9:00", "10:30", "14:00", "16:30"];
const SERVICO = "Corte + barba";

export function BookingDemo() {
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<string | null>(null);

  if (confirmado) {
    return (
      <div className={styles.demoOk}>
        <div className={styles.ring} aria-hidden="true">
          ✓
        </div>
        <div className={styles.okTit}>Agendamento confirmado</div>
        <div className={styles.okSub}>
          {SERVICO} · hoje às {confirmado}
        </div>
        <button
          type="button"
          className={styles.reset}
          onClick={() => {
            setConfirmado(null);
            setEscolhido(null);
          }}
        >
          Agendar outro horário
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.negNome}>Barbearia do Léo</div>
      <div className={styles.negSub}>Vila Romana · seg a sáb, 9h às 19h</div>
      <div className={styles.servLista}>
        <div className={styles.serv}>
          <span>Corte + barba</span>
          <span className={styles.preco}>R$ 55</span>
        </div>
        <div className={styles.serv}>
          <span>Corte</span>
          <span className={styles.preco}>R$ 35</span>
        </div>
      </div>
      <div className={styles.horariosLabel}>Horários livres hoje</div>
      <div className={styles.horarios}>
        {HORARIOS.map((h) => (
          <button
            key={h}
            type="button"
            className={`${styles.chip} ${escolhido === h ? styles.chipAtivo : ""}`}
            aria-pressed={escolhido === h}
            onClick={() => setEscolhido(h)}
          >
            {h}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimario} ${styles.btnBloco}`}
        disabled={!escolhido}
        onClick={() => escolhido && setConfirmado(escolhido)}
      >
        {escolhido ? `Confirmar às ${escolhido}` : "Escolha um horário"}
      </button>
    </div>
  );
}

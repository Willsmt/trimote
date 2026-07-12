import styles from "@/components/landing/landing.module.css";

// Landing pública de venda (issue #38). Placeholder da Peça 1: só confirma que a rota / renderiza no
// grupo (marketing) — tema escuro, Fraunces disponível, SEM header/rodapé do app. As seções reais
// (hero, features, demo interativa, comparação, CTA) chegam nas Peças 2-3.
export default function LandingPage() {
  return (
    <main className={styles.placeholder}>
      <h1>Trimote</h1>
      <p>landing em construção</p>
    </main>
  );
}

import { fraunces } from "../fonts";
import styles from "@/components/landing/landing.module.css";

// Layout do grupo (marketing) — só a landing na rota /. Shell ESCURO fixo e a fonte Fraunces
// (self-hosted, exposta como variável CSS), disponível apenas neste subárvore: o resto do app não
// carrega Fraunces nem herda o tema escuro. Sem SiteHeader/SiteFooter (a landing tem nav própria);
// o CookieNotice global continua vindo do layout raiz.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${fraunces.variable} ${styles.root}`}>{children}</div>;
}

import { Inter, Fraunces } from "next/font/google";

// Fontes self-hosted pelo next/font (baixadas em build, servidas do próprio domínio). NUNCA via
// <link> do Google Fonts: uma requisição a fonts.gstatic.com em runtime contradiria o "Zero
// rastreamento" que a landing estampa e a guarda LGPD do projeto.

// Inter é a base global do app (aditiva — aplicada no <body> do layout raiz). Expõe também a
// variável CSS para quem precisar referenciá-la explicitamente.
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Fraunces é dos títulos/identidade (CONSTITUICAO-VISUAL.md: títulos de 24px+). Aplicada via
// variável CSS no layout de cada grupo que a usa — (marketing) via CSS Module da landing, (public)
// via public-page.module.css, (site) via classes utilitárias Tailwind (fontFamily.fraunces).
export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

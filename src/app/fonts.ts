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

// Fraunces é dos títulos/identidade e vive SÓ na landing (aplicada no layout do grupo (marketing)
// via variável CSS, consumida pelo CSS Module da landing). Não entra no resto do app.
export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

import { readFile } from "node:fs/promises";

import { ImageResponse } from "next/og";

// Imagem OG dinamica da landing (issue #40, Peca 3). Pela convencao de arquivo do Next, a mera
// existencia deste arquivo injeta og:image/twitter:image na landing — sem referencia manual no
// metadata (ver page.tsx). Renderiza o wordmark "trimote." (Fraunces 700, ponto ouro) sobre o fundo
// escuro da marca. Cores = tokens da constituicao visual (specs/landing/CONSTITUICAO-VISUAL.md):
// fundo #10161F, texto/linho #EEEDE8, ouro escuro #DFAC45 (1 ponto de ouro, dentro da regra).
//
// A fonte e o Fraunces Bold ESTATICO (OFL, ./_og/OFL.txt), carregado como buffer: satori (do
// next/og) nao le var(--font-fraunces) e nao fixa peso de fonte variavel de forma confiavel.
export const alt = "Trimote — agenda e caixa do seu negócio num lugar só";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  // fs.readFile (nao fetch): o Turbopack ainda nao implementa fetch() de asset via import.meta.url.
  // readFile resolve o arquivo relativo a este modulo em dev e no build.
  const fraunces = await readFile(new URL("./_og/Fraunces-Bold.ttf", import.meta.url));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#10161F",
          backgroundImage:
            "radial-gradient(900px 500px at 50% 42%, rgba(78,125,181,0.18), transparent 62%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Fraunces",
            fontWeight: 700,
            fontSize: 168,
            letterSpacing: "-0.02em",
            color: "#EEEDE8",
          }}
        >
          trimote<span style={{ color: "#DFAC45" }}>.</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Fraunces", data: fraunces, weight: 700, style: "normal" }],
    },
  );
}

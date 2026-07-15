import { ImageResponse } from "next/og";

// apple-icon 180x180 (issue #40). Monograma "T aparado" extraido de
// specs/landing/trimote-logo-conceitos.html, com o corte em GRADIENTE ouro (#E3B54F -> #C08A26):
// no tamanho grande o gradiente aparece; o favicon (icon.svg) usa o ouro chapado #D2A03A. Full-bleed
// e sem cantos arredondados (o iOS aplica a propria mascara). Cores = constituicao visual: tekhelet
// #2B4C7E, linho #F7F6F3, ouro. O SVG vai como <img> data-URI (satori rasteriza via resvg) — sem
// texto, entao nenhuma fonte e necessaria.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const monograma = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="ouro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E3B54F"/><stop offset="1" stop-color="#C08A26"/></linearGradient></defs><rect width="120" height="120" fill="#2B4C7E"/><path d="M 30 34 H 76 L 90 48 H 68 V 88 H 52 V 48 H 30 Z" fill="#F7F6F3"/><path d="M 76 34 L 90 48 L 90 34 Z" fill="url(#ouro)"/></svg>`;

export default function AppleIcon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(monograma).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width={180} height={180} src={src} alt="" />
      </div>
    ),
    { ...size },
  );
}

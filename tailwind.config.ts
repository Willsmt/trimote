import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fundo: "var(--fundo)",
        superficie: "var(--superficie)",
        "superficie-2": "var(--superficie-2)",
        texto: "var(--texto)",
        "texto-secundario": "var(--texto-secundario)",
        borda: "var(--borda)",
        primaria: "var(--primaria)",
        "primaria-hover": "var(--primaria-hover)",
        "primaria-pressed": "var(--primaria-pressed)",
        "primaria-suave": "var(--primaria-suave)",
        desabilitado: "var(--desabilitado-bg)",
        "desabilitado-texto": "var(--desabilitado-texto)",
        ouro: "var(--ouro)",
        "ouro-suave": "var(--ouro-suave)",
        "ouro-texto": "var(--ouro-texto)",
        carmesim: "var(--carmesim)",
        "carmesim-suave": "var(--carmesim-suave)",
        "carmesim-texto": "var(--carmesim-texto)",
        sucesso: "var(--sucesso)",
        "sucesso-suave": "var(--sucesso-suave)",
        "sucesso-texto": "var(--sucesso-texto)",
      },
      borderRadius: {
        input: "var(--raio-input)",
        botao: "var(--raio-botao)",
        card: "var(--raio-card)",
      },
      fontFamily: {
        fraunces: ["var(--font-fraunces)", "Georgia", "serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

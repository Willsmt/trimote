"use client";

import { useRef, useState } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";

/**
 * Card "Sua pagina de agendamento" no painel do dono (issue #15). Ilha client (padrao do
 * business-switcher). O `publicUrl` chega PRONTO do Server Component (montado com NEXTAUTH_URL +
 * slug do negocio ativo) — a env NAO e exposta ao client; a ilha so consome a string.
 *
 * QR exibido em SVG (nitido/impressao). Um QRCodeCanvas oculto (maior) serve so para exportar PNG
 * (canvas.toDataURL) — o dono baixa SO o QR limpo, sem o resto do painel. Copiar via
 * navigator.clipboard (sem storage). "Ver minha pagina" abre /b/[slug] em nova aba.
 */
export function PublicPageCard({ publicUrl }: { publicUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponivel (ex.: contexto nao seguro) — o link em texto continua selecionavel.
    }
  }

  function onDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "qrcode-agendamento.png";
    a.click();
  }

  const actionClass =
    "rounded border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-100";

  return (
    <section className="flex flex-col gap-3 rounded border border-neutral-300 p-4">
      <div>
        <h2 className="text-lg font-semibold">Sua página de agendamento</h2>
        <p className="text-sm text-neutral-500">
          Compartilhe o QR ou o link para os clientes agendarem.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <QRCodeSVG value={publicUrl} size={128} />
        {/* Canvas oculto (alta resolucao) usado apenas para exportar o PNG; o SVG acima e o exibido. */}
        <QRCodeCanvas value={publicUrl} size={512} ref={canvasRef} className="hidden" />

        <div className="flex min-w-0 flex-col gap-2">
          <code className="break-all text-sm text-neutral-700">{publicUrl}</code>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onCopy} className={actionClass}>
              {copied ? "Copiado!" : "Copiar link"}
            </button>
            <button type="button" onClick={onDownload} className={actionClass}>
              Baixar QR
            </button>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className={actionClass}>
              Ver minha página
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

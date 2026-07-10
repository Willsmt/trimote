import Link from "next/link";

/**
 * Checklist de setup do negocio recem-criado (issue #12). Server Component de LEITURA (padrao do
 * today-schedule): a completude e DERIVADA das contagens que a pagina ja busca — nenhum estado
 * persistido, o card some sozinho quando tudo esta configurado (a pagina so o renderiza incompleto).
 * Cada pendencia leva direto ao destino (acao no contexto, a um clique — principio de navegacao).
 */

interface ChecklistItem {
  done: boolean;
  label: string;
  href: string;
  cta: string;
}

export function SetupChecklist({
  activeServicesCount,
  openingHoursCount,
}: {
  activeServicesCount: number;
  openingHoursCount: number;
}) {
  const items: ChecklistItem[] = [
    {
      done: activeServicesCount > 0,
      label: "Cadastrar ao menos um serviço",
      href: "/owner/services",
      cta: "Cadastrar serviços",
    },
    {
      done: openingHoursCount > 0,
      label: "Definir o horário de funcionamento",
      href: "/owner/opening-hours",
      cta: "Definir horários",
    },
  ];

  return (
    <section className="flex flex-col gap-3 rounded border border-neutral-300 p-4">
      <div>
        <h2 className="text-lg font-semibold">Prepare sua agenda</h2>
        <p className="text-sm text-neutral-500">
          Falta pouco para seus clientes agendarem: complete os passos abaixo.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.href}
            className="flex items-center justify-between gap-3 rounded border border-neutral-300 p-3"
          >
            {/* Feito = check + texto esmaecido, SEM line-through (riscado lê como cancelado). */}
            <p className={`text-sm ${item.done ? "text-neutral-500" : "font-medium"}`}>
              <span aria-hidden="true" className={`mr-2 ${item.done ? "text-emerald-600" : ""}`}>
                {item.done ? "✓" : "○"}
              </span>
              {item.label}
            </p>
            {!item.done && (
              <Link
                href={item.href}
                className="whitespace-nowrap rounded border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-100"
              >
                {item.cta}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { TodayScheduleItem } from "@/server/booking/list-today-schedule";

/**
 * Agenda do dia do painel do dono (issue #13, parte c). Server Component de LEITURA — sem interacao
 * (nenhuma acao aqui; segue o principio de navegacao contextual/minimalista). Formata os horarios no
 * FUSO do negocio (recebido do core, que o deriva de requireOwner). Padrao visual de lista de horarios
 * convencional, reusando o design existente (cards `rounded border border-neutral-300 p-3`).
 */

function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

export function TodaySchedule({
  items,
  timeZone,
}: {
  items: TodayScheduleItem[];
  timeZone: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">Nenhum atendimento agendado para hoje.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between rounded border border-neutral-300 p-3"
        >
          <div>
            <p className="font-medium">
              {formatTime(item.startsAt, timeZone)}–{formatTime(item.endsAt, timeZone)} · {item.serviceName}
            </p>
            <p className="text-sm text-neutral-500">
              {item.clientName ?? item.clientEmail ?? "Cliente"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { setOpeningHours } from "@/server/actions/set-opening-hours";
import { closeDay } from "@/server/actions/close-day";

interface OpeningHoursItem {
  weekday: number;
  opensAtMinutes: number;
  closesAtMinutes: number;
}

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function OpeningHoursManager({ openingHours }: { openingHours: OpeningHoursItem[] }) {
  const router = useRouter();
  const byDay = new Map(openingHours.map((o) => [o.weekday, o]));
  const [drafts, setDrafts] = useState(() =>
    DAYS.map((_, weekday) => {
      const row = byDay.get(weekday);
      return {
        open: row ? toTime(row.opensAtMinutes) : "09:00",
        close: row ? toTime(row.closesAtMinutes) : "18:00",
      };
    }),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function updateDraft(weekday: number, field: "open" | "close", value: string) {
    setDrafts((prev) => prev.map((d, i) => (i === weekday ? { ...d, [field]: value } : d)));
  }

  async function onSave(weekday: number) {
    const draft = drafts[weekday];
    setPending(true);
    setMessage(null);
    const result = await setOpeningHours({
      weekday,
      opensAtMinutes: toMinutes(draft.open),
      closesAtMinutes: toMinutes(draft.close),
    });
    setPending(false);
    if (result.ok) {
      setMessage(`${DAYS[weekday]}: horário salvo.`);
      router.refresh();
    } else {
      setMessage(`${DAYS[weekday]}: o fechamento deve ser maior que a abertura.`);
    }
  }

  async function onClose(weekday: number) {
    setPending(true);
    setMessage(null);
    const result = await closeDay({ weekday });
    setPending(false);
    if (result.ok) {
      setMessage(`${DAYS[weekday]}: marcado como fechado.`);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {message && <p className="text-sm font-medium">{message}</p>}
      <ul className="flex flex-col gap-2">
        {DAYS.map((dayName, weekday) => {
          const isOpen = byDay.has(weekday);
          const draft = drafts[weekday];
          return (
            <li
              key={weekday}
              className="flex flex-wrap items-center gap-3 rounded border border-neutral-300 p-3"
            >
              <span className="w-24 font-medium">{dayName}</span>
              <span className="w-16 text-sm text-neutral-500">
                {isOpen ? "Aberto" : "Fechado"}
              </span>
              <input
                type="time"
                className="rounded border border-neutral-300 p-2"
                value={draft.open}
                onChange={(e) => updateDraft(weekday, "open", e.target.value)}
              />
              <span className="text-neutral-400">até</span>
              <input
                type="time"
                className="rounded border border-neutral-300 p-2"
                value={draft.close}
                onChange={(e) => updateDraft(weekday, "close", e.target.value)}
              />
              <button
                type="button"
                className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                onClick={() => onSave(weekday)}
                disabled={pending}
              >
                Salvar
              </button>
              {isOpen && (
                <button
                  type="button"
                  className="rounded border border-neutral-300 px-3 py-1 text-sm"
                  onClick={() => onClose(weekday)}
                  disabled={pending}
                >
                  Fechar dia
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

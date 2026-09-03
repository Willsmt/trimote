import { DateTime } from "luxon";

/**
 * Camada única de conversão de fuso (Princípio VII / FR-014).
 *
 * Regra do projeto: instantes são armazenados em UTC; todo cálculo de negócio
 * (disponibilidade, conflito, "passado") opera no fuso da barbearia (ex.: America/Sao_Paulo).
 * Nenhum outro módulo deve chamar a API de fuso diretamente — esta é a fronteira.
 *
 * Usamos Luxon pela API de timezone IANA explícita, que evita o uso implícito do fuso do
 * servidor (research.md D4).
 */

/**
 * Converte uma hora local (data + minutos desde a meia-noite) no fuso informado para o
 * instante UTC correspondente.
 */
export function localDateTimeToUtc(
  dateISO: string,
  minutesFromMidnight: number,
  timeZone: string,
): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  const dt = DateTime.fromObject(
    {
      year,
      month,
      day,
      hour: Math.floor(minutesFromMidnight / 60),
      minute: minutesFromMidnight % 60,
    },
    { zone: timeZone },
  );

  if (!dt.isValid) {
    throw new Error(`Data/hora local inválida: ${dateISO} ${minutesFromMidnight} ${timeZone}`);
  }

  return dt.toUTC().toJSDate();
}

/**
 * Retorna os minutos desde a meia-noite (hora local no fuso informado) de um instante UTC.
 */
export function utcToLocalMinutes(instant: Date, timeZone: string): number {
  const dt = DateTime.fromJSDate(instant, { zone: timeZone });
  return dt.hour * 60 + dt.minute;
}

/**
 * Retorna o dia da semana do instante no fuso informado, com 0 = domingo .. 6 = sábado
 * (mesma convenção do campo `weekday` de OpeningHours).
 */
export function weekdayInZone(instant: Date, timeZone: string): number {
  // Luxon usa 1=segunda .. 7=domingo; convertemos para 0=domingo .. 6=sábado.
  const luxonWeekday = DateTime.fromJSDate(instant, { zone: timeZone }).weekday;
  return luxonWeekday % 7;
}

/**
 * Retorna a data local (YYYY-MM-DD) de um instante no fuso informado.
 */
export function todayInZone(instant: Date, timeZone: string): string {
  return DateTime.fromJSDate(instant, { zone: timeZone }).toFormat("yyyy-MM-dd");
}

/** Granularidade de período do balancete (006-financial-reports). */
export type Granularity = "day" | "week" | "month" | "year";

// Luxon usa a mesma nomenclatura de unidade para startOf/plus (a semana é ISO — começa na segunda).
const GRANULARITY_UNIT: Record<Granularity, "days" | "weeks" | "months" | "years"> = {
  day: "days",
  week: "weeks",
  month: "months",
  year: "years",
};

/**
 * Limites `[startUtc, endUtc)` de um período (dia/semana/mês/ano) calculados NO FUSO da barbearia e
 * convertidos a UTC (006-financial-reports, FR-003). É a bucketização por range: o chamador filtra
 * `occurredAt >= startUtc AND occurredAt < endUtc` (range sobre a coluna nua — usa o índice; nunca
 * função sobre `occurredAt`). A semana é ISO (segunda-feira). O fim é obtido somando a unidade em
 * hora local (wall-clock) ANTES de voltar a UTC, ficando correto sob mudança de horário de verão.
 */
export function periodBoundsInZone(
  referenceLocalDate: string,
  granularity: Granularity,
  timeZone: string,
): { startUtc: Date; endUtc: Date } {
  const ref = DateTime.fromISO(referenceLocalDate, { zone: timeZone });
  if (!ref.isValid) {
    throw new Error(`Data de referência inválida: ${referenceLocalDate} ${timeZone}`);
  }
  const unit = GRANULARITY_UNIT[granularity];
  const start = ref.startOf(granularity);
  const end = start.plus({ [unit]: 1 });
  return { startUtc: start.toUTC().toJSDate(), endUtc: end.toUTC().toJSDate() };
}

/**
 * Desloca a data de referência de um período para o anterior (`dir = -1`) ou o próximo (`dir = 1`),
 * mantendo a granularidade (006-financial-reports, FR-002 — navegação). Aritmética de calendário
 * (sem conversão de fuso: a data local não depende do fuso). A semana desloca ±7 dias.
 */
export function shiftPeriod(
  referenceLocalDate: string,
  granularity: Granularity,
  dir: -1 | 1,
): string {
  const ref = DateTime.fromISO(referenceLocalDate, { zone: "utc" });
  if (!ref.isValid) {
    throw new Error(`Data de referência inválida: ${referenceLocalDate}`);
  }
  return ref.plus({ [GRANULARITY_UNIT[granularity]]: dir }).toFormat("yyyy-MM-dd");
}

const DIAS_ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatHoraDoDia(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

interface FaixaExpediente {
  inicio: number;
  fim: number;
  opensAtMinutes: number;
  closesAtMinutes: number;
}

/**
 * "Seg a Sex, 9h às 19h · Sáb, 9h às 13h" (página pública, #50): agrupa dias CONSECUTIVOS
 * (weekday 0=domingo..6=sábado) com o MESMO par de horário numa única faixa; faixas com horário
 * diferente ficam separadas por " · ". Negócio sem OpeningHours configurado → string vazia (nunca
 * "Fechado" — isso seria mentira, só significa que o dono não configurou nada ainda).
 */
export function formatOpeningHours(
  items: { weekday: number; opensAtMinutes: number; closesAtMinutes: number }[],
): string {
  if (items.length === 0) {
    return "";
  }

  const ordenado = [...items].sort((a, b) => a.weekday - b.weekday);

  const faixas: FaixaExpediente[] = [];
  for (const item of ordenado) {
    const ultima = faixas[faixas.length - 1];
    const encaixaNaUltima =
      ultima !== undefined &&
      item.weekday === ultima.fim + 1 &&
      item.opensAtMinutes === ultima.opensAtMinutes &&
      item.closesAtMinutes === ultima.closesAtMinutes;

    if (encaixaNaUltima) {
      ultima.fim = item.weekday;
    } else {
      faixas.push({
        inicio: item.weekday,
        fim: item.weekday,
        opensAtMinutes: item.opensAtMinutes,
        closesAtMinutes: item.closesAtMinutes,
      });
    }
  }

  return faixas
    .map((faixa) => {
      const dias =
        faixa.inicio === faixa.fim
          ? DIAS_ABREV[faixa.inicio]
          : `${DIAS_ABREV[faixa.inicio]} a ${DIAS_ABREV[faixa.fim]}`;
      return `${dias}, ${formatHoraDoDia(faixa.opensAtMinutes)} às ${formatHoraDoDia(faixa.closesAtMinutes)}`;
    })
    .join(" · ");
}

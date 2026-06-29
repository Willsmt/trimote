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

// Formatação pt-BR e datas de calendário no fuso da operação, sem depender do fuso do navegador.
import type { TicketFilters } from "./services/ticket-contracts";

const integerFormatter = new Intl.NumberFormat("pt-BR");
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
const clockFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  timeStyle: "medium",
});

export const formatCount = (count: number) => integerFormatter.format(count);
export const formatPercent = (percent: number | null) =>
  percent === null ? "—" : `${percentFormatter.format(percent)}%`;
export const formatInstant = (instant: string | number) =>
  dateTimeFormatter.format(new Date(instant));
export const formatClock = (instant: number) =>
  clockFormatter.format(new Date(instant));
export const formatCalendarDate = (date: string) =>
  date.split("-").reverse().join("/");
export const formatShortDate = (date: string) =>
  `${date.slice(8, 10)}/${date.slice(5, 7)}`;
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.round(seconds / 60);
  return `${formatCount(Math.floor(minutes / 60))}h ${String(minutes % 60).padStart(2, "0")}min`;
}

export function defaultTicketFilters(now = new Date()): TicketFilters {
  const calendarParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) =>
    calendarParts.find((calendarPart) => calendarPart.type === name)!.value;
  const lastDay = `${part("year")}-${part("month")}-${part("day")}`;
  // Subtrai dias no calendário, sem descontar 24 horas de um instante que pode atravessar horário de verão.
  const firstDay = new Date(`${lastDay}T12:00:00Z`);
  firstDay.setUTCDate(firstDay.getUTCDate() - 29);
  return {
    start_date: firstDay.toISOString().slice(0, 10),
    end_date: lastDay,
    status: "",
    type_id: "",
    priority: "",
    assignee_id: "",
  };
}

export function validateFilterDates(filters: TicketFilters): string | null {
  for (const date of [filters.start_date, filters.end_date]) {
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date.startsWith("0000") ||
      !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== date
    )
      return "Informe datas válidas para o início e o fim do período.";
  }
  return filters.start_date > filters.end_date
    ? "A data inicial deve ser anterior ou igual à data final."
    : null;
}

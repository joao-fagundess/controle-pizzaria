// Fórmulas dos indicadores da população criada no período, sem arredondar a apresentação.
export interface TicketCounts {
  total: number;
  open: number;
  in_progress: number;
  waiting: number;
  resolved: number;
  average_resolution_seconds: number | null;
}

export function summarizeTickets(counts: TicketCounts) {
  // Fechados já estão incluídos em resolved pela agregação; sem população a taxa não tem base.
  return { ...counts, resolution_rate: counts.total === 0 ? null : 100 * counts.resolved / counts.total };
}

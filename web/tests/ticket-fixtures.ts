// Respostas pequenas do domínio para exercitar estados da interface, sem substituir a API na aplicação.
import type {
  DashboardSummary,
  TicketPeriods,
  TicketStatuses,
  TicketRanking,
  TicketPage,
  TicketDetail,
} from "../src/services/ticket-contracts";

export const ticketId = "10000000-0000-4000-8000-000000000001";
export const typeId = "10000000-0000-4000-8000-000000000002";
export const technicianId = "10000000-0000-4000-8000-000000000003";
export const meta = {
  request_id: ticketId,
  generated_at: "2026-11-12T12:00:00.000Z",
  time_zone: "America/Sao_Paulo" as const,
  period_basis: "created_at" as const,
};
export const summaryFixture: DashboardSummary = {
  summary: {
    total: 3,
    open: 1,
    in_progress: 0,
    waiting: 0,
    resolved: 2,
    average_resolution_seconds: 14400,
    resolution_rate: (100 * 2) / 3,
  },
  meta: {
    ...meta,
    source_quality: {
      received: 0,
      rejected: 0,
      pending: 0,
      linked: 0,
      last_received_at: null,
      mode: "demo",
    },
  },
};
export const periodsFixture: TicketPeriods = {
  periods: [
    { period_start: "2026-11-11", tickets: 2 },
    { period_start: "2026-11-12", tickets: 0 },
  ],
  group_by: "day",
  meta: { ...meta, period_basis: "resolved_at" },
};
export const statusesFixture: TicketStatuses = {
  statuses: [
    { code: "open", name: "Aberto", tickets: 1 },
    { code: "in_progress", name: "Em andamento", tickets: 0 },
    { code: "waiting", name: "Em espera", tickets: 0 },
    { code: "resolved", name: "Resolvido", tickets: 1 },
    { code: "closed", name: "Fechado", tickets: 1 },
  ],
  meta,
};
export const rankingFixture: TicketRanking = {
  types: [{ id: typeId, code: "printing", name: "Impressão", tickets: 2 }],
  limit: 5,
  meta: { ...meta, period_basis: "resolved_at" },
};
export const optionsFixture = {
  options: {
    statuses: statusesFixture.statuses.map(({ code, name }) => ({
      code,
      name,
    })),
    types: [{ id: typeId, code: "printing", name: "Impressão", active: true }],
    priorities: [{ code: "normal", name: "Normal", severity: 2 }],
    assignees: [{ id: technicianId, name: "Camila Souza", active: true }],
  },
  meta,
};
export const pageFixture: TicketPage = {
  tickets: [
    {
      id: ticketId,
      title: "Impressora da recepção não imprime",
      description: "Falha após a troca do cabo de rede.",
      status: { code: "resolved", name: "Resolvido" },
      type: { id: typeId, code: "printing", name: "Impressão" },
      priority: { code: "normal", name: "Normal" },
      assignee: { id: technicianId, name: "Camila Souza" },
      requester: { id: ticketId, name: "Ana Ribeiro", department: "Recepção" },
      created_at: "2026-11-11T12:00:00.000Z",
      updated_at: "2026-11-11T16:00:00.000Z",
      resolved_at: "2026-11-11T16:00:00.000Z",
      source: { system: "demo", external_id: "ticket-1" },
      latest_technical_note: {
        id: ticketId,
        content: "Fila revisada e impressão validada.",
        created_at: "2026-11-11T16:00:00.000Z",
        author: null,
      },
    },
  ],
  pagination: { page: 1, page_size: 25, total: 3, total_pages: 1 },
  sort_by: "created_at",
  sort_order: "desc",
  meta,
};
export const detailFixture: TicketDetail = {
  ticket: pageFixture.tickets[0],
  technical_notes: [pageFixture.tickets[0].latest_technical_note!],
  history: [
    {
      id: ticketId,
      event_type: "status_changed",
      occurred_at: "2026-11-11T16:00:00.000Z",
      author: null,
      previous_value: "in_progress",
      new_value: "resolved",
    },
  ],
  meta: { ...meta, period_basis: null },
};

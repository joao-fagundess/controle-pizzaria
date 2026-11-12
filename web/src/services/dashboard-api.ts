// Acesso HTTP à API própria com cancelamento, timeout e validação do contrato recebido.
import { z } from "zod";
import {
  detailContract,
  optionsContract,
  periodsContract,
  rankingContract,
  statusesContract,
  summaryContract,
  ticketsContract,
  type GroupBy,
  type SortBy,
  type SortOrder,
  type TicketFilters,
} from "./ticket-contracts";

export class DashboardRequestError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

const errorContract = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(
  /\/$/,
  "",
);

async function requestTickets<Contract extends z.ZodType>(
  path: string,
  contract: Contract,
  parameters: Record<string, string | number>,
  signal: AbortSignal,
): Promise<z.infer<Contract>> {
  const query = new URLSearchParams();
  for (const [field, value] of Object.entries(parameters))
    if (value !== "") query.set(field, String(value));
  const timeout = AbortSignal.timeout(15_000);
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}${path}${query.size ? `?${query}` : ""}`,
      {
        signal: AbortSignal.any([signal, timeout]),
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      },
    );
  } catch (failure) {
    if (signal.aborted) throw failure;
    throw new DashboardRequestError(
      timeout.aborted
        ? "A consulta demorou mais que o esperado. Tente novamente."
        : "Não foi possível conectar ao serviço de chamados. Verifique a conexão e tente novamente.",
      timeout.aborted ? "TIMEOUT" : "NETWORK_ERROR",
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (failure) {
    if (signal.aborted) throw failure;
    if (timeout.aborted)
      throw new DashboardRequestError(
        "A consulta demorou mais que o esperado. Tente novamente.",
        "TIMEOUT",
      );
    throw new DashboardRequestError(
      response.ok
        ? "Não foi possível interpretar os dados recebidos. Tente novamente."
        : "O serviço de chamados está indisponível. Tente novamente.",
      response.ok ? "INVALID_RESPONSE" : "HTTP_ERROR",
    );
  }
  if (!response.ok) {
    const apiFailure = errorContract.safeParse(payload);
    throw new DashboardRequestError(
      response.status === 401
        ? "Acesso não autorizado. Entre em contato com o administrador."
        : apiFailure.success
          ? apiFailure.data.error.message
          : "Não foi possível concluir a consulta. Tente novamente.",
      apiFailure.success ? apiFailure.data.error.code : "HTTP_ERROR",
    );
  }
  const validatedTicketResponse = contract.safeParse(payload);
  if (!validatedTicketResponse.success)
    throw new DashboardRequestError(
      "Os dados recebidos estão incompletos ou em formato inválido. Tente novamente.",
      "INVALID_RESPONSE",
    );
  return validatedTicketResponse.data;
}

export const dashboardApi = {
  summary: (filters: TicketFilters, signal: AbortSignal) =>
    requestTickets(
      "/dashboard/summary",
      summaryContract,
      { ...filters },
      signal,
    ),
  periods: (filters: TicketFilters, groupBy: GroupBy, signal: AbortSignal) =>
    requestTickets(
      "/dashboard/tickets-by-period",
      periodsContract,
      { ...filters, group_by: groupBy },
      signal,
    ),
  statuses: (filters: TicketFilters, signal: AbortSignal) =>
    requestTickets(
      "/dashboard/status-distribution",
      statusesContract,
      { ...filters },
      signal,
    ),
  ranking: (filters: TicketFilters, signal: AbortSignal) =>
    requestTickets(
      "/dashboard/top-ticket-types",
      rankingContract,
      { ...filters, limit: 5 },
      signal,
    ),
  tickets: (
    filters: TicketFilters,
    page: number,
    pageSize: number,
    sortBy: SortBy,
    sortOrder: SortOrder,
    signal: AbortSignal,
  ) =>
    requestTickets(
      "/tickets",
      ticketsContract,
      {
        ...filters,
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_order: sortOrder,
      },
      signal,
    ),
  detail: (ticketId: string, signal: AbortSignal) =>
    requestTickets(
      `/tickets/${encodeURIComponent(ticketId)}`,
      detailContract,
      {},
      signal,
    ),
  options: (signal: AbortSignal) =>
    requestTickets("/filters/options", optionsContract, {}, signal),
};

// Consultas por seleção e atualização conjunta, sem manter dados de filtros antigos na tela.
import { useCallback, useEffect } from "react";
import {
  QueryClient,
  useIsFetching,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { dashboardApi } from "./services/dashboard-api";
import type {
  GroupBy,
  SortBy,
  SortOrder,
  TicketFilters,
} from "./services/ticket-contracts";

export const createDashboardQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        networkMode: "always",
        refetchOnWindowFocus: false,
        staleTime: 0,
        gcTime: 5 * 60_000,
      },
    },
  });

export function useDashboard(
  filters: TicketFilters,
  groupBy: GroupBy,
  page: number,
  pageSize: number,
  sortBy: SortBy,
  sortOrder: SortOrder,
) {
  const summary = useQuery({
    queryKey: ["dashboard", "summary", filters],
    queryFn: ({ signal }) => dashboardApi.summary(filters, signal),
  });
  const periods = useQuery({
    queryKey: ["dashboard", "periods", filters, groupBy],
    queryFn: ({ signal }) => dashboardApi.periods(filters, groupBy, signal),
  });
  const statuses = useQuery({
    queryKey: ["dashboard", "statuses", filters],
    queryFn: ({ signal }) => dashboardApi.statuses(filters, signal),
  });
  const ranking = useQuery({
    queryKey: ["dashboard", "ranking", filters],
    queryFn: ({ signal }) => dashboardApi.ranking(filters, signal),
  });
  const tickets = useQuery({
    queryKey: [
      "dashboard",
      "tickets",
      filters,
      page,
      pageSize,
      sortBy,
      sortOrder,
    ],
    queryFn: ({ signal }) =>
      dashboardApi.tickets(filters, page, pageSize, sortBy, sortOrder, signal),
  });
  const options = useQuery({
    queryKey: ["dashboard", "options"],
    queryFn: ({ signal }) => dashboardApi.options(signal),
    staleTime: 5 * 60_000,
  });
  const queryClient = useQueryClient();
  const busy =
    useIsFetching({
      predicate: (query) =>
        ["dashboard", "ticket"].includes(String(query.queryKey[0])),
    }) > 0;
  const refresh = useCallback(() => {
    // O teste usa o estado atual do cliente, inclusive antes de o React renderizar um novo ciclo.
    const activeQueries = {
      type: "active" as const,
      predicate: (query: { queryKey: readonly unknown[] }) =>
        ["dashboard", "ticket"].includes(String(query.queryKey[0])),
    };
    if (queryClient.isFetching(activeQueries)) return;
    void queryClient.refetchQueries(activeQueries, { cancelRefetch: false });
  }, [queryClient]);
  const sections = [summary, periods, statuses, ranking, tickets];
  const hasFailure = [...sections, options].some((section) => section.isError);
  const completeAt =
    sections.every((section) => section.isSuccess) && options.isSuccess
      ? Math.min(...sections.map((section) => section.dataUpdatedAt))
      : null;
  return {
    summary,
    periods,
    statuses,
    ranking,
    tickets,
    options,
    busy,
    refresh,
    hasFailure,
    completeAt,
  };
}

export function useDashboardPolling(
  seconds: number,
  busy: boolean,
  refresh: () => void,
) {
  useEffect(() => {
    if (seconds <= 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (!document.hidden && !busy)
        timer = setTimeout(refresh, seconds * 1000);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [seconds, busy, refresh]);
}

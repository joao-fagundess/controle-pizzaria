// Visão administrativa de chamados, com filtros aplicados, consultas independentes e atualização conjunta.
import { lazy, Suspense, useState } from "react";
import { FilterBar } from "./components/FilterBar";
import { MetricCards } from "./components/MetricCards";
import { TicketTable } from "./components/TicketTable";
import { QueryState } from "./components/QueryState";
import {
  defaultTicketFilters,
  formatClock,
  formatCount,
} from "./ticket-format";
import type {
  GroupBy,
  SortBy,
  SortOrder,
  TicketFilters,
} from "./services/ticket-contracts";
import { useDashboard, useDashboardPolling } from "./use-dashboard";

// Os gráficos e o detalhe são carregados sob demanda para reduzir o JavaScript inicial.
const PeriodChart = lazy(() =>
  import("./components/TicketCharts").then((charts) => ({
    default: charts.PeriodChart,
  })),
);
const StatusChart = lazy(() =>
  import("./components/TicketCharts").then((charts) => ({
    default: charts.StatusChart,
  })),
);
const TypeRanking = lazy(() =>
  import("./components/TicketCharts").then((charts) => ({
    default: charts.TypeRanking,
  })),
);
const TicketDetailDialog = lazy(() =>
  import("./components/TicketDetailDialog").then((detail) => ({
    default: detail.TicketDetailDialog,
  })),
);

function initialPollSeconds() {
  const configured = Number(import.meta.env.VITE_POLL_INTERVAL_SECONDS ?? 60);
  return Number.isInteger(configured) && configured >= 0 && configured <= 3600
    ? configured
    : 60;
}

export default function App() {
  const [filters, setFilters] = useState(defaultTicketFilters);
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [pollSeconds, setPollSeconds] = useState(initialPollSeconds);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const dashboard = useDashboard(
    filters,
    groupBy,
    page,
    pageSize,
    sortBy,
    sortOrder,
  );
  useDashboardPolling(pollSeconds, dashboard.busy, dashboard.refresh);
  const quality = dashboard.summary.data?.meta.source_quality;
  const excluded = quality ? quality.rejected + quality.pending : 0;
  const pollChoices = [...new Set([0, 30, 60, 120, 300, pollSeconds])].sort(
    (first, second) => first - second,
  );
  const applyFilters = (selection: TicketFilters) => {
    setFilters(selection);
    setPage(1);
    setSelectedTicket(null);
  };
  const sectionState = (
    query:
      | typeof dashboard.summary
      | typeof dashboard.periods
      | typeof dashboard.statuses
      | typeof dashboard.ranking
      | typeof dashboard.tickets,
  ) => ({
    pending: query.isPending,
    fetching: query.isFetching,
    error: query.error,
    hasContent: !!query.data,
    updatedAt: query.dataUpdatedAt,
    retry: () => {
      void query.refetch();
    },
  });

  return (
    <>
      <a className="skip-link" href="#overview">
        Ir para o conteúdo
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a
            href="#overview"
            className="brand"
            aria-label="Thindesk, visão geral"
          >
            <span className="brand-mark" aria-hidden="true">
              t
            </span>
            <span>
              thindesk
              <span className="brand-description">Painel administrativo</span>
            </span>
          </a>
          <nav aria-label="Navegação principal">
            <a className="nav-active" href="#overview">
              Visão geral
            </a>
            <a href="#tickets">Chamados</a>
          </nav>
          <span className="header-context">Suporte técnico</span>
        </div>
      </header>
      <main id="overview" className="dashboard-shell" tabIndex={-1}>
        <div className="page-heading">
          <div>
            <p className="eyebrow">Acompanhamento da operação</p>
            <h1>Chamados técnicos</h1>
            <p className="page-description">
              Indicadores, andamento e considerações da equipe.
            </p>
          </div>
          <div className="refresh-area">
            <button
              className="button button-primary refresh-button"
              type="button"
              onClick={dashboard.refresh}
              disabled={dashboard.busy}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M20 7v5h-5M4 17v-5h5" />
                <path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17" />
              </svg>
              {dashboard.busy ? "Atualizando…" : "Atualizar dados"}
            </button>
            <p
              className={`refresh-status${dashboard.hasFailure ? " refresh-error" : ""}`}
              role="status"
              aria-live="polite"
            >
              {dashboard.hasFailure
                ? "Atualização incompleta. Verifique as seções abaixo."
                : dashboard.busy
                  ? "Consultando chamados…"
                  : dashboard.completeAt
                    ? `Visão geral atualizada às ${formatClock(dashboard.completeAt)}`
                    : "Aguardando consulta."}
            </p>
          </div>
        </div>
        {quality?.mode === "demo" && (
          <div className="source-notice">
            <span className="notice-tag">Demonstração</span>
            <p>
              Os chamados exibidos são fictícios. A integração com o Thindesk
              real ainda requer homologação.
            </p>
          </div>
        )}
        {quality?.mode === "mixed" && (
          <div className="source-notice notice-warning">
            <strong>Base mista.</strong>
            <p>Esta consulta contém dados operacionais e de demonstração.</p>
          </div>
        )}
        {excluded > 0 && (
          <div className="source-notice notice-warning" role="note">
            <strong>
              {formatCount(excluded)}{" "}
              {excluded === 1
                ? "registro fora dos indicadores."
                : "registros fora dos indicadores."}
            </strong>
            <p>
              Dados recebidos do Thindesk estão incompletos ou aguardam
              validação.
              {quality?.last_received_at
                ? " O recebimento local não comprova atualização completa da origem."
                : ""}
            </p>
          </div>
        )}
        <FilterBar
          filters={filters}
          options={dashboard.options.data?.options}
          optionsLoading={dashboard.options.isPending}
          optionsError={dashboard.options.error}
          retryOptions={() => void dashboard.options.refetch()}
          onApply={applyFilters}
        />
        <section className="metrics-section" aria-labelledby="metrics-title">
          <div className="section-heading">
            <h2 id="metrics-title">Indicadores gerais</h2>
            <p>Por data de criação</p>
          </div>
          <QueryState {...sectionState(dashboard.summary)}>
            {dashboard.summary.data && (
              <MetricCards summary={dashboard.summary.data.summary} />
            )}
            {dashboard.summary.data?.summary.total === 0 && (
              <p className="empty-summary">
                Nenhum chamado criado no período selecionado. As conclusões usam
                a data de resolução.
              </p>
            )}
          </QueryState>
        </section>
        <Suspense
          fallback={
            <div className="panel section-message" role="status">
              Preparando os gráficos…
            </div>
          }
        >
          <div className="analytics-grid">
            <section
              className="panel period-panel"
              aria-labelledby="period-title"
            >
              <div className="panel-heading chart-heading">
                <div>
                  <h2 id="period-title">Chamados atendidos</h2>
                  <p className="panel-description">
                    Concluídos por data de resolução
                  </p>
                </div>
                <div
                  className="segmented-control"
                  role="group"
                  aria-label="Agrupamento dos atendimentos"
                >
                  {(
                    [
                      ["day", "Dia"],
                      ["week", "Semana"],
                      ["month", "Mês"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={groupBy === value}
                      onClick={() => setGroupBy(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {filters.status &&
                !["resolved", "closed"].includes(filters.status) && (
                  <p className="chart-hint">
                    O status selecionado não representa chamados concluídos.
                  </p>
                )}
              <QueryState
                {...sectionState(dashboard.periods)}
                empty={dashboard.periods.data?.periods.every(
                  (period) => period.tickets === 0,
                )}
                emptyMessage="Nenhum chamado concluído no intervalo selecionado."
              >
                {dashboard.periods.data && (
                  <PeriodChart
                    periods={dashboard.periods.data.periods}
                    groupBy={groupBy}
                  />
                )}
              </QueryState>
            </section>
            <section
              className="panel status-panel"
              aria-labelledby="status-title"
            >
              <div className="panel-heading">
                <div>
                  <h2 id="status-title">Situação dos chamados</h2>
                  <p className="panel-description">
                    Status atual · criados no período
                  </p>
                </div>
              </div>
              <QueryState
                {...sectionState(dashboard.statuses)}
                empty={dashboard.statuses.data?.statuses.every(
                  (status) => status.tickets === 0,
                )}
                emptyMessage="Nenhum chamado criado no período selecionado."
              >
                {dashboard.statuses.data && (
                  <StatusChart statuses={dashboard.statuses.data.statuses} />
                )}
              </QueryState>
            </section>
            <section
              className="panel ranking-panel"
              aria-labelledby="ranking-title"
            >
              <div className="panel-heading">
                <div>
                  <h2 id="ranking-title">Tipos mais atendidos</h2>
                  <p className="panel-description">
                    Por data de resolução · top 5
                  </p>
                </div>
              </div>
              <QueryState
                {...sectionState(dashboard.ranking)}
                empty={!dashboard.ranking.data?.types.length}
                emptyMessage="Nenhum tipo com chamados concluídos no intervalo."
              >
                {dashboard.ranking.data && (
                  <TypeRanking types={dashboard.ranking.data.types} />
                )}
              </QueryState>
            </section>
          </div>
        </Suspense>
        <section
          id="tickets"
          className="panel tickets-panel"
          aria-labelledby="tickets-title"
        >
          <div className="panel-heading">
            <div>
              <h2 id="tickets-title">Chamados e considerações técnicas</h2>
              <p className="panel-description">
                Selecione um chamado para consultar o detalhe e o histórico.
              </p>
            </div>
            {dashboard.tickets.data && (
              <span className="count-badge">
                {formatCount(dashboard.tickets.data.pagination.total)}{" "}
                {dashboard.tickets.data.pagination.total === 1
                  ? "chamado"
                  : "chamados"}
              </span>
            )}
          </div>
          <QueryState {...sectionState(dashboard.tickets)}>
            {dashboard.tickets.data && (
              <TicketTable
                ticketPage={dashboard.tickets.data}
                sortBy={sortBy}
                sortOrder={sortOrder}
                busy={dashboard.tickets.isFetching}
                onSort={(field, order) => {
                  setSortBy(field);
                  setSortOrder(order);
                  setPage(1);
                }}
                onPage={setPage}
                onPageSize={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                onOpen={setSelectedTicket}
              />
            )}
          </QueryState>
        </section>
        <footer className="dashboard-footer">
          <p>
            Datas e horários de São Paulo <span>·</span> Atualização automática
            pausada em aba oculta.
          </p>
          <label>
            Atualização automática
            <select
              value={pollSeconds}
              onChange={(event) => setPollSeconds(Number(event.target.value))}
            >
              {pollChoices.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds === 0
                    ? "Desativada"
                    : seconds < 60
                      ? `A cada ${seconds} segundos`
                      : seconds % 60 === 0
                        ? `A cada ${seconds / 60} ${seconds === 60 ? "minuto" : "minutos"}`
                        : `A cada ${seconds} segundos`}
                </option>
              ))}
            </select>
          </label>
        </footer>
      </main>
      <Suspense
        fallback={
          <p className="section-message" role="status">
            Abrindo detalhe do chamado…
          </p>
        }
      >
        {selectedTicket && (
          <TicketDetailDialog
            ticketId={selectedTicket}
            options={dashboard.options.data?.options}
            onClose={() => setSelectedTicket(null)}
          />
        )}
      </Suspense>
    </>
  );
}

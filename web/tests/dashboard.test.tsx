// Componentes e consultas sob filtros, falhas parciais e respostas fora de ordem.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { dashboardApi } from "../src/services/dashboard-api";
import { createDashboardQueryClient } from "../src/use-dashboard";
import { defaultTicketFilters } from "../src/ticket-format";
import {
  summaryFixture,
  periodsFixture,
  statusesFixture,
  rankingFixture,
  optionsFixture,
  pageFixture,
  detailFixture,
  typeId,
  technicianId,
  ticketId,
  meta,
} from "./ticket-fixtures";

const clients: ReturnType<typeof createDashboardQueryClient>[] = [];
beforeEach(() => {
  vi.spyOn(dashboardApi, "summary").mockResolvedValue(
    structuredClone(summaryFixture),
  );
  vi.spyOn(dashboardApi, "periods").mockResolvedValue(
    structuredClone(periodsFixture),
  );
  vi.spyOn(dashboardApi, "statuses").mockResolvedValue(
    structuredClone(statusesFixture),
  );
  vi.spyOn(dashboardApi, "ranking").mockResolvedValue(
    structuredClone(rankingFixture),
  );
  vi.spyOn(dashboardApi, "tickets").mockResolvedValue(
    structuredClone(pageFixture),
  );
  vi.spyOn(dashboardApi, "options").mockResolvedValue(
    structuredClone(optionsFixture),
  );
  vi.spyOn(dashboardApi, "detail").mockResolvedValue(
    structuredClone(detailFixture),
  );
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

function renderDashboard() {
  const client = createDashboardQueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}
async function ready() {
  await screen.findByRole("button", {
    name: "Impressora da recepção não imprime",
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Atualizar dados" }),
    ).toBeEnabled(),
  );
}
function totalCard() {
  return screen.getByText("Total de chamados").parentElement!;
}

describe("proveniência e completude", () => {
  it("coleções não fornecidas não são apresentadas como ausência confirmada", async () => {
    const page = structuredClone(pageFixture), detail = structuredClone(detailFixture);
    page.tickets[0].provenance = { contract_version: "1.0", exported_at: meta.generated_at, title_is_derived: false, history_coverage: "unavailable", technical_notes_coverage: "unavailable" };
    page.tickets[0].latest_technical_note = null;
    detail.ticket = page.tickets[0]; detail.technical_notes = []; detail.history = [];
    vi.mocked(dashboardApi.tickets).mockResolvedValue(page); vi.mocked(dashboardApi.detail).mockResolvedValue(detail);
    renderDashboard(); await ready();
    expect(screen.getByText("Não fornecido pela origem")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: detail.ticket.title }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getAllByText("Não fornecido pela origem.")).toHaveLength(2));
    expect(within(dialog).queryByText("Sem considerações técnicas.")).not.toBeInTheDocument();
  });
  it("expõe coleções parciais e título derivado junto dos dados recebidos", async () => {
    const page = structuredClone(pageFixture), detail = structuredClone(detailFixture);
    page.tickets[0].provenance = { contract_version: "1.0", exported_at: meta.generated_at, title_is_derived: true, history_coverage: "partial", technical_notes_coverage: "partial" };
    detail.ticket = page.tickets[0];
    vi.mocked(dashboardApi.tickets).mockResolvedValue(page); vi.mocked(dashboardApi.detail).mockResolvedValue(detail);
    renderDashboard(); await ready(); expect(screen.getByText("Título derivado da descrição")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: detail.ticket.title }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/Considerações parciais:/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Histórico parcial:/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Título derivado da descrição fornecida/)).toBeInTheDocument();
  });
  it("lista vazia completa confirma ausência; resposta antiga sem metadados mantém desconhecimento", async () => {
    const detail = structuredClone(detailFixture); detail.technical_notes = []; detail.ticket.latest_technical_note = null;
    vi.mocked(dashboardApi.detail).mockResolvedValue(detail);
    renderDashboard(); await ready(); await userEvent.click(screen.getByRole("button", { name: detail.ticket.title }));
    expect(await screen.findByText("Sem considerações técnicas.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fechar detalhe do chamado" }));
    delete detail.ticket.provenance;
    vi.mocked(dashboardApi.detail).mockResolvedValue(detail);
    // Outra identidade invalida o cache do detalhe anterior e simula uma API antiga.
    const page = structuredClone(pageFixture); page.tickets[0].id = "10000000-0000-4000-8000-000000000009";
    vi.mocked(dashboardApi.tickets).mockResolvedValue(page);
    await userEvent.click(screen.getByRole("button", { name: "Atualizar dados" }));
    await waitFor(() => expect(dashboardApi.tickets).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: detail.ticket.title }));
    expect(await within(screen.getByRole("dialog")).findByText("Não fornecido pela origem.")).toBeInTheDocument();
  });
});

describe("consulta e apresentação", () => {
  it("exibe os seis indicadores, bases temporais e aviso de demonstração", async () => {
    renderDashboard();
    await ready();
    expect(totalCard()).toHaveTextContent("3");
    expect(screen.getByText("66,7%")).toBeInTheDocument();
    expect(screen.getByText("4h 00min")).toBeInTheDocument();
    expect(screen.getByText("Inclui chamados fechados")).toBeInTheDocument();
    expect(
      await screen.findByText("Concluídos por data de resolução"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Os chamados exibidos são fictícios/),
    ).toBeInTheDocument();
    // O ranking chega no chunk de gráficos; a instrumentação pode atrasar a importação inicial.
    const ranking = await screen.findByRole(
      "region",
      { name: "Tipos mais atendidos" },
      { timeout: 5_000 },
    );
    expect(within(ranking).getByText("Impressão")).toBeInTheDocument();
    expect(within(ranking).getByText("2")).toBeInTheDocument();
  });

  it("aplica os seis filtros em conjunto e mantém o rascunho sem consultar antes de aplicar", async () => {
    renderDashboard();
    await ready();
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText("Status", { exact: true }),
      "resolved",
    );
    await user.selectOptions(screen.getByLabelText("Tipo de chamado"), typeId);
    await user.selectOptions(
      screen.getByLabelText("Prioridade", { exact: true }),
      "normal",
    );
    await user.selectOptions(
      screen.getByLabelText("Responsável", { exact: true }),
      technicianId,
    );
    expect(dashboardApi.summary).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Alterações não aplicadas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() =>
      expect(dashboardApi.summary).toHaveBeenCalledWith(
        {
          ...defaultTicketFilters(),
          status: "resolved",
          type_id: typeId,
          priority: "normal",
          assignee_id: technicianId,
        },
        expect.any(AbortSignal),
      ),
    );
    expect(dashboardApi.tickets).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "resolved" }),
      1,
      25,
      "created_at",
      "desc",
      expect.any(AbortSignal),
    );
  });

  it("impede intervalo invertido e limpar restaura os últimos trinta dias", async () => {
    renderDashboard();
    await ready();
    const user = userEvent.setup();
    // O seletor nativo entrega a data inteira em ISO; o jsdom não implementa seu teclado segmentado.
    fireEvent.change(screen.getByLabelText("Data inicial"), {
      target: { value: "2027-01-01" },
    });
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A data inicial deve ser anterior",
    );
    expect(dashboardApi.summary).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByLabelText("Data inicial")).toHaveValue(
      defaultTicketFilters().start_date,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mudar agrupamento refaz somente a série temporal", async () => {
    renderDashboard();
    await ready();
    await userEvent.click(
      await screen.findByRole("button", { name: "Semana" }),
    );
    await waitFor(() =>
      expect(dashboardApi.periods).toHaveBeenLastCalledWith(
        defaultTicketFilters(),
        "week",
        expect.any(AbortSignal),
      ),
    );
    expect(dashboardApi.summary).toHaveBeenCalledTimes(1);
    expect(dashboardApi.tickets).toHaveBeenCalledTimes(1);
  });

  it("paginação e ordenação refazem somente a listagem", async () => {
    vi.mocked(dashboardApi.tickets).mockResolvedValue({
      ...structuredClone(pageFixture),
      pagination: { page: 1, page_size: 25, total: 30, total_pages: 2 },
    });
    renderDashboard();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() =>
      expect(dashboardApi.tickets).toHaveBeenLastCalledWith(
        expect.anything(),
        2,
        25,
        "created_at",
        "desc",
        expect.any(AbortSignal),
      ),
    );
    await user.selectOptions(screen.getByLabelText("Ordenar por"), "priority");
    await waitFor(() =>
      expect(dashboardApi.tickets).toHaveBeenLastCalledWith(
        expect.anything(),
        1,
        25,
        "priority",
        "desc",
        expect.any(AbortSignal),
      ),
    );
    expect(dashboardApi.summary).toHaveBeenCalledTimes(1);
  });

  it("abre detalhe com considerações e histórico e devolve o foco ao fechar", async () => {
    renderDashboard();
    await ready();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", {
      name: "Impressora da recepção não imprime",
    });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText("Falha após a troca do cabo de rede."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Status: Em andamento → Resolvido"),
    ).toBeInTheDocument();
    expect(dashboardApi.detail).toHaveBeenCalledWith(
      ticketId,
      expect.any(AbortSignal),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Fechar detalhe do chamado" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("estados de atualização", () => {
  it("mostra carregamento inicial sem apresentar indicadores antigos e impede refresh sobreposto", async () => {
    let finish!: (summary: typeof summaryFixture) => void;
    vi.mocked(dashboardApi.summary).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderDashboard();
    expect(
      within(
        screen.getByRole("region", { name: "Indicadores gerais" }),
      ).getByRole("status"),
    ).toHaveTextContent("Carregando dados");
    expect(screen.queryByText("Total de chamados")).not.toBeInTheDocument();
    const refresh = screen.getByRole("button", { name: "Atualizando…" });
    expect(refresh).toBeDisabled();
    await userEvent.dblClick(refresh);
    expect(dashboardApi.summary).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(structuredClone(summaryFixture));
    });
    await ready();
    expect(totalCard()).toHaveTextContent("3");
  });

  it("permite recuperar opções de filtros sem descartar os indicadores válidos", async () => {
    vi.mocked(dashboardApi.options).mockRejectedValueOnce(
      new Error("Catálogo indisponível."),
    );
    renderDashboard();
    await ready();
    expect(screen.getByLabelText("Tipo de chamado")).toBeDisabled();
    expect(totalCard()).toHaveTextContent("3");
    expect(
      screen.getByText("Não foi possível atualizar as opções dos filtros."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Tipo de chamado")).toBeEnabled(),
    );
    expect(dashboardApi.summary).toHaveBeenCalledTimes(1);
  });

  it("mantém as outras seções em falha inicial e permite tentar novamente", async () => {
    vi.mocked(dashboardApi.periods).mockRejectedValueOnce(
      new Error("Consulta indisponível."),
    );
    renderDashboard();
    await ready();
    expect(
      await screen.findByText("Consulta indisponível."),
    ).toBeInTheDocument();
    expect(totalCard()).toHaveTextContent("3");
    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Consulta indisponível."),
      ).not.toBeInTheDocument(),
    );
    expect(dashboardApi.summary).toHaveBeenCalledTimes(1);
  });

  it("falha de refresh preserva a seção válida, informa a idade e não anuncia atualização completa", async () => {
    renderDashboard();
    await ready();
    vi.mocked(dashboardApi.summary).mockRejectedValueOnce(
      new Error("Servidor indisponível."),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Atualizar dados" }),
    );
    expect(
      await screen.findByText("Servidor indisponível."),
    ).toBeInTheDocument();
    expect(totalCard()).toHaveTextContent("3");
    expect(
      screen.getByText(/Exibindo a última consulta válida/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Atualização incompleta/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/Atualização incompleta/),
      ).not.toBeInTheDocument(),
    );
  });

  it("apresenta estados vazios e métricas sem base como travessão", async () => {
    vi.mocked(dashboardApi.summary).mockResolvedValue({
      ...structuredClone(summaryFixture),
      summary: {
        total: 0,
        open: 0,
        in_progress: 0,
        waiting: 0,
        resolved: 0,
        average_resolution_seconds: null,
        resolution_rate: null,
      },
    });
    vi.mocked(dashboardApi.tickets).mockResolvedValue({
      ...structuredClone(pageFixture),
      tickets: [],
      pagination: { page: 1, page_size: 25, total: 0, total_pages: 0 },
    });
    vi.mocked(dashboardApi.periods).mockResolvedValue({
      ...structuredClone(periodsFixture),
      periods: [],
    });
    vi.mocked(dashboardApi.ranking).mockResolvedValue({
      ...structuredClone(rankingFixture),
      types: [],
    });
    vi.mocked(dashboardApi.statuses).mockResolvedValue({
      ...structuredClone(statusesFixture),
      statuses: statusesFixture.statuses.map((status) => ({
        ...status,
        tickets: 0,
      })),
    });
    renderDashboard();
    expect(
      await screen.findByText("Nenhum chamado nesta página."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(
      await screen.findByText(
        "Nenhum chamado concluído no intervalo selecionado.",
      ),
    ).toBeInTheDocument();
  });

  it("mostra registros da origem excluídos dos indicadores", async () => {
    const summary = structuredClone(summaryFixture);
    summary.meta.source_quality.rejected = 2;
    summary.meta.source_quality.pending = 1;
    vi.mocked(dashboardApi.summary).mockResolvedValue(summary);
    renderDashboard();
    await ready();
    expect(
      screen.getByText("3 registros fora dos indicadores."),
    ).toBeInTheDocument();
  });

  it("uma resposta atrasada de filtros antigos não substitui a seleção atual", async () => {
    let resolveOld!: (summary: typeof summaryFixture) => void;
    let resolveCurrent!: (summary: typeof summaryFixture) => void;
    const oldResponse = new Promise<typeof summaryFixture>((resolve) => {
      resolveOld = resolve;
    });
    const currentResponse = new Promise<typeof summaryFixture>((resolve) => {
      resolveCurrent = resolve;
    });
    vi.mocked(dashboardApi.summary).mockImplementation((filters) =>
      filters.status === "open"
        ? oldResponse
        : filters.status === "resolved"
          ? currentResponse
          : Promise.resolve(structuredClone(summaryFixture)),
    );
    renderDashboard();
    await ready();
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText("Status", { exact: true }),
      "open",
    );
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    expect(screen.queryByText("Total de chamados")).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Status", { exact: true }),
      "resolved",
    );
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await act(async () => {
      resolveCurrent({
        ...structuredClone(summaryFixture),
        summary: { ...summaryFixture.summary, total: 1 },
      });
    });
    await waitFor(() => expect(totalCard()).toHaveTextContent("1"));
    await act(async () => {
      resolveOld({
        ...structuredClone(summaryFixture),
        summary: { ...summaryFixture.summary, total: 99 },
      });
    });
    expect(totalCard()).toHaveTextContent("1");
    expect(totalCard()).not.toHaveTextContent("99");
  });
});

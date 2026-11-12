// Confere a borda HTTP do frontend: parâmetros, contrato, falhas e cancelamento.
import { expect, it, vi } from "vitest";
import { dashboardApi } from "../src/services/dashboard-api";
import {
  defaultTicketFilters,
  formatDuration,
  formatPercent,
  validateFilterDates,
} from "../src/ticket-format";
import { summaryFixture } from "./ticket-fixtures";

it("envia os filtros preenchidos e valida a resposta do resumo", async () => {
  const fetchRequest = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(summaryFixture)));
  vi.stubGlobal("fetch", fetchRequest);
  const summary = await dashboardApi.summary(
    {
      ...defaultTicketFilters(new Date("2026-11-12T15:00:00Z")),
      status: "resolved",
    },
    new AbortController().signal,
  );
  const url = new URL(fetchRequest.mock.calls[0][0], "http://localhost");
  expect(url.searchParams.get("start_date")).toBe("2026-10-14");
  expect(url.searchParams.get("status")).toBe("resolved");
  expect(url.searchParams.has("type_id")).toBe(false);
  expect(summary.summary.total).toBe(3);
});

it("rejeita payload incompleto mesmo com HTTP 200", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  await expect(
    dashboardApi.summary(defaultTicketFilters(), new AbortController().signal),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

it("traduz erro de rede, erro HTTP e sessão não autorizada", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
  await expect(
    dashboardApi.summary(defaultTicketFilters(), new AbortController().signal),
  ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "INTERNAL_ERROR",
            message: "Consulta indisponível.",
          },
        }),
        { status: 500 },
      ),
    ),
  );
  await expect(
    dashboardApi.summary(defaultTicketFilters(), new AbortController().signal),
  ).rejects.toThrow("Consulta indisponível.");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 502 })),
  );
  await expect(
    dashboardApi.summary(defaultTicketFilters(), new AbortController().signal),
  ).rejects.toMatchObject({
    code: "HTTP_ERROR",
    message: "O serviço de chamados está indisponível. Tente novamente.",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticação necessária.",
          },
        }),
        { status: 401 },
      ),
    ),
  );
  await expect(
    dashboardApi.summary(defaultTicketFilters(), new AbortController().signal),
  ).rejects.toThrow(/Acesso não autorizado/);
});

it("preserva o cancelamento ao substituir a seleção", async () => {
  const controller = new AbortController();
  controller.abort();
  const cancellation = new DOMException("Cancelada", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cancellation));
  await expect(
    dashboardApi.summary(defaultTicketFilters(), controller.signal),
  ).rejects.toBe(cancellation);
});

it("distingue timeout de cancelamento por troca de filtros", async () => {
  const timeout = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener("abort", () =>
            reject(new DOMException("Tempo excedido", "AbortError")),
          );
        }),
    ),
  );
  const consultation = dashboardApi.summary(
    defaultTicketFilters(),
    new AbortController().signal,
  );
  timeout.abort();
  await expect(consultation).rejects.toMatchObject({ code: "TIMEOUT" });
});

it("formata durações, percentual e valida datas sem depender do fuso local", () => {
  expect(formatDuration(3599)).toBe("1h 00min");
  expect(formatDuration(null)).toBe("—");
  expect(formatPercent((100 * 2) / 3)).toBe("66,7%");
  const beforeMidnight = defaultTicketFilters(new Date("2026-11-12T02:00:00Z"));
  expect(beforeMidnight.end_date).toBe("2026-11-11");
  expect(
    validateFilterDates({ ...beforeMidnight, start_date: "2026-02-30" }),
  ).toMatch(/datas válidas/);
});

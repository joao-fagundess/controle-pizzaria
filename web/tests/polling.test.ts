// Relógio da atualização: pausa em aba oculta, desativação e ausência de ciclos sobrepostos.
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useDashboardPolling } from "../src/use-dashboard";

it("aguarda o intervalo e só agenda outro ciclo depois que as consultas terminam", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const refresh = vi.fn();
  const { rerender } = renderHook(
    ({ busy }) => useDashboardPolling(60, busy, refresh),
    { initialProps: { busy: false } },
  );
  act(() => {
    vi.advanceTimersByTime(59_999);
  });
  expect(refresh).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  rerender({ busy: true });
  act(() => {
    vi.advanceTimersByTime(180_000);
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  rerender({ busy: false });
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("cancela o relógio ao ocultar a aba e retoma quando ela fica visível", () => {
  vi.useFakeTimers();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const refresh = vi.fn();
  renderHook(() => useDashboardPolling(30, false, refresh));
  hidden.mockReturnValue(true);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(120_000);
  });
  expect(refresh).not.toHaveBeenCalled();
  hidden.mockReturnValue(false);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(30_000);
  });
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("não agenda consultas quando a atualização automática está desativada", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const refresh = vi.fn();
  renderHook(() => useDashboardPolling(0, false, refresh));
  act(() => {
    vi.advanceTimersByTime(600_000);
  });
  expect(refresh).not.toHaveBeenCalled();
});

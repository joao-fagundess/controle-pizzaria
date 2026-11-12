// Adapta apenas recursos de layout ausentes no jsdom; a validação visual usa o navegador real.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

class TestResizeObserver implements ResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: { width: 600, height: 240 },
        } as ResizeObserverEntry,
      ],
      this,
    );
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", TestResizeObserver);
Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value() {
    this.setAttribute("open", "");
    this.querySelector("button")?.focus();
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value() {
    this.removeAttribute("open");
  },
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
});

// Proxy local mantém a credencial técnica no servidor e o navegador na mesma origem.
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const apiProxy = {
    target: environment.API_PROXY_TARGET || "http://127.0.0.1:3000",
    changeOrigin: true,
    ...(environment.API_ACCESS_TOKEN
      ? { headers: { Authorization: `Bearer ${environment.API_ACCESS_TOKEN}` } }
      : {}),
  };
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true, proxy: { "/api": apiProxy } },
    preview: { port: 4173, strictPort: true, proxy: { "/api": apiProxy } },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./tests/setup.ts"],
      include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
      fileParallelism: false,
      testTimeout: 20_000,
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        reporter: ["text-summary", "json-summary", "json", "html", "lcov"],
        reportsDirectory: "../docs/evidencias/testes/web-coverage",
        reportOnFailure: true,
      },
    },
  };
});

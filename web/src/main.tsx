// Inicializa o React e o cliente de consultas sem persistir chamados ou credenciais no navegador.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { createDashboardQueryClient } from "./use-dashboard";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={createDashboardQueryClient()}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

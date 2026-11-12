// Indicadores calculados pela API; a interface apenas formata os valores e explica sua base.
import type { DashboardSummary } from "../services/ticket-contracts";
import { formatCount, formatDuration, formatPercent } from "../ticket-format";

export function MetricCards({
  summary,
}: {
  summary: DashboardSummary["summary"];
}) {
  const metrics = [
    {
      label: "Total de chamados",
      value: formatCount(summary.total),
      note: "Criados no período",
      accent: true,
    },
    {
      label: "Chamados abertos",
      value: formatCount(summary.open),
      note: "Aguardando atendimento",
    },
    {
      label: "Em andamento",
      value: formatCount(summary.in_progress),
      note: "Atendimento em curso",
    },
    {
      label: "Resolvidos",
      value: formatCount(summary.resolved),
      note: "Inclui chamados fechados",
    },
    {
      label: "Tempo médio de atendimento",
      value: formatDuration(summary.average_resolution_seconds),
      note: "Horas corridas até a resolução",
      duration: true,
    },
    {
      label: "Taxa de resolução",
      value: formatPercent(summary.resolution_rate),
      note: "Resolvidos ÷ total do período",
    },
  ];
  return (
    <dl className="metrics-grid">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className={`metric-card${metric.accent ? " metric-primary" : ""}${metric.duration ? " metric-duration" : ""}`}
        >
          <dt>{metric.label}</dt>
          <dd>
            {metric.value}
            <span>{metric.note}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

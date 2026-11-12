// Gráficos da API com dados textuais equivalentes para leitura sem depender de cor ou SVG.
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  GroupBy,
  TicketPeriods,
  TicketRanking,
  TicketStatuses,
} from "../services/ticket-contracts";
import {
  formatCalendarDate,
  formatCount,
  formatShortDate,
} from "../ticket-format";

export const statusColors: Record<string, string> = {
  open: "#3474a3",
  in_progress: "#ab740d",
  waiting: "#8c96a3",
  resolved: "#0f766e",
  closed: "#5b6863",
};

export function PeriodChart({
  periods,
  groupBy,
}: {
  periods: TicketPeriods["periods"];
  groupBy: GroupBy;
}) {
  const total = periods.reduce((sum, period) => sum + period.tickets, 0);
  const label = (date: string) =>
    groupBy === "month"
      ? `${date.slice(5, 7)}/${date.slice(2, 4)}`
      : formatShortDate(date);
  return (
    <>
      <div className="chart-total">
        <strong>{formatCount(total)}</strong>
        <span>
          {total === 1 ? "concluído no intervalo" : "concluídos no intervalo"}
        </span>
      </div>
      <div
        className="period-chart"
        role="img"
        aria-label={`Chamados concluídos: ${formatCount(total)} no intervalo. Valores disponíveis na tabela abaixo.`}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={periods}
            margin={{ top: 15, right: 12, bottom: 2, left: -26 }}
            accessibilityLayer={false}
          >
            <CartesianGrid
              vertical={false}
              stroke="#e8ecef"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="period_start"
              tickFormatter={label}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tick={{ fontSize: 12, fill: "#677482" }}
              dy={8}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "#677482" }}
            />
            <Tooltip
              labelFormatter={(date) => formatCalendarDate(String(date))}
              formatter={(value) => [
                formatCount(Number(value ?? 0)),
                "Concluídos",
              ]}
              contentStyle={{
                border: "1px solid #dbe1e5",
                borderRadius: 6,
                fontSize: 13,
                boxShadow: "none",
              }}
            />
            <Line
              type="linear"
              dataKey="tickets"
              stroke="#0f766e"
              strokeWidth={2.4}
              dot={
                periods.length <= 15
                  ? { r: 3, fill: "#fff", strokeWidth: 2 }
                  : false
              }
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-values">
        <summary>Ver valores do gráfico</summary>
        <div className="small-table-scroll">
          <table>
            <caption className="sr-only">
              Conclusões por{" "}
              {groupBy === "day"
                ? "dia"
                : groupBy === "week"
                  ? "semana"
                  : "mês"}
            </caption>
            <thead>
              <tr>
                <th>Início do período</th>
                <th>Concluídos</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.period_start}>
                  <td>{formatCalendarDate(period.period_start)}</td>
                  <td>{formatCount(period.tickets)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function StatusChart({
  statuses,
}: {
  statuses: TicketStatuses["statuses"];
}) {
  const total = statuses.reduce((sum, status) => sum + status.tickets, 0);
  return (
    <div className="status-chart-layout">
      <div className="donut-wrap" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart accessibilityLayer={false}>
            <Pie
              data={statuses.filter((status) => status.tickets > 0)}
              dataKey="tickets"
              nameKey="name"
              innerRadius="72%"
              outerRadius="94%"
              paddingAngle={total > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {statuses
                .filter((status) => status.tickets > 0)
                .map((status) => (
                  <Cell
                    key={status.code}
                    fill={statusColors[status.code] || "#8c96a3"}
                  />
                ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-label">
          <strong>{formatCount(total)}</strong>
          <span>{total === 1 ? "chamado" : "chamados"}</span>
        </div>
      </div>
      <dl className="status-legend">
        {statuses.map((status) => (
          <div key={status.code}>
            <dt>
              <span
                className="legend-dot"
                style={{ background: statusColors[status.code] || "#8c96a3" }}
              />
              {status.name}
            </dt>
            <dd>{formatCount(status.tickets)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function TypeRanking({ types }: { types: TicketRanking["types"] }) {
  const maximum = Math.max(...types.map((type) => type.tickets), 1);
  return (
    <ol className="type-ranking">
      {types.map((type, index) => (
        <li key={type.id}>
          <span className="ranking-position">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="ranking-type">
            <div>
              <span>{type.name}</span>
              <strong>{formatCount(type.tickets)}</strong>
            </div>
            <div className="ranking-track" aria-hidden="true">
              <span style={{ width: `${(100 * type.tickets) / maximum}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

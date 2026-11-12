// Formulário mantém edições locais até aplicar; limpar restaura o período padrão e consulta novamente.
import { useState } from "react";
import type {
  FilterOptions,
  TicketFilters,
} from "../services/ticket-contracts";
import {
  defaultTicketFilters,
  formatCalendarDate,
  validateFilterDates,
} from "../ticket-format";

interface FilterBarProps {
  filters: TicketFilters;
  options?: FilterOptions;
  optionsLoading: boolean;
  optionsError: Error | null;
  retryOptions: () => void;
  onApply: (filters: TicketFilters) => void;
}

export function FilterBar({
  filters,
  options,
  optionsLoading,
  optionsError,
  retryOptions,
  onApply,
}: FilterBarProps) {
  const [draft, setDraft] = useState(filters);
  const [dateError, setDateError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(filters);
  const change = (field: keyof TicketFilters, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setDateError(null);
  };
  return (
    <section className="panel filters-panel" aria-labelledby="filters-title">
      <div className="panel-heading">
        <h2 id="filters-title">Filtros de consulta</h2>
        {dirty && (
          <span className="muted-text pending-edit">
            Alterações não aplicadas
          </span>
        )}
      </div>
      {optionsError && (
        <div className="error-message" role="alert">
          <p>Não foi possível atualizar as opções dos filtros.</p>
          <button
            className="button button-outline button-small"
            type="button"
            onClick={retryOptions}
          >
            Tentar novamente
          </button>
        </div>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const validation = validateFilterDates(draft);
          setDateError(validation);
          if (!validation) onApply({ ...draft });
        }}
      >
        <div className="filter-grid">
          <label>
            Data inicial
            <input
              type="date"
              required
              value={draft.start_date}
              onChange={(event) => change("start_date", event.target.value)}
              aria-invalid={!!dateError}
              aria-describedby={dateError ? "filter-date-error" : undefined}
            />
          </label>
          <label>
            Data final
            <input
              type="date"
              required
              value={draft.end_date}
              onChange={(event) => change("end_date", event.target.value)}
              aria-invalid={!!dateError}
              aria-describedby={dateError ? "filter-date-error" : undefined}
            />
          </label>
          <label>
            Status
            <select
              value={draft.status}
              disabled={!options}
              onChange={(event) => change("status", event.target.value)}
            >
              <option value="">Todos os status</option>
              {options?.statuses.map((status) => (
                <option key={status.code} value={status.code}>
                  {status.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de chamado
            <select
              value={draft.type_id}
              disabled={!options}
              onChange={(event) => change("type_id", event.target.value)}
            >
              <option value="">Todos os tipos</option>
              {options?.types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                  {!type.active ? " (inativo)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prioridade
            <select
              value={draft.priority}
              disabled={!options}
              onChange={(event) => change("priority", event.target.value)}
            >
              <option value="">Todas as prioridades</option>
              {options?.priorities.map((priority) => (
                <option key={priority.code} value={priority.code}>
                  {priority.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsável
            <select
              value={draft.assignee_id}
              disabled={!options}
              onChange={(event) => change("assignee_id", event.target.value)}
            >
              <option value="">Todos os responsáveis</option>
              {options?.assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                  {!assignee.active ? " (inativo)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        {dateError && (
          <p className="field-error" id="filter-date-error" role="alert">
            {dateError}
          </p>
        )}
        <div className="filter-actions">
          <p className="muted-text">
            Período aplicado:{" "}
            <strong>
              {formatCalendarDate(filters.start_date)} a{" "}
              {formatCalendarDate(filters.end_date)}
            </strong>
            {optionsLoading && <span> · Carregando opções…</span>}
          </p>
          <div className="button-group">
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                const defaults = defaultTicketFilters();
                setDraft(defaults);
                setDateError(null);
                onApply(defaults);
              }}
            >
              Limpar filtros
            </button>
            <button className="button button-primary" type="submit">
              Aplicar filtros
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

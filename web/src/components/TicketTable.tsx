// Tabela de consulta com ordenação e paginação remotas, sem recomputar os indicadores locais.
import type {
  SortBy,
  SortOrder,
  TicketPage,
} from "../services/ticket-contracts";
import { formatCount, formatInstant } from "../ticket-format";

export function StatusBadge({ code, name }: { code: string; name: string }) {
  return (
    <span className={`status-badge status-${code}`}>
      <span aria-hidden="true" />
      {name}
    </span>
  );
}

interface TicketTableProps {
  ticketPage: TicketPage;
  sortBy: SortBy;
  sortOrder: SortOrder;
  busy: boolean;
  onSort: (sortBy: SortBy, sortOrder: SortOrder) => void;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
  onOpen: (ticketId: string) => void;
}

export function TicketTable({
  ticketPage,
  sortBy,
  sortOrder,
  busy,
  onSort,
  onPage,
  onPageSize,
  onOpen,
}: TicketTableProps) {
  const { tickets, pagination } = ticketPage;
  const from = tickets.length
    ? (pagination.page - 1) * pagination.page_size + 1
    : 0;
  const to = tickets.length ? from + tickets.length - 1 : 0;
  return (
    <>
      <div className="table-tools">
        <p className="muted-text">
          Criados no período · última consideração disponível
        </p>
        <div>
          <label>
            Ordenar por
            <select
              value={sortBy}
              onChange={(event) =>
                onSort(event.target.value as SortBy, sortOrder)
              }
            >
              <option value="created_at">Data de criação</option>
              <option value="updated_at">Última atualização</option>
              <option value="resolved_at">Data de resolução</option>
              <option value="priority">Prioridade</option>
            </select>
          </label>
          <button
            className="button button-outline sort-direction"
            type="button"
            onClick={() =>
              onSort(sortBy, sortOrder === "desc" ? "asc" : "desc")
            }
            aria-label={`Alterar para ordem ${sortOrder === "desc" ? "crescente" : "decrescente"}`}
          >
            {sortOrder === "desc" ? "↓ Decrescente" : "↑ Crescente"}
          </button>
        </div>
      </div>
      {tickets.length ? (
        <div
          className="ticket-table-scroll"
          role="region"
          aria-label="Tabela de chamados com rolagem"
          tabIndex={0}
        >
          <table className="ticket-table">
            <caption className="sr-only">
              Chamados técnicos e última consideração
            </caption>
            <thead>
              <tr>
                <th>Chamado</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Responsável</th>
                <th>Criação</th>
                <th>Última consideração técnica</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <button
                      className="ticket-link"
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.focus();
                        onOpen(ticket.id);
                      }}
                    >
                      {ticket.title}
                    </button>
                    {ticket.provenance?.title_is_derived && <small className="ticket-subline">Título derivado da descrição</small>}
                    <span className="ticket-subline">
                      <span className="ticket-id">
                        #{ticket.id.slice(0, 8).toUpperCase()}
                      </span>{" "}
                      · {ticket.type.name}
                    </span>
                  </td>
                  <td>
                    <StatusBadge {...ticket.status} />
                  </td>
                  <td>
                    <span
                      className={`priority-label priority-${ticket.priority.code}`}
                    >
                      {ticket.priority.name}
                    </span>
                  </td>
                  <td className="assignee-cell">
                    {ticket.assignee?.name || (
                      <span className="muted-text">Não atribuído</span>
                    )}
                  </td>
                  <td className="date-cell">
                    {formatInstant(ticket.created_at)}
                  </td>
                  <td>
                    <p className="note-preview">
                      {ticket.latest_technical_note?.content || (
                        <span className="muted-text">
                          {ticket.provenance?.technical_notes_coverage === "complete" ? "Sem considerações técnicas" : "Não fornecido pela origem"}
                        </span>
                      )}
                    </p>
                    {ticket.provenance?.technical_notes_coverage === "partial" && <small className="muted-text">Considerações parciais</small>}
                    {ticket.latest_technical_note && (
                      <small className="note-author">
                        {ticket.latest_technical_note.author?.name ||
                          "Autor não informado"}
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="section-message">
          Nenhum chamado nesta página.
          {pagination.total > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={() => onPage(1)}
            >
              Voltar à primeira página
            </button>
          )}
        </div>
      )}
      <div className="pagination">
        <p>
          {formatCount(from)}–{formatCount(to)} de{" "}
          <strong>{formatCount(pagination.total)}</strong>{" "}
          {pagination.total === 1 ? "chamado" : "chamados"}
        </p>
        <div className="pagination-controls">
          <label>
            Por página
            <select
              value={pagination.page_size}
              onChange={(event) => onPageSize(Number(event.target.value))}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-outline button-small"
            type="button"
            onClick={() => onPage(pagination.page - 1)}
            disabled={busy || pagination.page <= 1}
          >
            Anterior
          </button>
          <span>
            Página {formatCount(pagination.page)} de{" "}
            {formatCount(Math.max(1, pagination.total_pages))}
          </span>
          <button
            className="button button-outline button-small"
            type="button"
            onClick={() => onPage(pagination.page + 1)}
            disabled={busy || pagination.page >= pagination.total_pages}
          >
            Próxima
          </button>
        </div>
      </div>
    </>
  );
}

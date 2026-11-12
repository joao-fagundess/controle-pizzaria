// Detalhe acessível do chamado, com foco contido pelo diálogo nativo e consulta cancelável.
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../services/dashboard-api";
import type { FilterOptions } from "../services/ticket-contracts";
import { formatInstant } from "../ticket-format";
import { QueryState } from "./QueryState";
import { StatusBadge } from "./TicketTable";

function describeEvent(
  eventType: string,
  previous: unknown,
  next: unknown,
  options?: FilterOptions,
): string {
  const findName = (
    value: unknown,
    catalog: { code?: string; id?: string; name: string }[] = [],
  ) =>
    typeof value === "string"
      ? catalog.find((entry) => entry.code === value || entry.id === value)
          ?.name
      : undefined;
  if (eventType === "created") return "Chamado registrado";
  const catalogs = {
    status_changed: { title: "Status", entries: options?.statuses },
    assignee_changed: { title: "Responsável", entries: options?.assignees },
    type_changed: { title: "Tipo", entries: options?.types },
    priority_changed: { title: "Prioridade", entries: options?.priorities },
  };
  const catalog = catalogs[eventType as keyof typeof catalogs];
  if (!catalog) return "Movimentação registrada";
  const previousName = findName(previous, catalog.entries);
  const nextName = findName(next, catalog.entries);
  return previousName && nextName
    ? `${catalog.title}: ${previousName} → ${nextName}`
    : `${catalog.title} atualizado`;
}

export function TicketDetailDialog({
  ticketId,
  onClose,
  options,
}: {
  ticketId: string;
  onClose: () => void;
  options?: FilterOptions;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const detail = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: ({ signal }) => dashboardApi.detail(ticketId, signal),
  });
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const nativeDialog = dialog.current;
    if (!nativeDialog?.open) nativeDialog?.showModal();
    return () => {
      // Fecha a modalidade antes de focar o acionador: enquanto aberto, o fundo está inerte.
      if (nativeDialog?.open) nativeDialog.close();
      if (trigger?.isConnected) trigger.focus();
      else document.getElementById("overview")?.focus();
    };
  }, []);
  const ticket = detail.data?.ticket;
  return (
    <dialog
      ref={dialog}
      className="ticket-dialog"
      aria-labelledby="ticket-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Detalhe do chamado</p>
            <h2 id="ticket-detail-title">
              {ticket?.title || "Consultando chamado"}
            </h2>
          </div>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Fechar detalhe do chamado"
          >
            ×
          </button>
        </header>
        <div className="dialog-scroll">
          <QueryState
            pending={detail.isPending}
            fetching={detail.isFetching}
            error={detail.error}
            hasContent={!!detail.data}
            updatedAt={detail.dataUpdatedAt}
            retry={() => void detail.refetch()}
          >
            {ticket && (
              <>
                <div className="detail-status">
                  <StatusBadge {...ticket.status} />
                  <span
                    className={`priority-label priority-${ticket.priority.code}`}
                  >
                    Prioridade {ticket.priority.name.toLowerCase()}
                  </span>
                </div>
                <p className="detail-description">{ticket.description}</p>
                <dl className="detail-fields">
                  <div>
                    <dt>Tipo de chamado</dt>
                    <dd>{ticket.type.name}</dd>
                  </div>
                  <div>
                    <dt>Responsável</dt>
                    <dd>{ticket.assignee?.name || "Não atribuído"}</dd>
                  </div>
                  <div>
                    <dt>Solicitante</dt>
                    <dd>{ticket.requester.name}</dd>
                  </div>
                  <div>
                    <dt>Setor</dt>
                    <dd>{ticket.requester.department || "Não informado"}</dd>
                  </div>
                  <div>
                    <dt>Criação</dt>
                    <dd>{formatInstant(ticket.created_at)}</dd>
                  </div>
                  <div>
                    <dt>Última atualização</dt>
                    <dd>{formatInstant(ticket.updated_at)}</dd>
                  </div>
                  <div>
                    <dt>Resolução vigente</dt>
                    <dd>
                      {ticket.resolved_at
                        ? formatInstant(ticket.resolved_at)
                        : "Não resolvido"}
                    </dd>
                  </div>
                </dl>
                <section className="detail-section">
                  <h3>
                    Considerações técnicas{" "}
                    <span>{detail.data!.technical_notes.length}</span>
                  </h3>
                  {detail.data!.technical_notes.length ? (
                    <ol className="technical-notes">
                      {detail.data!.technical_notes.map((note) => (
                        <li key={note.id}>
                          <div>
                            <strong>
                              {note.author?.name || "Autor não informado"}
                            </strong>
                            <time dateTime={note.created_at}>
                              {formatInstant(note.created_at)}
                            </time>
                          </div>
                          <p>{note.content}</p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted-text">Sem considerações técnicas.</p>
                  )}
                </section>
                <section className="detail-section">
                  <h3>Histórico de movimentações</h3>
                  {detail.data!.history.length ? (
                    <ol className="ticket-history">
                      {detail.data!.history.map((event) => (
                        <li key={event.id}>
                          <span className="history-dot" aria-hidden="true" />
                          <div>
                            <strong>
                              {describeEvent(
                                event.event_type,
                                event.previous_value,
                                event.new_value,
                                options,
                              )}
                            </strong>
                            <p>
                              {event.author?.name || "Autor não informado"} ·{" "}
                              <time dateTime={event.occurred_at}>
                                {formatInstant(event.occurred_at)}
                              </time>
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted-text">
                      Nenhuma movimentação disponível.
                    </p>
                  )}
                </section>
                <p className="detail-id">Identificador: {ticket.id}</p>
              </>
            )}
          </QueryState>
        </div>
      </div>
    </dialog>
  );
}

// Estados de cada seção: preserva somente conteúdo da seleção atual e informa atualização parcial.
import type { ReactNode } from "react";
import { formatInstant } from "../ticket-format";

interface QueryStateProps {
  pending: boolean;
  fetching: boolean;
  error: Error | null;
  hasContent: boolean;
  updatedAt: number;
  retry: () => void;
  empty?: boolean;
  emptyMessage?: string;
  children?: ReactNode;
}

export function QueryState({
  pending,
  fetching,
  error,
  hasContent,
  updatedAt,
  retry,
  empty,
  emptyMessage,
  children,
}: QueryStateProps) {
  if ((pending || fetching) && !hasContent)
    return (
      <div className="section-message loading-message" role="status">
        Carregando dados…
      </div>
    );
  return (
    <>
      {error && (
        <div className="error-message" role="alert">
          <div>
            <strong>Não foi possível atualizar esta seção.</strong>
            <p>{error.message}</p>
            {hasContent && (
              <small>
                Mostrando os dados de {formatInstant(updatedAt)}.
              </small>
            )}
          </div>
          <button
            type="button"
            className="button button-outline button-small"
            onClick={retry}
            disabled={fetching}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {fetching && hasContent && (
        <p className="section-updating">Atualizando dados…</p>
      )}
      {hasContent &&
        (empty ? (
          <div className="section-message">
            {emptyMessage || "Nenhum registro para os filtros selecionados."}
          </div>
        ) : (
          children
        ))}
    </>
  );
}

// Contrato mínimo de consulta compartilhado pelo pool PostgreSQL e pelos testes embarcados.
import type { QueryResultRow } from 'pg';

export interface TicketDatabase {
  query<Row extends QueryResultRow = QueryResultRow>(sql: string, parameters?: unknown[]): Promise<{ rows: Row[] }>;
}

export function isoTimestamp(timestamp: Date | string | null): string | null {
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

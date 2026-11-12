// PostgreSQL em memória exclusivo de demonstração e testes, com o mesmo contrato SQL do pool.
import type { QueryResultRow } from 'pg';
import type { TicketDatabase } from './database.js';

export async function createEmbeddedDatabase() {
  const { PGlite } = await import('@electric-sql/pglite');
  const postgres = new PGlite();
  const database: TicketDatabase = {
    async query<Row extends QueryResultRow>(sql: string, parameters?: unknown[]) {
      if (parameters) return postgres.query<Row>(sql, parameters);
      // exec aceita múltiplas instruções; a tipagem do retorno é a da consulta chamadora.
      const statements = await postgres.exec(sql);
      return { rows: (statements.at(-1)?.rows ?? []) as Row[] };
    },
  };
  return { database, close: () => postgres.close() };
}

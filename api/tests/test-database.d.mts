// Contrato do banco isolado, compartilhado pelas suítes do Node e do Vitest.
import type { TicketDatabase } from '../src/database.js';
export function createTestDatabase(): Promise<{ database: TicketDatabase; close(): Promise<void> }>;

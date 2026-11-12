// Contrato dos comandos de banco usados também nos testes e na demonstração local.
import type { TicketDatabase } from '../src/database.js';
export function applyMigrations(connection: TicketDatabase): Promise<string[]>;
export function seedTickets(connection: TicketDatabase, referenceDate?: string): Promise<void>;

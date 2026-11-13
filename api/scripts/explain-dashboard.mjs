// Registra planos de consultas reais com 10 mil chamados sintéticos em banco descartável.
// Tempos de PostgreSQL embarcado não substituem benchmark de servidor ou medição de p95.
import { writeFile } from 'node:fs/promises';
import { applyMigrations, seedTickets } from './database.mjs';
import { createEmbeddedDatabase } from '../dist/embedded-database.js';
import { TicketRepository } from '../dist/ticket-repository.js';
import { parseTicketQuery } from '../dist/ticket-filters.js';

const embedded = await createEmbeddedDatabase();
try {
  await applyMigrations(embedded.database);
  await seedTickets(embedded.database, '2026-11-11');
  await embedded.database.query(`WITH blueprints AS (
    SELECT tickets.*, row_number() OVER (ORDER BY id)::int AS blueprint_number FROM tickets WHERE source_system = 'demo'
  ) INSERT INTO tickets (id, title, description, status_code, type_id, priority_code, assignee_id, requester_id,
      created_at, updated_at, resolved_at, source_system, external_id)
    SELECT md5('explain-ticket-' || ticket_number)::uuid, title, description, status_code, type_id,
      priority_code, assignee_id, requester_id, created_at - ((ticket_number / 480)::int * interval '1 day'),
      updated_at - ((ticket_number / 480)::int * interval '1 day'),
      resolved_at - ((ticket_number / 480)::int * interval '1 day'), 'benchmark', ticket_number::text
    FROM generate_series(1, 9520) ticket_number JOIN blueprints ON blueprint_number = 1 + ticket_number % 480`);
  await embedded.database.query('ANALYZE');
  const capturedQueries = [];
  const ticketRepository = new TicketRepository({ async query(sql, parameters) {
    capturedQueries.push({ sql, parameters });
    return embedded.database.query(sql, parameters);
  } });
  const commonFilters = { start_date: '2026-10-12', end_date: '2026-11-11', status: 'resolved' };
  await ticketRepository.summary(commonFilters);
  await ticketRepository.listTickets(parseTicketQuery(commonFilters, 'tickets'));
  await ticketRepository.ticketsByPeriod(parseTicketQuery({ ...commonFilters, group_by: 'day' }, 'periods'));
  await ticketRepository.topTicketTypes(parseTicketQuery({ ...commonFilters, limit: '5' }, 'ranking'));
  const queryNames = ['summary', 'tickets', 'tickets_by_period', 'top_ticket_types'];
  const plans = [];
  for (const [index, query] of capturedQueries.entries()) {
    const queryPlan = await embedded.database.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`, query.parameters);
    plans.push({ query: queryNames[index], parameters: query.parameters, plan: queryPlan.rows[0]['QUERY PLAN'] });
  }
  await writeFile(new URL('../../docs/evidencias/api-query-plans.json', import.meta.url),
    `${JSON.stringify({ tickets: 10000, engine: 'PGlite 0.5.16 / PostgreSQL 18.6', filters: commonFilters, plans }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(plans.map((entry) => ({ query: entry.query,
    execution_ms: entry.plan[0]['Execution Time'] })))}\n`);
} finally { await embedded.close(); }

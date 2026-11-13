// Consultas parametrizadas e agregações do dashboard, executadas no PostgreSQL.
// Listagem agrega depois da paginação para não multiplicar chamados por notas ou eventos.
import { ApiError } from './api-error.js';
import { isoTimestamp, type TicketDatabase } from './database.js';
import type { TicketFilters, TicketQuery } from './ticket-filters.js';
import { summarizeTickets, type TicketCounts } from './ticket-metrics.js';

type DateValue = Date | string;
interface TicketRow {
  id: string; title: string; description: string; status_code: string; status_name: string;
  type_id: string; type_code: string; type_name: string; priority_code: string; priority_name: string;
  assignee_id: string | null; assignee_name: string | null; requester_id: string; requester_name: string;
  department: string | null; created_at: DateValue; updated_at: DateValue; resolved_at: DateValue | null;
  source_system: string | null; external_id: string | null;
  title_is_derived: boolean; history_coverage: string; notes_coverage: string;
  contract_version: string | null; accepted_exported_at: DateValue | null;
  note_id: string | null; note_content: string | null; note_created_at: DateValue | null;
  note_author_id: string | null; note_author_name: string | null;
}
interface NoteRow { id: string; content: string; created_at: DateValue; author_id: string | null; author_name: string | null }
interface HistoryRow { id: string; event_type: string; occurred_at: DateValue; author_id: string | null; source_sequence: number | null;
  author_name: string | null; previous_value: unknown; new_value: unknown }

function ticketSelection(filters: TicketFilters, basis: 'created_at' | 'resolved_at', completedOnly = false) {
  const parameters: unknown[] = [];
  const predicates = ['TRUE'];
  const bind = (value: unknown) => { parameters.push(value); return `$${parameters.length}`; };
  if (filters.start_date) {
    // O limite final exclusivo inclui o último dia, inclusive em mudanças históricas de fuso.
    predicates.push(`t.${basis} >= (${bind(filters.start_date)}::date::timestamp AT TIME ZONE 'America/Sao_Paulo')`);
    predicates.push(`t.${basis} < ((${bind(filters.end_date)}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`);
  }
  if (filters.status) predicates.push(`t.status_code = ${bind(filters.status)}`);
  if (filters.type_id) predicates.push(`t.type_id = ${bind(filters.type_id)}::uuid`);
  if (filters.priority) predicates.push(`t.priority_code = ${bind(filters.priority)}`);
  if (filters.assignee_id) predicates.push(`t.assignee_id = ${bind(filters.assignee_id)}::uuid`);
  if (completedOnly) predicates.push("t.status_code IN ('resolved', 'closed')");
  return { clause: predicates.join(' AND '), parameters };
}

const ticketColumns = `t.*, statuses.name AS status_name, types.code AS type_code, types.name AS type_name,
  priorities.name AS priority_name, assignees.name AS assignee_name,
  requesters.name AS requester_name, requesters.department,
  last_note.id AS note_id, last_note.content AS note_content, last_note.created_at AS note_created_at,
  last_note.author_id AS note_author_id, last_note.author_name AS note_author_name`;
const ticketJoins = `JOIN ticket_statuses statuses ON statuses.code = t.status_code
  JOIN ticket_types types ON types.id = t.type_id
  JOIN ticket_priorities priorities ON priorities.code = t.priority_code
  JOIN requesters ON requesters.id = t.requester_id
  LEFT JOIN users assignees ON assignees.id = t.assignee_id
  LEFT JOIN LATERAL (
    SELECT notes.id, notes.content, notes.created_at, notes.author_id, authors.name AS author_name
    FROM technical_notes notes LEFT JOIN users authors ON authors.id = notes.author_id
    WHERE notes.ticket_id = t.id ORDER BY notes.created_at DESC, notes.source_time_ns DESC NULLS LAST,
      notes.source_external_id COLLATE "C" DESC NULLS LAST, notes.id DESC LIMIT 1
  ) last_note ON TRUE`;

function authorReference(id: string | null, name: string | null) {
  return id ? { id, name } : null;
}

function presentTicket(ticket: TicketRow) {
  return { id: ticket.id, title: ticket.title, description: ticket.description,
    status: { code: ticket.status_code, name: ticket.status_name },
    type: { id: ticket.type_id, code: ticket.type_code, name: ticket.type_name },
    priority: { code: ticket.priority_code, name: ticket.priority_name },
    assignee: authorReference(ticket.assignee_id, ticket.assignee_name),
    requester: { id: ticket.requester_id, name: ticket.requester_name, department: ticket.department },
    created_at: isoTimestamp(ticket.created_at), updated_at: isoTimestamp(ticket.updated_at),
    resolved_at: isoTimestamp(ticket.resolved_at),
    source: ticket.source_system ? { system: ticket.source_system, external_id: ticket.external_id } : null,
    provenance: { contract_version: ticket.contract_version, exported_at: isoTimestamp(ticket.accepted_exported_at),
      title_is_derived: ticket.title_is_derived, history_coverage: ticket.history_coverage, technical_notes_coverage: ticket.notes_coverage },
    latest_technical_note: ticket.note_id ? { id: ticket.note_id, content: ticket.note_content,
      created_at: isoTimestamp(ticket.note_created_at), author: authorReference(ticket.note_author_id, ticket.note_author_name) } : null };
}

export class TicketRepository {
  constructor(private database: TicketDatabase) {}

  async summary(filters: TicketFilters) {
    const selection = ticketSelection(filters, 'created_at');
    const ticketCounts = await this.database.query<TicketCounts>(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE t.status_code = 'open')::int AS open,
      count(*) FILTER (WHERE t.status_code = 'in_progress')::int AS in_progress,
      count(*) FILTER (WHERE t.status_code = 'waiting')::int AS waiting,
      count(*) FILTER (WHERE t.status_code IN ('resolved', 'closed'))::int AS resolved,
      avg(extract(epoch FROM t.resolved_at - t.created_at))
        FILTER (WHERE t.status_code IN ('resolved', 'closed'))::float8 AS average_resolution_seconds
      FROM tickets t WHERE ${selection.clause}`, selection.parameters);
    return summarizeTickets(ticketCounts.rows[0]);
  }

  async sourceQuality() {
    const sourceQuality = await this.database.query<{ received: number; rejected: number; pending: number;
      linked: number; last_received_at: DateValue | null; mode: string }>(`SELECT count(*)::int AS received,
      count(*) FILTER (WHERE import_state = 'rejected')::int AS rejected,
      count(*) FILTER (WHERE import_state = 'pending')::int AS pending,
      count(*) FILTER (WHERE import_state = 'linked')::int AS linked,
      max(last_seen_at) AS last_received_at,
      (SELECT CASE WHEN count(*) = 0 THEN 'empty'
        WHEN count(*) FILTER (WHERE source_system = 'demo') = count(*) THEN 'demo'
        WHEN count(*) FILTER (WHERE source_system = 'demo') = 0 THEN 'operational'
        ELSE 'mixed' END FROM tickets) AS mode FROM ticket_source_records`);
    return { ...sourceQuality.rows[0], last_received_at: isoTimestamp(sourceQuality.rows[0].last_received_at) };
  }

  async statusDistribution(filters: TicketFilters) {
    const selection = ticketSelection(filters, 'created_at');
    const statusBreakdown = await this.database.query<{ code: string; name: string; tickets: number }>(`
      WITH selected_counts AS (SELECT t.status_code, count(*)::int AS tickets FROM tickets t
        WHERE ${selection.clause} GROUP BY t.status_code)
      SELECT statuses.code, statuses.name, coalesce(selected_counts.tickets, 0) AS tickets
      FROM ticket_statuses statuses LEFT JOIN selected_counts ON selected_counts.status_code = statuses.code
      ORDER BY array_position(ARRAY['open', 'in_progress', 'waiting', 'resolved', 'closed'], statuses.code)`, selection.parameters);
    return statusBreakdown.rows;
  }

  async ticketsByPeriod(query: TicketQuery) {
    const selection = ticketSelection(query, 'resolved_at', true);
    const groupParameter = `$${selection.parameters.push(query.group_by)}`;
    const startParameter = `$${selection.parameters.push(query.start_date ?? null)}`;
    const endParameter = `$${selection.parameters.push(query.end_date ?? null)}`;
    const periodCounts = await this.database.query<{ period_start: string; tickets: number }>(`
      WITH selected_tickets AS (
        SELECT t.resolved_at AT TIME ZONE 'America/Sao_Paulo' AS local_resolution
        FROM tickets t WHERE ${selection.clause}
      ), bounds AS (
        SELECT coalesce(${startParameter}::date, min(local_resolution)::date) AS first_day,
          coalesce(${endParameter}::date, max(local_resolution)::date) AS last_day FROM selected_tickets
      ), buckets AS (
        SELECT generate_series(date_trunc(${groupParameter}, first_day::timestamp),
          date_trunc(${groupParameter}, last_day::timestamp),
          CASE ${groupParameter} WHEN 'day' THEN interval '1 day' WHEN 'week' THEN interval '1 week'
            ELSE interval '1 month' END) AS period_start FROM bounds
      ), resolutions AS (
        SELECT date_trunc(${groupParameter}, local_resolution) AS period_start, count(*)::int AS tickets
        FROM selected_tickets GROUP BY 1
      )
      SELECT to_char(buckets.period_start, 'YYYY-MM-DD') AS period_start,
        coalesce(resolutions.tickets, 0) AS tickets FROM buckets
      LEFT JOIN resolutions USING (period_start) ORDER BY buckets.period_start`, selection.parameters);
    return periodCounts.rows;
  }

  async topTicketTypes(query: TicketQuery) {
    const selection = ticketSelection(query, 'resolved_at', true);
    const limitParameter = `$${selection.parameters.push(query.limit)}`;
    const typeRanking = await this.database.query<{ id: string; code: string; name: string; tickets: number }>(`
      SELECT types.id, types.code, types.name, count(*)::int AS tickets
      FROM tickets t JOIN ticket_types types ON types.id = t.type_id
      WHERE ${selection.clause} GROUP BY types.id, types.code, types.name
      ORDER BY tickets DESC, types.name COLLATE "C" ASC, types.id ASC LIMIT ${limitParameter}`, selection.parameters);
    return typeRanking.rows;
  }

  async listTickets(query: TicketQuery) {
    const selection = ticketSelection(query, 'created_at');
    const limitParameter = `$${selection.parameters.push(query.page_size)}`;
    const offsetParameter = `$${selection.parameters.push((query.page - 1) * query.page_size)}`;
    const sortColumn = { created_at: 's.created_at', updated_at: 's.updated_at',
      resolved_at: 's.resolved_at', priority: 's.priority_severity' }[query.sort_by];
    // Identificadores não aceitam bind; só estas expressões internas entram na ordenação.
    const direction = query.sort_order === 'asc' ? 'ASC' : 'DESC';
    const sorting = `${sortColumn} ${direction} NULLS LAST, s.id ${direction}`;
    const ticketPage = await this.database.query<{ total: number; ticket_rows: TicketRow[] }>(`
      WITH selected_tickets AS MATERIALIZED (
        SELECT t.*, priorities.severity AS priority_severity FROM tickets t
        JOIN ticket_priorities priorities ON priorities.code = t.priority_code WHERE ${selection.clause}
      ), selected_page AS (
        SELECT s.*, row_number() OVER (ORDER BY ${sorting}) AS page_order FROM selected_tickets s
        ORDER BY ${sorting} LIMIT ${limitParameter} OFFSET ${offsetParameter}
      )
      SELECT (SELECT count(*)::int FROM selected_tickets) AS total,
        coalesce(jsonb_agg(to_jsonb(ticket_rows) ORDER BY ticket_rows.page_order), '[]'::jsonb) AS ticket_rows
      FROM (SELECT ${ticketColumns} FROM selected_page t ${ticketJoins}) ticket_rows`, selection.parameters);
    const { total, ticket_rows } = ticketPage.rows[0];
    return { tickets: ticket_rows.map(presentTicket), pagination: { page: query.page, page_size: query.page_size,
      total, total_pages: Math.ceil(total / query.page_size) } };
  }

  async ticketDetail(ticketId: string) {
    const ticketMatches = await this.database.query<TicketRow & { technical_notes: NoteRow[]; history: HistoryRow[] }>(`
      SELECT ${ticketColumns},
        (SELECT coalesce(jsonb_agg(to_jsonb(note_rows) ORDER BY note_rows.created_at, note_rows.source_time_ns NULLS LAST,
          note_rows.source_external_id COLLATE "C" NULLS LAST, note_rows.id), '[]'::jsonb)
          FROM (SELECT n.id, n.content, n.created_at, n.source_time_ns, n.source_external_id, n.author_id, u.name AS author_name
            FROM technical_notes n LEFT JOIN users u ON u.id = n.author_id WHERE n.ticket_id = t.id) note_rows) AS technical_notes,
        (SELECT coalesce(jsonb_agg(to_jsonb(history_rows) ORDER BY history_rows.source_sequence NULLS LAST, history_rows.occurred_at, history_rows.id), '[]'::jsonb)
          FROM (SELECT h.id, h.event_type, h.occurred_at, h.source_sequence, h.author_id, h.previous_value, h.new_value, u.name AS author_name
            FROM ticket_history h LEFT JOIN users u ON u.id = h.author_id WHERE h.ticket_id = t.id) history_rows) AS history
      FROM tickets t ${ticketJoins} WHERE t.id = $1::uuid`, [ticketId]);
    const ticket = ticketMatches.rows[0];
    if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Chamado não encontrado.');
    return { ticket: presentTicket(ticket),
      technical_notes: ticket.technical_notes.map((note) => ({ id: note.id, content: note.content,
        created_at: isoTimestamp(note.created_at), author: authorReference(note.author_id, note.author_name) })),
      history: ticket.history.map((event) => ({ id: event.id, event_type: event.event_type, sequence: event.source_sequence,
        occurred_at: isoTimestamp(event.occurred_at), author: authorReference(event.author_id, event.author_name),
        previous_value: event.previous_value, new_value: event.new_value })) };
  }

  async filterOptions() {
    const [statuses, types, priorities, assignees] = await Promise.all([
      this.database.query('SELECT code, name FROM ticket_statuses ORDER BY code'),
      this.database.query(`SELECT id, code, name, active FROM ticket_types WHERE active
        OR EXISTS (SELECT 1 FROM tickets WHERE type_id = ticket_types.id) ORDER BY name COLLATE "C", id`),
      this.database.query('SELECT code, name, severity FROM ticket_priorities ORDER BY severity'),
      this.database.query(`SELECT id, name, active FROM users WHERE role = 'technician'
        AND (active OR EXISTS (SELECT 1 FROM tickets WHERE assignee_id = users.id)) ORDER BY name COLLATE "C", id`),
    ]);
    return { statuses: statuses.rows, types: types.rows, priorities: priorities.rows, assignees: assignees.rows };
  }
}

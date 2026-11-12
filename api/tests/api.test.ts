// Exercita os endpoints HTTP nos dois modos de PostgreSQL, com casos de negócio conhecidos.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { applyMigrations, seedTickets } from '../scripts/database.mjs';
import { createApp, type RequestLog } from '../src/app.js';
import { createTestDatabase } from './test-database.mjs';
import { summarizeTickets } from '../src/ticket-metrics.js';
import { readConfiguration } from '../src/configuration.js';

const embedded = await createTestDatabase();
const database = embedded.database;
const logEntries: RequestLog[] = [];
const app = createApp(database, { log: (entry) => logEntries.push(entry) });
const firstDay = { start_date: '2025-01-01', end_date: '2025-01-01' };
const firstWeek = { start_date: '2025-01-01', end_date: '2025-01-07' };
const fixtureId = (number: number) => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
let printingType: string;
let technicianId: string;

beforeAll(async () => {
  await applyMigrations(database);
  await seedTickets(database, '2026-11-11');
  printingType = (await database.query("SELECT id FROM ticket_types WHERE code = 'printing'")).rows[0].id;
  technicianId = (await database.query("SELECT id FROM users WHERE external_id = 'technician-2'")).rows[0].id;
  const requesterId = (await database.query("SELECT id FROM requesters WHERE external_id = 'requester-1'")).rows[0].id;
  const ticketFixtures = [
    [1, 'resolved', 'high', 'printing', '2025-01-01T03:00:00Z', '2025-01-01T05:00:00Z'],
    [2, 'closed', 'high', 'printing', '2025-01-01T03:00:00Z', '2025-01-01T09:00:00Z'],
    [3, 'open', 'high', 'printing', '2025-01-01T15:00:00Z', null],
    [4, 'resolved', 'normal', 'network', '2024-12-31T23:00:00Z', '2025-01-02T04:00:00Z'],
    [5, 'open', 'low', 'hardware', '2025-01-02T02:59:59.999Z', null],
    [6, 'open', 'urgent', 'network', '2025-01-02T03:00:00Z', null],
    [7, 'resolved', 'normal', 'printing', '2025-01-05T03:00:00Z', '2025-01-06T03:00:00Z'],
  ] as const;
  for (const [number, status, priority, type, createdAt, resolvedAt] of ticketFixtures) {
    await database.query(`INSERT INTO tickets (id, title, description, status_code, priority_code, type_id,
      assignee_id, requester_id, created_at, updated_at, resolved_at)
      VALUES ($1, $2, 'Ocorrência técnica de integração', $3, $4, (SELECT id FROM ticket_types WHERE code = $5),
        $6, $7, $8, coalesce($9::timestamptz, $8::timestamptz), $9)`,
    [fixtureId(number), `Chamado técnico ${number}`, status, priority, type, number === 5 ? null : technicianId,
      requesterId, createdAt, resolvedAt]);
  }
  await database.query(`INSERT INTO technical_notes (id, ticket_id, author_id, content, created_at) VALUES
    ($1, $3, $4, 'Driver revisado.', '2025-01-01T04:00:00Z'),
    ($2, $3, NULL, 'Impressão validada.', '2025-01-01T05:00:00Z')`,
  [fixtureId(101), fixtureId(102), fixtureId(1), technicianId]);
  await database.query(`INSERT INTO ticket_history (id, ticket_id, event_type, new_value, occurred_at) VALUES
    ($1, $3, 'created', '"open"', '2025-01-01T03:00:00Z'),
    ($2, $3, 'status_changed', '"resolved"', '2025-01-01T05:00:00Z')`,
  [fixtureId(201), fixtureId(202), fixtureId(1)]);
});
afterAll(() => embedded.close());

describe('indicadores, filtros e bases temporais', () => {
  it('inclui fechados no total resolvido e calcula média e taxa da população criada', async () => {
    const response = await request(app).get('/api/v1/dashboard/summary').query({ ...firstDay, priority: 'high', type_id: printingType }).expect(200);
    expect(response.body.summary).toEqual({ total: 3, open: 1, in_progress: 0, waiting: 0, resolved: 2,
      average_resolution_seconds: 14400, resolution_rate: 100 * 2 / 3 });
    expect(response.body.meta.period_basis).toBe('created_at');
    expect(response.body.meta.source_quality.mode).toBe('mixed');
    expect(response.headers['x-request-id']).toBe(response.body.meta.request_id);
  });

  it('combina todos os filtros com E lógico', async () => {
    const response = await request(app).get('/api/v1/dashboard/summary').query({ ...firstDay, status: 'resolved',
      priority: 'high', type_id: printingType, assignee_id: technicianId }).expect(200);
    expect(response.body.summary).toMatchObject({ total: 1, resolved: 1, average_resolution_seconds: 7200, resolution_rate: 100 });
  });

  it('inclui o último milissegundo local e exclui o início do dia seguinte', async () => {
    const response = await request(app).get('/api/v1/tickets').query(firstDay).expect(200);
    expect(response.body.pagination.total).toBe(4);
    expect(response.body.tickets.map((ticket: { id: string }) => ticket.id)).toContain(fixtureId(5));
    expect(response.body.tickets.map((ticket: { id: string }) => ticket.id)).not.toContain(fixtureId(6));
  });

  it('respeita o dia de 23 horas no início do horário de verão de São Paulo', async () => {
    await database.query('BEGIN');
    try {
      const requesterId = (await database.query("SELECT id FROM requesters WHERE external_id = 'requester-1'")).rows[0].id;
      const instants = ['2018-11-04T02:59:59.999Z', '2018-11-04T03:00:00Z',
        '2018-11-05T01:59:59.999Z', '2018-11-05T02:00:00Z'];
      for (const [index, createdAt] of instants.entries()) {
        await database.query(`INSERT INTO tickets (id, title, description, status_code, type_id, priority_code,
          requester_id, created_at, updated_at) VALUES ($1, 'Falha de autenticação na VPN',
          'Ocorrência na mudança do fuso da operação.', 'open', $2, 'normal', $3, $4, $4)`,
        [fixtureId(301 + index), printingType, requesterId, createdAt]);
      }
      const response = await request(app).get('/api/v1/tickets').query({ start_date: '2018-11-04', end_date: '2018-11-04' }).expect(200);
      expect(response.body.tickets.map((ticket: { id: string }) => ticket.id)).toEqual([fixtureId(303), fixtureId(302)]);
    } finally { await database.query('ROLLBACK'); }
  });

  it('nova resolução após reabertura mede desde a criação e conta uma única conclusão vigente', async () => {
    await database.query('BEGIN');
    try {
      await database.query(`INSERT INTO ticket_history (ticket_id, event_type, previous_value, new_value, occurred_at)
        VALUES ($1, 'status_changed', '"resolved"', '"in_progress"', '2025-01-06T15:00:00Z')`, [fixtureId(7)]);
      await database.query(`UPDATE tickets SET resolved_at = '2025-01-07T03:00:00Z',
        updated_at = '2025-01-07T03:00:00Z' WHERE id = $1`, [fixtureId(7)]);
      const summary = await request(app).get('/api/v1/dashboard/summary')
        .query({ start_date: '2025-01-05', end_date: '2025-01-05' }).expect(200);
      expect(summary.body.summary).toMatchObject({ total: 1, resolved: 1, average_resolution_seconds: 172800 });
      const periods = await request(app).get('/api/v1/dashboard/tickets-by-period')
        .query({ start_date: '2025-01-06', end_date: '2025-01-07' }).expect(200);
      expect(periods.body.periods).toEqual([{ period_start: '2025-01-06', tickets: 0 }, { period_start: '2025-01-07', tickets: 1 }]);
    } finally { await database.query('ROLLBACK'); }
  });

  it('soma a distribuição até o mesmo total do resumo e mantém status zerados', async () => {
    const response = await request(app).get('/api/v1/dashboard/status-distribution').query(firstDay).expect(200);
    expect(response.body.statuses).toHaveLength(5);
    expect(response.body.statuses.reduce((total: number, status: { tickets: number }) => total + status.tickets, 0)).toBe(4);
    expect(response.body.statuses.find((status: { code: string }) => status.code === 'waiting').tickets).toBe(0);
  });

  it('retorna null para métricas sem base e zero para contagens', async () => {
    const response = await request(app).get('/api/v1/dashboard/summary').query({ start_date: '2020-01-01', end_date: '2020-01-02' }).expect(200);
    expect(response.body.summary).toEqual({ total: 0, open: 0, in_progress: 0, waiting: 0, resolved: 0,
      average_resolution_seconds: null, resolution_rate: null });
  });

  it('consulta o histórico inteiro quando ambas as datas são omitidas', async () => {
    const response = await request(app).get('/api/v1/dashboard/summary').expect(200);
    expect(response.body.summary.total).toBe(487);
  });

  it('agrupa por resolução e preenche dias sem conclusão', async () => {
    const response = await request(app).get('/api/v1/dashboard/tickets-by-period')
      .query({ start_date: '2025-01-01', end_date: '2025-01-03', group_by: 'day' }).expect(200);
    expect(response.body.periods).toEqual([{ period_start: '2025-01-01', tickets: 2 },
      { period_start: '2025-01-02', tickets: 1 }, { period_start: '2025-01-03', tickets: 0 }]);
    expect(response.body.meta.period_basis).toBe('resolved_at');
  });

  it('inicia semanas na segunda-feira e respeita recortes parciais', async () => {
    const response = await request(app).get('/api/v1/dashboard/tickets-by-period').query({ ...firstWeek, group_by: 'week' }).expect(200);
    expect(response.body.periods).toEqual([{ period_start: '2024-12-30', tickets: 3 }, { period_start: '2025-01-06', tickets: 1 }]);
  });

  it('agrupa meses de calendário e completa meses vazios', async () => {
    const response = await request(app).get('/api/v1/dashboard/tickets-by-period')
      .query({ start_date: '2024-12-01', end_date: '2025-02-28', group_by: 'month' }).expect(200);
    expect(response.body.periods).toEqual([{ period_start: '2024-12-01', tickets: 0 },
      { period_start: '2025-01-01', tickets: 4 }, { period_start: '2025-02-01', tickets: 0 }]);
  });

  it('status não concluído produz zeros na série e ranking vazio', async () => {
    const response = await request(app).get('/api/v1/dashboard/tickets-by-period').query({ ...firstDay, status: 'open' }).expect(200);
    expect(response.body.periods).toEqual([{ period_start: '2025-01-01', tickets: 0 }]);
    const ranking = await request(app).get('/api/v1/dashboard/top-ticket-types').query({ ...firstDay, status: 'open' }).expect(200);
    expect(ranking.body.types).toEqual([]);
  });

  it('ranqueia chamados concluídos sem duplicar notas e respeita limit', async () => {
    const response = await request(app).get('/api/v1/dashboard/top-ticket-types').query({ ...firstWeek, limit: 1 }).expect(200);
    expect(response.body.types).toEqual([{ id: printingType, code: 'printing', name: 'Impressão', tickets: 3 }]);
  });

  it('desempata o ranking pelo nome do tipo', async () => {
    await database.query('BEGIN');
    try {
      await database.query("UPDATE tickets SET type_id = (SELECT id FROM ticket_types WHERE code = 'network') WHERE id = $1", [fixtureId(7)]);
      const response = await request(app).get('/api/v1/dashboard/top-ticket-types').query(firstWeek).expect(200);
      expect(response.body.types.map((type: { code: string; tickets: number }) => [type.code, type.tickets]))
        .toEqual([['printing', 2], ['network', 2]]);
    } finally { await database.query('ROLLBACK'); }
  });

  it('retira a resolução vigente da série quando o chamado é reaberto', async () => {
    await database.query('BEGIN');
    try {
      await database.query("UPDATE tickets SET status_code = 'in_progress', resolved_at = NULL WHERE id = $1", [fixtureId(7)]);
      const response = await request(app).get('/api/v1/dashboard/tickets-by-period')
        .query({ start_date: '2025-01-06', end_date: '2025-01-06' }).expect(200);
      expect(response.body.periods).toEqual([{ period_start: '2025-01-06', tickets: 0 }]);
    } finally { await database.query('ROLLBACK'); }
  });

  it('devolve série vazia sem intervalo e sem conclusões selecionadas', async () => {
    const response = await request(app).get('/api/v1/dashboard/tickets-by-period').query({ status: 'open' }).expect(200);
    expect(response.body.periods).toEqual([]);
  });
});

describe('listagem e detalhes', () => {
  it('pagina sem duplicações e preserva o total em página além do fim', async () => {
    const first = await request(app).get('/api/v1/tickets').query({ ...firstDay, page_size: 2 }).expect(200);
    const second = await request(app).get('/api/v1/tickets').query({ ...firstDay, page_size: 2, page: 2 }).expect(200);
    expect([...first.body.tickets, ...second.body.tickets].map((ticket: { id: string }) => ticket.id))
      .toEqual([fixtureId(5), fixtureId(3), fixtureId(2), fixtureId(1)]);
    const beyond = await request(app).get('/api/v1/tickets').query({ ...firstDay, page: 9 }).expect(200);
    expect(beyond.body.tickets).toEqual([]);
    expect(beyond.body.pagination.total).toBe(4);
  });

  it('ordena prioridades por severidade e resolução nula por último', async () => {
    const priorities = await request(app).get('/api/v1/tickets').query({ ...firstWeek, sort_by: 'priority', sort_order: 'desc' }).expect(200);
    expect(priorities.body.tickets[0].id).toBe(fixtureId(6));
    expect(priorities.body.tickets.at(-1).priority.code).toBe('low');
    const resolutions = await request(app).get('/api/v1/tickets').query({ ...firstDay, sort_by: 'resolved_at', sort_order: 'asc' }).expect(200);
    expect(resolutions.body.tickets.map((ticket: { id: string }) => ticket.id)).toEqual([fixtureId(1), fixtureId(2), fixtureId(3), fixtureId(5)]);
  });

  it('retorna a última consideração e o detalhe em ordem cronológica', async () => {
    const response = await request(app).get(`/api/v1/tickets/${fixtureId(1)}`).expect(200);
    expect(response.body.ticket.latest_technical_note.content).toBe('Impressão validada.');
    expect(response.body.technical_notes.map((note: { content: string }) => note.content)).toEqual(['Driver revisado.', 'Impressão validada.']);
    expect(response.body.technical_notes[1].author).toBeNull();
    expect(response.body.history.map((event: { event_type: string }) => event.event_type)).toEqual(['created', 'status_changed']);
    expect(response.body.ticket.created_at).toBe('2025-01-01T03:00:00.000Z');
  });

  it('representa técnico e consideração ausentes sem inventar texto ou autoria', async () => {
    const response = await request(app).get(`/api/v1/tickets/${fixtureId(5)}`).expect(200);
    expect(response.body.ticket.assignee).toBeNull();
    expect(response.body.ticket.latest_technical_note).toBeNull();
    expect(response.body.history).toEqual([]);
  });

  it('oferece catálogos e somente responsáveis com papel de técnico', async () => {
    const response = await request(app).get('/api/v1/filters/options').expect(200);
    expect(response.body.options.statuses).toHaveLength(5);
    expect(response.body.options.priorities.map((priority: { severity: number }) => priority.severity)).toEqual([1, 2, 3, 4]);
    expect(response.body.options.assignees).toHaveLength(5);
    expect(JSON.stringify(response.body)).not.toContain('@example.invalid');
  });
});

describe('validação, segurança e falhas', () => {
  it.each([
    [{ start_date: '01/01/2025', end_date: '2025-01-02' }, 400],
    [{ start_date: '2025-02-30', end_date: '2025-03-01' }, 422],
    [{ start_date: '2025-01-02', end_date: '2025-01-01' }, 422],
    [{ start_date: '2025-01-01' }, 422],
    [{ status: 'cancelled' }, 422],
    [{ type_id: 'invalid' }, 400],
    [{ type_id: fixtureId(999) }, 422],
    [{ assignee_id: fixtureId(999) }, 422],
    [{ status: "open' OR 1=1 --" }, 422],
    [{ unsupported: 'true' }, 400],
  ])('rejeita consulta inválida %j com HTTP %i', async (query, status) => {
    const response = await request(app).get('/api/v1/dashboard/summary').query(query).expect(status);
    expect(response.body.error).toHaveProperty('code');
    expect(response.body.error).toHaveProperty('details');
  });

  it.each(['page=0', 'page_size=101', 'page=1.5', 'sort_by=title;DROP%20TABLE%20tickets', 'sort_order=up', 'status=open&status=closed'])
    ('rejeita paginação, ordenação ou parâmetros repetidos: %s', async (query) => {
      const response = await request(app).get(`/api/v1/tickets?${query}`);
      expect([400, 422]).toContain(response.status);
    });

  it('retorna 404 para UUID inexistente e 400 para formato inválido', async () => {
    await request(app).get(`/api/v1/tickets/${fixtureId(999)}`).expect(404);
    await request(app).get('/api/v1/tickets/missing').expect(400);
    await request(app).get('/api/v1/missing').expect(404);
  });

  it('rejeita agrupamento e limite fora do contrato', async () => {
    await request(app).get('/api/v1/dashboard/tickets-by-period?group_by=year').expect(422);
    await request(app).get('/api/v1/dashboard/top-ticket-types?limit=0').expect(422);
    await request(app).get('/api/v1/filters/options?status=open').expect(400);
  });

  it('exige bearer quando configurado e permite preflight de origem autorizada', async () => {
    const protectedApp = createApp(database, { accessToken: 'a'.repeat(32), log: () => {} });
    await request(protectedApp).get('/api/v1/filters/options').expect(401);
    await request(protectedApp).get('/api/v1/filters/options').set('Authorization', `Bearer ${'a'.repeat(32)}`).expect(200);
    await request(protectedApp).options('/api/v1/tickets').set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET').expect(204);
  });

  it('permite apenas origens explicitamente configuradas', async () => {
    const allowed = await request(app).get('/api/v1/filters/options').set('Origin', 'http://localhost:5173').expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    await request(app).get('/api/v1/filters/options').set('Origin', 'https://unknown.example').expect(403);
  });

  it('não expõe SQL, credenciais ou stack no erro inesperado', async () => {
    const failures: RequestLog[] = [];
    const brokenApp = createApp({ query: async () => { throw Object.assign(new Error('SELECT secret password=private'), { code: '42P01' }); } },
      { log: (entry) => failures.push(entry) });
    const response = await request(brokenApp).get('/api/v1/dashboard/summary').expect(500);
    expect(response.body).toEqual({ error: { code: 'INTERNAL_ERROR',
      message: 'Não foi possível concluir a consulta. Tente novamente.', details: [] } });
    expect(failures[0]).toMatchObject({ status: 500, database_code: '42P01', request_id: response.headers['x-request-id'] });
    expect(JSON.stringify(failures)).not.toContain('private');
  });

  it('serve saúde, Swagger e o contrato dos sete endpoints', async () => {
    await request(app).get('/health').expect(200, { status: 'ready' });
    await request(app).get('/docs/').expect(200).expect('Content-Type', /html/);
    const response = await request(app).get('/docs/openapi.json').expect(200);
    expect(Object.keys(response.body.paths)).toHaveLength(7);
  });

  it('configuração restringe exposição e demonstração fora de loopback', () => {
    expect(() => readConfiguration({ HOST: '0.0.0.0', DATABASE_URL: 'postgresql://localhost/test' })).toThrow(/API_ACCESS_TOKEN/);
    expect(() => readConfiguration({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://localhost/test' })).toThrow(/API_ACCESS_TOKEN/);
    expect(() => readConfiguration({ CORS_ORIGINS: '*' }, true)).toThrow(/CORS_ORIGINS/);
    expect(readConfiguration({}, true).HOST).toBe('127.0.0.1');
  });

  it('calcula taxa sem arredondar e distingue população sem conclusões de população vazia', () => {
    expect(summarizeTickets({ total: 1, open: 1, in_progress: 0, waiting: 0, resolved: 0, average_resolution_seconds: null }).resolution_rate).toBe(0);
    expect(summarizeTickets({ total: 0, open: 0, in_progress: 0, waiting: 0, resolved: 0, average_resolution_seconds: null }).resolution_rate).toBeNull();
  });
});

// Verifica migrations, seed e integridade em banco isolado, embarcado ou PostgreSQL por TCP.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase } from './test-database.mjs';
import { applyMigrations, seedTickets } from '../scripts/database.mjs';

const testDatabase = await createTestDatabase();
const database = testDatabase.database;
const connection = database;

before(async () => {
  const appliedNames = await applyMigrations(connection);
  assert.equal(appliedNames.length, 2);
  await seedTickets(connection, '2026-11-11');
});

after(async () => testDatabase.close());

test('reexecutar migrations não altera o schema já aplicado', async () => {
  assert.deepEqual(await applyMigrations(connection), []);
  const migrationCount = await database.query('SELECT count(*)::int AS total FROM schema_migrations');
  assert.equal(migrationCount.rows[0].total, 2);
});

test('checksum divergente impede ignorar uma migration modificada', async () => {
  const originalChecksum = await database.query('SELECT checksum FROM schema_migrations WHERE name = $1',
    ['001_initial_schema.sql']);
  await database.query("UPDATE schema_migrations SET checksum = 'alterado' WHERE name = $1",
    ['001_initial_schema.sql']);
  try {
    await assert.rejects(applyMigrations(connection), /Migration já aplicada foi alterada/);
  } finally {
    await database.query('UPDATE schema_migrations SET checksum = $1 WHERE name = $2',
      [originalChecksum.rows[0].checksum, '001_initial_schema.sql']);
  }
});

test('seed distribui 480 chamados em ao menos oito meses e catálogos completos', async () => {
  const seedProfile = await database.query(`SELECT count(*)::int AS total,
    count(DISTINCT date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo'))::int AS months,
    count(DISTINCT status_code)::int AS statuses, count(DISTINCT type_id)::int AS types,
    count(DISTINCT priority_code)::int AS priorities, count(*) FILTER (WHERE assignee_id IS NULL)::int AS unassigned,
    max(created_at) < '2026-11-12T03:00:00Z'::timestamptz AS no_future_creation,
    max(resolved_at) < '2026-11-12T03:00:00Z'::timestamptz AS no_future_resolution
    FROM tickets`);
  assert.equal(seedProfile.rows[0].total, 480);
  assert.ok(seedProfile.rows[0].months >= 8);
  assert.equal(seedProfile.rows[0].statuses, 5);
  assert.equal(seedProfile.rows[0].types, 5);
  assert.equal(seedProfile.rows[0].priorities, 4);
  assert.ok(seedProfile.rows[0].unassigned > 0);
  assert.equal(seedProfile.rows[0].no_future_creation, true);
  assert.equal(seedProfile.rows[0].no_future_resolution, true);
  const monthlyCounts = await database.query(`SELECT count(*)::int AS total FROM tickets
    GROUP BY date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')`);
  assert.ok(new Set(monthlyCounts.rows.map((month) => month.total)).size > 3);
});

test('reexecutar seed preserva chamados, notas e histórico sem duplicação', async () => {
  const countSql = `SELECT (SELECT count(*)::int FROM tickets) AS tickets,
    (SELECT count(*)::int FROM technical_notes) AS notes,
    (SELECT count(*)::int FROM ticket_history) AS history`;
  const beforeCounts = await database.query(countSql);
  await seedTickets(connection, '2026-11-11');
  const afterCounts = await database.query(countSql);
  assert.deepEqual(afterCounts.rows, beforeCounts.rows);
  assert.ok(afterCounts.rows[0].notes > 480);
  assert.ok(afterCounts.rows[0].history > 960);
});

test('seed contém reaberturas e eventos dentro da vida do chamado', async () => {
  const invalidEvents = await database.query(`SELECT count(*)::int AS total FROM ticket_history history
    JOIN tickets ON tickets.id = history.ticket_id
    WHERE history.occurred_at < tickets.created_at OR history.occurred_at > tickets.updated_at`);
  assert.equal(invalidEvents.rows[0].total, 0);
  const reopenedTickets = await database.query(`SELECT count(*)::int AS total FROM ticket_history
    WHERE previous_value = '"resolved"'::jsonb AND new_value = '"in_progress"'::jsonb`);
  assert.ok(reopenedTickets.rows[0].total > 0);
  const invalidNotes = await database.query(`SELECT count(*)::int AS total FROM technical_notes notes
    JOIN tickets ON tickets.id = notes.ticket_id
    WHERE notes.created_at < tickets.created_at OR notes.created_at > tickets.updated_at`);
  assert.equal(invalidNotes.rows[0].total, 0);
});

test('conclusão sem data de resolução é rejeitada', async () => {
  await assert.rejects(database.query(`UPDATE tickets SET resolved_at = NULL
    WHERE id = (SELECT id FROM tickets WHERE status_code = 'resolved' LIMIT 1)`),
  (databaseError) => databaseError.code === '23514');
});

test('chamado aberto não pode manter uma resolução vigente', async () => {
  await assert.rejects(database.query(`UPDATE tickets SET resolved_at = created_at
    WHERE id = (SELECT id FROM tickets WHERE status_code = 'open' LIMIT 1)`),
  (databaseError) => databaseError.code === '23514');
});

test('datas anteriores à criação e atualização anterior à resolução são rejeitadas', async () => {
  await assert.rejects(database.query(`UPDATE tickets SET resolved_at = created_at - interval '1 second'
    WHERE id = (SELECT id FROM tickets WHERE status_code = 'resolved' LIMIT 1)`),
  (databaseError) => databaseError.code === '23514');
  await assert.rejects(database.query(`UPDATE tickets SET updated_at = created_at - interval '1 second'
    WHERE id = (SELECT id FROM tickets LIMIT 1)`),
  (databaseError) => databaseError.code === '23514');
  await assert.rejects(database.query(`UPDATE tickets SET updated_at = created_at
    WHERE id = (SELECT id FROM tickets WHERE status_code = 'resolved' LIMIT 1)`),
  (databaseError) => databaseError.code === '23514');
});

test('responsável inexistente e exclusão de solicitante referenciado são rejeitados', async () => {
  await assert.rejects(database.query(`UPDATE tickets SET assignee_id = md5('missing-user')::uuid
    WHERE id = (SELECT id FROM tickets LIMIT 1)`),
  (databaseError) => databaseError.code === '23503');
  await assert.rejects(database.query(`DELETE FROM requesters
    WHERE id = (SELECT requester_id FROM tickets LIMIT 1)`),
  (databaseError) => ['23503', '23001'].includes(databaseError.code) &&
    databaseError.constraint === 'tickets_requester_id_fkey');
});

test('identidade externa não pode ser duplicada nem preenchida parcialmente', async () => {
  await assert.rejects(database.query(`UPDATE tickets SET source_system = NULL
    WHERE id = (SELECT id FROM tickets LIMIT 1)`),
  (databaseError) => databaseError.code === '23514');
  await assert.rejects(database.query(`UPDATE tickets SET external_id = 'ticket-1'
    WHERE source_system = 'demo' AND external_id = 'ticket-2'`),
  (databaseError) => databaseError.code === '23505');
});

test('registro legado incompleto é preservado sem entrar nos indicadores', async () => {
  const legacyTicket = { id: 'legacy-17', descricao: 'Impressora sem conexão', status: 'Aberto',
    tipo: 'Manutenção', tecnico: 'João', usuario: 'Alberto' };
  await database.query(`INSERT INTO ticket_source_records
    (source_system, external_id, payload, import_state, validation_errors)
    VALUES ('thindesk', $1, $2, 'rejected', $3)`,
  [legacyTicket.id, JSON.stringify(legacyTicket), ['created_at ausente', 'priority ausente']]);
  const sourceRecord = await database.query('SELECT payload, ticket_id FROM ticket_source_records WHERE external_id = $1',
    [legacyTicket.id]);
  assert.deepEqual(sourceRecord.rows[0].payload, legacyTicket);
  assert.equal(sourceRecord.rows[0].ticket_id, null);
  const ticketCount = await database.query('SELECT count(*)::int AS total FROM tickets');
  assert.equal(ticketCount.rows[0].total, 480);
});

test('registro da origem não pode ser marcado como vinculado sem chamado válido', async () => {
  await assert.rejects(database.query(`INSERT INTO ticket_source_records
    (source_system, external_id, payload, import_state) VALUES ('thindesk', 'invalid-link', '{}', 'linked')`),
  (databaseError) => databaseError.code === '23514');
});

test('catálogos desconhecidos e conteúdo vazio são rejeitados', async () => {
  await assert.rejects(database.query(`UPDATE tickets SET status_code = 'UNKNOWN'
    WHERE id = (SELECT id FROM tickets WHERE status_code = 'open' LIMIT 1)`),
  (databaseError) => databaseError.code === '23503');
  await assert.rejects(database.query(`UPDATE tickets SET title = '  '
    WHERE id = (SELECT id FROM tickets LIMIT 1)`),
  (databaseError) => databaseError.code === '23514');
  await assert.rejects(database.query(`UPDATE technical_notes SET content = '  '
    WHERE id = (SELECT id FROM technical_notes LIMIT 1)`),
  (databaseError) => databaseError.code === '23514');
});

test('data de referência inválida não inicia o seed', async () => {
  await assert.rejects(seedTickets(connection, '2026-02-30'), /data válida/);
  await assert.rejects(seedTickets(connection, '11/11/2026'), /data válida/);
});

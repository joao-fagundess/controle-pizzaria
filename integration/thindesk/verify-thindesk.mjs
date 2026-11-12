// Exercita o Thindesk Java em execução e o comando compilado de recepção usando bancos isolados.
// Resultados registram contagens e hashes; cookies, credenciais e payloads não são impressos.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { legacyTicketFixtures } from './fixtures.mjs';

const require = createRequire('/app/package.json');
const { Client } = require('pg');
const database = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const source = process.env.THINDESK_BASE_URL;
const username = process.env.THINDESK_USERNAME;
const password = process.env.THINDESK_PASSWORD;
const accessToken = process.env.API_ACCESS_TOKEN;
const report = { status: 'running', source: 'Thindesk 1.0-alpha do ZIP', authentication: 'form/session',
  synthetic_source_tickets: legacyTicketFixtures.length, checks: [], connector_executions: [] };
let currentCheck;
async function check(name, assertion) {
  currentCheck = name;
  await assertion();
  report.checks.push({ name, status: 'passed' });
}
const fetchSource = (path, options = {}) => fetch(new URL(path, source), { ...options, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
async function api(path, expectedStatus = 200) {
  const response = await fetch(`http://api:3000${path}`, { signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${accessToken}` } });
  assert.equal(response.status, expectedStatus);
  return response.json();
}
function receive(overrides = {}, expectedExit = 0) {
  const environment = { ...process.env, ...overrides };
  if (!Object.hasOwn(overrides, 'THINDESK_SESSION_COOKIE')) delete environment.THINDESK_SESSION_COOKIE;
  const execution = spawnSync(process.execPath, ['/app/dist/thindesk-sync.js'], {
    env: environment, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 });
  assert.equal(execution.status, expectedExit, 'O comando deve devolver o código esperado.');
  for (const secret of [password, accessToken, process.env.DATABASE_URL]) {
    assert.ok(!`${execution.stdout}${execution.stderr}`.includes(secret), 'A saída não deve conter credenciais.');
  }
  const outcome = expectedExit === 0 ? JSON.parse(execution.stdout.trim()) : { controlled_failure: true };
  report.connector_executions.push({ exit_code: execution.status, ...outcome });
  return outcome;
}
let sessionCookie;
let firstObservation;
let receivedRows;
try {
  await database.connect();
  await check('origem exige sessão para a API', async () => {
    const response = await fetchSource('api/chamados');
    assert.equal(response.status, 302);
    assert.ok(new URL(response.headers.get('location'), source).pathname.endsWith('/login'));
    await response.body?.cancel();
  });
  await check('página original de login é servida', async () => {
    const response = await fetchSource('login');
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /name="username"/);
    assert.match(html, /name="password"/);
  });
  await check('senha incorreta não autentica', async () => {
    const response = await fetchSource('login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password: `${password}-invalid` }) });
    assert.equal(response.status, 302);
    assert.ok(new URL(response.headers.get('location'), source).searchParams.has('error'));
    await response.body?.cancel();
  });
  await check('login válido emite sessão', async () => {
    const response = await fetchSource('login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }) });
    assert.equal(response.status, 302);
    assert.equal(new URL(response.headers.get('location'), source).pathname, '/');
    sessionCookie = response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
    assert.match(sessionCookie, /JSESSIONID=/);
    await response.body?.cancel();
  });
  await check('API Java retorna os três chamados e apenas os campos legados', async () => {
    const response = await fetchSource('api/chamados', { headers: { Cookie: sessionCookie, Accept: 'application/json' } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    const tickets = await response.json();
    assert.equal(tickets.length, legacyTicketFixtures.length);
    for (const fixture of legacyTicketFixtures) {
      const { _id, ...fields } = fixture;
      assert.deepEqual(tickets.find(ticket => ticket.id === _id), { id: _id, ...fields });
    }
    report.source_fields = Object.keys(tickets[0]).sort();
  });
  const sourceHome = await fetchSource('', { headers: { Cookie: sessionCookie } });
  report.authenticated_home_status = sourceHome.status;
  await sourceHome.body?.cancel();
  await check('receptor inicia sem dados fictícios do seed do dashboard', async () => {
    const summary = await api('/api/v1/dashboard/summary');
    assert.equal(summary.summary.total, 0);
    const preserved = await database.query('SELECT count(*)::int AS total FROM ticket_source_records');
    assert.ok([0, 3].includes(preserved.rows[0].total), 'O banco de homologação deve conter apenas suas fixtures.');
  });
  await check('comando compilado lê a origem Java com login e preserva o lote', async () => {
    assert.deepEqual(receive(), { received: 3, preserved: 3, rejected: 3, unidentified: 0, promoted: 0 });
  });
  await check('registros incompletos ficam rejeitados e sem chamado canônico', async () => {
    receivedRows = (await database.query('SELECT external_id, payload, import_state, ticket_id, validation_errors, first_seen_at, last_seen_at FROM ticket_source_records ORDER BY external_id')).rows;
    assert.equal(receivedRows.length, 3);
    for (const record of receivedRows) {
      assert.equal(record.import_state, 'rejected');
      assert.equal(record.ticket_id, null);
      assert.ok(record.validation_errors.some(issue => issue.startsWith('created_at:')));
      assert.ok(record.validation_errors.some(issue => issue.startsWith('priority:')));
      assert.ok(!Object.hasOwn(record.payload, 'created_at'));
    }
    firstObservation = receivedRows.map(record => [record.external_id, record.first_seen_at.toISOString()]);
  });
  await check('resumo mostra exclusões e mantém indicadores vazios', async () => {
    const summary = await api('/api/v1/dashboard/summary');
    assert.equal(summary.summary.total, 0);
    assert.equal(summary.summary.resolution_rate, null);
    assert.equal(summary.summary.average_resolution_seconds, null);
    assert.equal(summary.meta.source_quality.rejected, 3);
    assert.equal((await api('/api/v1/tickets')).tickets.length, 0);
    report.dashboard = { total: 0, rejected: 3, promoted: 0 };
  });
  await check('proxy do dashboard consulta o receptor correto sem token no cliente', async () => {
    const response = await fetch('http://web:8080/api/v1/dashboard/summary');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).meta.source_quality.rejected, 3);
    const page = await fetch('http://web:8080/');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(!html.includes(accessToken) && !html.includes(password));
  });
  await check('segunda recepção é idempotente e conserva first_seen_at', async () => {
    assert.deepEqual(receive(), { received: 3, preserved: 3, rejected: 3, unidentified: 0, promoted: 0 });
    const repeated = (await database.query('SELECT external_id, first_seen_at FROM ticket_source_records ORDER BY external_id')).rows;
    assert.deepEqual(repeated.map(record => [record.external_id, record.first_seen_at.toISOString()]), firstObservation);
  });
  await check('comando aceita uma sessão válida já existente', async () => {
    assert.deepEqual(receive({ THINDESK_SESSION_COOKIE: sessionCookie }),
      { received: 3, preserved: 3, rejected: 3, unidentified: 0, promoted: 0 });
  });
  await check('falha de login no comando não altera a recepção', async () => {
    const before = (await database.query('SELECT external_id,last_seen_at FROM ticket_source_records ORDER BY external_id')).rows;
    receive({ THINDESK_PASSWORD: `${password}-invalid` }, 1);
    assert.deepEqual((await database.query('SELECT external_id,last_seen_at FROM ticket_source_records ORDER BY external_id')).rows, before);
  });
  await check('cookie inválido no comando é recusado sem alterar dados', async () => {
    const before = (await database.query('SELECT external_id,last_seen_at FROM ticket_source_records ORDER BY external_id')).rows;
    receive({ THINDESK_SESSION_COOKIE: 'JSESSIONID=invalid-homologation-session' }, 1);
    assert.deepEqual((await database.query('SELECT external_id,last_seen_at FROM ticket_source_records ORDER BY external_id')).rows, before);
  });
  await check('logout invalida a sessão original', async () => {
    const response = await fetchSource('logout', { method: 'POST', headers: { Cookie: sessionCookie } });
    assert.equal(response.status, 302);
    await response.body?.cancel();
    const expired = await fetchSource('api/chamados', { headers: { Cookie: sessionCookie } });
    assert.equal(expired.status, 302);
    await expired.body?.cancel();
  });
  await check('tabela de chamados permanece vazia', async () => {
    assert.equal((await database.query('SELECT count(*)::int AS total FROM tickets')).rows[0].total, 0);
  });
  report.compiled_connector_sha256 = createHash('sha256').update(await readFile('/app/dist/thindesk-sync.js')).digest('hex');
  report.node = process.version;
  report.status = 'passed';
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch {
  process.stderr.write(`Falha na verificação de homologação: ${currentCheck ?? 'inicialização do banco'}.\n`);
  process.exitCode = 1;
} finally { await database.end(); }

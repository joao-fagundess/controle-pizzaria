// Verifica a imagem de produção: CLI 1.0, contrato empacotado, PostgreSQL e consultas HTTP com dados fictícios.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative } from 'node:path';
const { Client } = createRequire('/app/package.json')('pg');
const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const folder = await mkdtemp('/tmp/thindesk-import-');
const checks = [], executions = [];
const actual = JSON.parse(await readFile('/tmp/thindesk-import-input.json', 'utf8'));
const partial = JSON.parse(await readFile('/tmp/thindesk-import-partial.json', 'utf8'));
const mapping = '/tmp/thindesk-import-mapping.json';
async function api(path) {
  const response = await fetch(`http://127.0.0.1:3000/api/v1/${path}`, { headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200); return response.json();
}
async function check(name, work) { await work(); checks.push({ name, status: 'passed' }); }
async function receive(value, exitCode) {
  const file = join(folder, 'export.json'); await writeFile(file, JSON.stringify(value));
  const result = spawnSync(process.execPath, ['/app/dist/thindesk-analytics-sync.js', '--mapping', mapping, '--file', file], { env: process.env, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, exitCode, 'Código da CLI compilada');
  for (const secret of [process.env.DATABASE_URL, process.env.API_ACCESS_TOKEN]) assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
  const report = exitCode === 1 ? { controlled_failure: true } : JSON.parse(result.stdout);
  executions.push({ exit_code: result.status, ...report }); return report;
}
let initial;
try {
  initial = (await api('dashboard/summary')).summary;
  await check('export real promove somente referências resolvidas na imagem de produção', async () => {
    const report = await receive(actual, 2); assert.equal(report.promoted, 3); assert.equal(report.rejected, 3);
    const summary = await api('dashboard/summary'); assert.equal(summary.summary.total, initial.total + 3); assert.equal(summary.summary.resolved, initial.resolved + 2);
  });
  await check('arquivo repetido não duplica dados', async () => { assert.equal((await receive(actual, 2)).unchanged, 3); });
  await check('cobertura parcial e coleção desconhecida ficam explícitas na API', async () => {
    assert.equal((await receive(partial, 0)).promoted, 1);
    const row = (await db.query("SELECT id FROM tickets WHERE source_system='thindesk' AND external_id=$1", [partial.tickets[0].external_id])).rows[0];
    const detail = await api(`tickets/${row.id}`);
    assert.deepEqual(detail.history.map(event => event.sequence), [10, 11]);
    assert.equal(detail.ticket.provenance.history_coverage, 'partial'); assert.equal(detail.ticket.provenance.technical_notes_coverage, 'unavailable');
    assert.equal(detail.ticket.provenance.title_is_derived, true); assert.deepEqual(detail.technical_notes, []);
  });
  const accepted = (await db.query("SELECT payload FROM ticket_source_records WHERE import_state='linked' AND payload->>'status'='open' AND source_system='thindesk'")).rows[0].payload;
  const changed = structuredClone(accepted); changed.title += ' revisado'; changed.updated_at = new Date(Date.parse(changed.updated_at) + 1000).toISOString();
  await check('atualização válida e observação antiga preservam a versão aceita', async () => {
    assert.equal((await receive({ ...actual, tickets: [changed] }, 0)).updated, 1);
    assert.equal((await receive({ ...actual, tickets: [accepted] }, 0)).stale, 1);
    assert.deepEqual((await db.query("SELECT payload FROM ticket_source_records WHERE source_system='thindesk' AND external_id=$1", [changed.external_id])).rows[0].payload, changed);
  });
  await check('conflito de versão reverte inclusive novos registros do mesmo lote', async () => {
    const conflict = structuredClone(changed); conflict.description += ' conflito';
    const candidate = structuredClone(accepted); candidate.external_id = 'synthetic-rollback-candidate';
    await receive({ ...actual, tickets: [candidate, conflict] }, 1);
    assert.equal((await db.query("SELECT count(*)::int AS total FROM tickets WHERE source_system='thindesk'")).rows[0].total, 4);
    assert.deepEqual((await db.query("SELECT payload FROM ticket_source_records WHERE source_system='thindesk' AND external_id=$1", [changed.external_id])).rows[0].payload, changed);
  });
  console.log(JSON.stringify({ status: 'passed', checks, cli_executions: executions, total_after: (await api('dashboard/summary')).summary.total }));
} finally {
  await db.end();
  const part = relative('/tmp', folder); assert.ok(part.startsWith('thindesk-import-') && !part.includes('..') && !isAbsolute(part));
  await rm(folder, { recursive: true, force: true });
}

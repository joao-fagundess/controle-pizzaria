// Atualiza somente o receptor fictício de homologação com a imagem de produção já verificada.
// Preserva rejeitados legados, ZIP e demonstração principal; não escreve no Java/MongoDB.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
const root = fileURLToPath(new URL('../', import.meta.url)), evidence = join(root, 'docs/evidencias/thindesk-import');
await mkdir(evidence, { recursive: true });
const environmentPath = join(root, '.cache/thindesk-homologation/.env');
const configuration = parseEnv(await readFile(environmentPath, 'utf8'));
const secrets = Object.entries(configuration).filter(([key]) => /PASSWORD|TOKEN/.test(key)).map(([, value]) => value);
const redact = text => secrets.reduce((result, value) => result.replaceAll(value, '[REDACTED]'), text);
const args = ['compose', '--project-name', 'thindesk-homologation', '--env-file', environmentPath, '-f', join(root, 'docker-compose.thindesk.yml')];
const report = { generated_at: new Date().toISOString(), status: 'running', project: 'thindesk-homologation', steps: [] };
let transcript = '';
async function docker(label, argumentsList, accepted = [0], privateOutput = false) {
  console.log(`${label}: executando.`);
  const child = spawn('docker', argumentsList, { cwd: root, windowsHide: true, signal: AbortSignal.timeout(420000), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
  const [code] = await once(child, 'close');
  report.steps.push({ name: label, exit_code: code });
  transcript += `\n${label}\n${privateOutput ? '[Dados da consulta omitidos; hashes e contagens registrados.]' : redact(stdout + stderr)}`;
  assert.ok(accepted.includes(code), redact((stdout + stderr).slice(-2000)));
  console.log(`${label}: passou.`); return stdout.trim();
}
const compose = (label, argumentsList, accepted, privateOutput) => docker(label, [...args, ...argumentsList], accepted, privateOutput);
const sql = query => compose('Consulta de integridade', ['exec', '-T', 'db', 'psql', '-U', 'dashboard_hml', '-d', 'thindesk_homologation', '-At', '-c', query], [0], true);
const legacySnapshot = () => sql("SELECT jsonb_agg(jsonb_build_object('external_id',external_id,'payload',payload,'first_seen_at',first_seen_at) ORDER BY external_id) FROM ticket_source_records WHERE source_system='thindesk' AND external_id LIKE 'homologacao-%'");
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function api(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(20000) }); assert.equal(response.status, 200);
  const text = await response.text(); for (const value of secrets) assert.ok(!text.includes(value)); return JSON.parse(text);
}
try {
  const verified = JSON.parse(await readFile(join(evidence, 'compose/compose-report.json'), 'utf8'));
  assert.equal(verified.status, 'passed'); assert.equal(verified.cleanup_completed, true);
  report.images = {};
  for (const component of ['api', 'web']) {
    const source = `thindesk-dashboard-${component}:local`, target = `thindesk-homologation-${component}:local`;
    const id = await docker('Identificar imagem validada', ['image', 'inspect', source, '--format', '{{.Id}}']);
    assert.ok(verified.image_digests.some(line => line.includes(id)), 'A imagem precisa ser a mesma validada no Compose descartável.');
    await docker('Reusar artefato validado na homologação', ['tag', source, target]); report.images[component] = id;
  }
  const input = await readFile(join(root, '.cache/thindesk-homologation/analytics-export.json'));
  report.input_sha256 = hash(input); assert.equal(JSON.parse(input).tickets.length, 6);
  await compose('Iniciar banco preservado', ['up', '-d', '--wait', '--wait-timeout', '180', 'db']);
  const before = await legacySnapshot(); assert.equal(JSON.parse(before).length, 3); report.legacy_snapshot_sha256 = hash(before);
  await compose('Aplicar somente migrations pendentes', ['run', '--rm', 'migrate']);
  await compose('Atualizar API e interface de homologação', ['up', '-d', '--wait', '--wait-timeout', '180', 'api', 'web']);
  report.first_sync = JSON.parse(await compose('Receber export 1.0', ['--profile', 'tools', 'run', '--rm', 'sync-v1'], [2]));
  assert.equal(report.first_sync.rejected, 3); assert.equal(report.first_sync.promoted + report.first_sync.unchanged, 3);
  report.repeated_sync = JSON.parse(await compose('Repetir sem duplicação', ['--profile', 'tools', 'run', '--rm', 'sync-v1'], [2]));
  assert.equal(report.repeated_sync.promoted, 0); assert.equal(report.repeated_sync.unchanged, 3);
  const port = Number(configuration.THINDESK_DASHBOARD_PORT || 8180);
  const summary = await api(port, '/api/v1/dashboard/summary');
  assert.equal(summary.summary.total, 3); assert.equal(summary.summary.resolved, 2); assert.equal(summary.meta.source_quality.linked, 3);
  assert.equal(summary.meta.source_quality.rejected, 6); assert.equal(summary.meta.source_quality.received, 9);
  report.dashboard = { url: `http://127.0.0.1:${port}/`, summary: summary.summary, source_quality: summary.meta.source_quality };
  const page = await api(port, '/api/v1/tickets'); assert.equal(page.pagination.total, 3);
  for (const ticket of page.tickets) {
    const detail = await api(port, `/api/v1/tickets/${ticket.id}`);
    assert.equal(detail.ticket.provenance.contract_version, '1.0'); assert.equal(detail.ticket.provenance.history_coverage, 'complete');
    assert.deepEqual(detail.history.map(event => event.sequence), detail.history.map((_, index) => index + 1));
  }
  const after = await legacySnapshot(); assert.equal(after, before); report.original_legacy_records_unchanged = true;
  report.migrations = JSON.parse(await sql('SELECT jsonb_agg(name ORDER BY name) FROM schema_migrations'));
  assert.equal(report.migrations.length, 4);
  const manifest = JSON.parse(await readFile(join(root, '.cache/thindesk-homologation/source-manifest.json'), 'utf8'));
  for (const file of manifest.copied_files) {
    const source = join(root, '.cache/thindesk-homologation/source'), target = resolve(source, file.path), part = relative(source, target);
    assert.ok(!part.startsWith('..') && !isAbsolute(part)); assert.equal(hash(await readFile(target)).toUpperCase(), file.sha256);
  }
  const archive = createHash('sha256');
  for await (const bytes of createReadStream(join(homedir(), 'Documents/thindesk.zip'))) archive.update(bytes);
  assert.equal(archive.digest('hex').toUpperCase(), manifest.archive_sha256);
  report.original_archive_unchanged = true; report.original_sources_verified = manifest.copied_files.length;
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = redact(error.message); process.exitCode = 1; console.error(report.error); }
finally {
  try {
    await docker('Restaurar bancos das demonstrações', ['start', 'thindesk-dashboard-db-1', 'thindesk-homologation-mongo-1', 'thindesk-homologation-db-1']);
    await docker('Restaurar serviços deste projeto', ['start', 'thindesk-dashboard-api-1', 'thindesk-dashboard-web-1', 'thindesk-homologation-thindesk-1', 'thindesk-homologation-api-1', 'thindesk-homologation-web-1']);
    const names = ['thindesk-dashboard-db-1', 'thindesk-dashboard-api-1', 'thindesk-dashboard-web-1', 'thindesk-homologation-db-1',
      'thindesk-homologation-mongo-1', 'thindesk-homologation-thindesk-1', 'thindesk-homologation-api-1', 'thindesk-homologation-web-1'];
    for (let attempt = 0; attempt < 30; attempt++) {
      report.services = (await docker('Conferir saúde', ['inspect', '--format', '{{.Name}} {{.State.Status}} {{.State.Health.Status}}', ...names])).split('\n');
      if (report.services.every(line => line.endsWith('running healthy'))) break;
      await wait(10000);
    }
    assert.ok(report.services.every(line => line.endsWith('running healthy')));
    report.main_demo_total = (await api(8080, '/api/v1/dashboard/summary')).summary.total; assert.equal(report.main_demo_total, 480);
    report.analytics_source_stopped = (await docker('Confirmar encerramento da origem analítica', ['inspect', '--format', '{{.State.Status}}', 'thindesk-analytics-source-thindesk-1', 'thindesk-analytics-source-mongo-1'])).split('\n').every(state => state === 'exited');
    assert.ok(report.analytics_source_stopped); report.unrelated_containers_modified = false;
  } catch (error) { report.status = 'failed'; report.restoration_error = redact(error.message); process.exitCode = 1; }
  await writeFile(join(evidence, 'homologation.txt'), redact(transcript).replace(/[\t ]+$/gm, ''));
  await writeFile(join(evidence, 'homologation.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(`Homologação do receptor 1.0: ${report.status}.`);

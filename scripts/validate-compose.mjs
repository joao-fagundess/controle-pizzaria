// Verifica a entrega em contêineres isolados e remove somente os recursos descartáveis desta execução.
// As credenciais de teste são aleatórias; os relatórios as substituem antes de gravar qualquer saída.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const projectRoot = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const evidenceRoot = join(projectRoot, process.env.ANALYTICS_EVIDENCE === '1' ? 'docs/evidencias/thindesk-import/compose' : 'docs/evidencias/fase-6');
await mkdir(evidenceRoot, { recursive: true });
const cacheRoot = join(projectRoot, '.cache');
await mkdir(cacheRoot, { recursive: true });
const resolvedCache = await realpath(cacheRoot);
assert.ok(!relative(projectRoot, resolvedCache).startsWith('..') && !isAbsolute(relative(projectRoot, resolvedCache)));
const temporaryRoot = await mkdtemp(join(resolvedCache, 'phase6-compose-'));
const projectName = `thindesk-phase6-${randomBytes(6).toString('hex')}`;
const password = randomBytes(32).toString('hex');
const accessToken = randomBytes(32).toString('hex');
const reservation = createServer().listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((done) => reservation.close(done));
const environmentPath = join(temporaryRoot, '.env');
await writeFile(environmentPath, `POSTGRES_PASSWORD=${password}\nAPI_ACCESS_TOKEN=${accessToken}\nDASHBOARD_PORT=${port}\nSEED_REFERENCE_DATE=2026-11-11\n`, { mode: 0o600 });
const environment = { ...process.env, POSTGRES_PASSWORD: password, API_ACCESS_TOKEN: accessToken,
  DASHBOARD_PORT: String(port), SEED_REFERENCE_DATE: '2026-11-11', COMPOSE_PROJECT_NAME: projectName };
const redact = (text) => text.replaceAll(password, '[REDACTED]').replaceAll(accessToken, '[REDACTED]');
const composeArguments = ['compose', '--project-name', projectName, '--env-file', environmentPath,
  '--project-directory', projectRoot, '-f', join(projectRoot, 'docker-compose.yml')];
const report = { generated_at: new Date().toISOString(), status: 'running', project: projectName,
  host: '127.0.0.1', port, node: process.version, platform: process.platform, steps: [], http_checks: [], cleanup_completed: false };
let transcript = '';
let dockerAvailable = false;

async function command(label, argumentsList, timeout = 180_000) {
  process.stdout.write(`${label}: executando.\n`);
  const startedAt = Date.now();
  const child = spawn('docker', argumentsList, { cwd: projectRoot, env: environment, windowsHide: true,
    signal: AbortSignal.timeout(timeout), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const [exitCode] = await once(child, 'close');
  transcript += `\n${label}\n${redact(output)}`;
  report.steps.push({ name: label, exit_code: exitCode, duration_ms: Date.now() - startedAt });
  if (exitCode !== 0) throw new Error(`${label}: ${redact(output.slice(-3000))}`);
  process.stdout.write(`${label}: passou.\n`);
  return output;
}
const compose = (label, argumentsList, timeout) => command(label, [...composeArguments, ...argumentsList], timeout);
async function http(path, status = 200, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers, signal: AbortSignal.timeout(20_000), redirect: 'manual' });
  const body = await response.text();
  assert.equal(response.status, status, path);
  assert.ok(!body.includes(accessToken) && !body.includes(password), `Resposta não deve conter credenciais: ${path}`);
  report.http_checks.push({ path, status: response.status });
  return { response, body, json: () => JSON.parse(body) };
}

try {
  await command('Docker disponível', ['version', '--format', '{{.Server.Version}}'], 30_000);
  dockerAvailable = true;
  const configuration = JSON.parse(await compose('Configuração do Compose', ['config', '--format', 'json']));
  assert.ok(!configuration.services.db.ports && !configuration.services.api.ports);
  assert.equal(configuration.services.web.ports[0].host_ip, '127.0.0.1');
  assert.equal(configuration.services.api.depends_on.migrate.condition, 'service_completed_successfully');
  assert.equal(configuration.services.web.depends_on.api.condition, 'service_healthy');
  assert.equal(configuration.services.web.environment.NGINX_ENVSUBST_FILTER, 'API_ACCESS_TOKEN');
  await writeFile(join(evidenceRoot, 'compose-config.json'), redact(JSON.stringify(configuration, null, 2)));
  await compose('Build das imagens', ['build'], 900_000);
  await compose('Subida e healthchecks', ['up', '-d', '--wait', '--wait-timeout', '120'], 240_000);

  await http('/healthz');
  const index = await http('/');
  assert.match(index.body, /<div id="root"><\/div>/);
  assert.equal((await http('/api/v1/dashboard/summary')).json().summary.total, 0);
  await compose('Seed explícito de demonstração', ['--profile', 'demo', 'run', '--rm', 'seed']);
  assert.equal((await http('/api/v1/dashboard/summary')).json().summary.total, 480);
  for (const groupBy of ['day', 'week', 'month']) await http(`/api/v1/dashboard/tickets-by-period?group_by=${groupBy}`);
  await http('/api/v1/dashboard/status-distribution');
  await http('/api/v1/dashboard/top-ticket-types?limit=3');
  const ticketPage = (await http('/api/v1/tickets?page_size=25&sort_by=priority&sort_order=desc')).json();
  const ticket = ticketPage.tickets.find((candidate) => candidate.assignee);
  assert.ok(ticket);
  await http(`/api/v1/tickets/${ticket.id}`);
  await http('/api/v1/filters/options');
  const selection = new URLSearchParams({ start_date: '2026-01-01', end_date: '2026-12-31',
    status: ticket.status.code, priority: ticket.priority.code, type_id: ticket.type.id, assignee_id: ticket.assignee.id });
  assert.ok((await http(`/api/v1/dashboard/summary?${selection}`)).json().summary.total > 0);
  await http('/api/v1/dashboard/summary?start_date=invalid', 400);
  await http('/api/v1/dashboard/summary?start_date=2026-11-11&end_date=2026-10-01', 422);
  await http('/api/v1/tickets/00000000-0000-0000-0000-000000000000', 404);
  await http('/api/v1/filters/options', 403, { Origin: 'https://unknown.example' });
  const empty = (await http('/api/v1/dashboard/summary?start_date=2020-01-01&end_date=2020-01-31')).json();
  assert.equal(empty.summary.total, 0);
  assert.equal(empty.summary.resolution_rate, null);
  assert.equal(Object.keys((await http('/docs/openapi.json')).json().paths).length, 7);
  await http('/docs/');
  await http('/.env', 403);

  const unauthorized = await compose('Bearer obrigatório no acesso direto à API', ['exec', '-T', 'api', 'node', '-e',
    "fetch('http://127.0.0.1:3000/api/v1/dashboard/summary').then(r=>{if(r.status!==401)process.exit(1);process.stdout.write('HTTP 401 sem bearer\\n')})"]);
  assert.match(unauthorized, /HTTP 401/);
  for (const service of ['api', 'web']) {
    const userId = await compose(`Usuário sem root: ${service}`, ['exec', '-T', service, 'id', '-u']);
    assert.notEqual(userId.trim(), '0');
  }
  const assetPaths = (await compose('Inventário dos assets estáticos', ['exec', '-T', 'web', 'find', '/usr/share/nginx/html', '-type', 'f']))
    .trim().split(/\r?\n/).filter((asset) => asset.includes('/assets/')).map((asset) => asset.replace('/usr/share/nginx/html', ''));
  assert.ok(assetPaths.length >= 4);
  for (const assetPath of assetPaths) await http(assetPath);
  report.assets_checked_for_secrets = assetPaths.length;

  const repeatedMigrations = await compose('Migrations idempotentes', ['run', '--rm', 'migrate']);
  assert.match(repeatedMigrations, /Migrations aplicadas: 0/);
  await compose('Seed idempotente', ['--profile', 'demo', 'run', '--rm', 'seed']);
  assert.equal((await http('/api/v1/dashboard/summary')).json().summary.total, 480);
  await compose('Reinício do banco persistente', ['restart', 'db']);
  const recoveryDeadline = Date.now() + 45_000;
  let recovered = false;
  while (Date.now() < recoveryDeadline && !recovered) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/dashboard/summary`, { signal: AbortSignal.timeout(3000) });
      recovered = response.ok && (await response.json()).summary.total === 480;
    } catch { /* O pool pode estar reconectando durante o reinício controlado. */ }
    if (!recovered) await wait(250);
  }
  assert.ok(recovered, 'O pool deve reconectar e preservar os 480 chamados.');
  report.database_restart_preserved_tickets = true;
  await http('/api/v1/dashboard/summary');
  await compose('Saúde após reinício do banco', ['up', '-d', '--wait', '--wait-timeout', '60'], 120_000);
  report.postgres = (await compose('Versão do PostgreSQL', ['exec', '-T', 'db', 'psql', '-U', 'dashboard', '-d', 'thindesk_dashboard', '-At', '-c', 'SELECT version()'])).trim();
  const containers = await compose('Estado final dos contêineres', ['ps', '--all', '--format', 'json']);
  const containerStates = containers.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  for (const service of ['db', 'api', 'web']) assert.equal(containerStates.find((container) => container.Service === service)?.Health, 'healthy');
  await writeFile(join(evidenceRoot, 'compose-containers.json'), redact(JSON.stringify(containerStates, null, 2)));
  report.image_digests = (await command('Identificação das imagens', ['image', 'inspect', 'thindesk-dashboard-api:local', 'thindesk-dashboard-web:local', 'postgres:18-bookworm',
    '--format', '{{.RepoTags}} {{.Id}} {{json .RepoDigests}}'])).trim().split(/\r?\n/);
  for (const [file, destination] of [
    ['integration/thindesk/verify-import.mjs', '/tmp/thindesk-import-check.mjs'],
    ['integration/thindesk/analytics-mapping.example.json', '/tmp/thindesk-import-mapping.json'],
    ['docs/evidencias/thindesk-analytics/export.json', '/tmp/thindesk-import-input.json'],
    ['docs/contracts/examples/valid-reopened-partial.json', '/tmp/thindesk-import-partial.json'],
  ]) await compose('Fixtures fictícias no container descartável', ['cp', join(projectRoot, file), `api:${destination}`]);
  report.analytics_import = JSON.parse((await compose('CLI 1.0 e consultas da API de produção', ['exec', '-T', 'api', 'node', '/tmp/thindesk-import-check.mjs'])).trim());
  assert.equal(report.analytics_import.status, 'passed');
  report.status = 'passed';
} catch (failure) {
  report.status = 'failed';
  report.error = redact(failure.message);
  process.stderr.write(`${report.error}\n`);
  process.exitCode = 1;
} finally {
  try {
    if (dockerAvailable) {
      assert.match(projectName, /^thindesk-phase6-[a-f0-9]{12}$/);
      const volumes = await command('Confinamento dos volumes de teste', ['volume', 'ls', '--filter', `label=com.docker.compose.project=${projectName}`, '--format', '{{.Name}}']);
      assert.ok(volumes.trim().split(/\r?\n/).every((volume) => !volume || volume.startsWith(`${projectName}_`)));
      await compose('Limpeza do projeto descartável', ['down', '--volumes', '--remove-orphans'], 120_000);
    }
    const cleanupTarget = relative(resolvedCache, resolve(temporaryRoot));
    assert.ok(cleanupTarget.startsWith('phase6-compose-') && !cleanupTarget.includes('..') && !isAbsolute(cleanupTarget));
    await rm(temporaryRoot, { recursive: true, force: true });
    report.cleanup_completed = true;
  } catch (cleanupFailure) {
    report.status = 'failed';
    report.cleanup_error = redact(cleanupFailure.message);
    process.exitCode = 1;
  }
  await writeFile(join(evidenceRoot, 'compose-validation.txt'), redact(transcript).replace(/[\t ]+$/gm, ''));
  await writeFile(join(evidenceRoot, 'compose-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
if (report.status === 'passed') process.stdout.write(`Compose validado: ${report.http_checks.length} verificações HTTP; recursos de teste removidos.\n`);

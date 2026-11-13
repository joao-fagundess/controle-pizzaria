// Executa as mesmas suítes em PostgreSQL nativo por TCP e verifica o servidor compilado com pool.
// O cluster é temporário, restrito ao loopback e não usa DATABASE_URL nem configurações de produção.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { setTimeout as wait } from 'node:timers/promises';
import pg from 'pg';
import { applyMigrations, seedTickets } from './database.mjs';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const projectRoot = await realpath(resolve(apiRoot, '..'));
const evidenceRelative = process.env.ANALYTICS_EVIDENCE === '1' ? 'thindesk-import/native' : 'testes';
const evidenceRoot = join(projectRoot, 'docs', 'evidencias', evidenceRelative);
await mkdir(evidenceRoot, { recursive: true });
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Execute npm run test:postgres na pasta api.');
const packageRequire = createRequire(createRequire(import.meta.url).resolve('embedded-postgres'));
const platformName = { win32: 'windows', linux: 'linux', darwin: 'darwin' }[process.platform];
if (!platformName) throw new Error('Plataforma sem binários portáteis configurados.');
const binaries = await import(pathToFileURL(packageRequire.resolve(`@embedded-postgres/${platformName}-${process.arch}`)).href);

async function availablePort() {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((done) => reservation.close(done));
  return port;
}

async function runProgram(executable, argumentsList, environment = process.env) {
  const child = spawn(executable, argumentsList, { cwd: apiRoot, env: environment,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let transcript = '';
  child.stdout.on('data', (chunk) => { transcript += chunk.toString(); });
  child.stderr.on('data', (chunk) => { transcript += chunk.toString(); });
  const [exitCode] = await once(child, 'exit');
  return { exitCode, transcript };
}

const cacheRoot = join(projectRoot, '.cache');
await mkdir(cacheRoot, { recursive: true });
const resolvedCache = await realpath(cacheRoot);
if (relative(projectRoot, resolvedCache).startsWith('..') || isAbsolute(relative(projectRoot, resolvedCache))) {
  throw new Error('O diretório de teste deve permanecer dentro do projeto.');
}
const temporaryRoot = await mkdtemp(join(resolvedCache, 'postgres-test-'));
const clusterDirectory = join(temporaryRoot, 'cluster');
const passwordFile = join(temporaryRoot, 'init-password');
const password = randomBytes(24).toString('hex');
const user = 'dashboard_test';
const databaseName = `thindesk_test_${randomUUID().replaceAll('-', '')}`;
const port = await availablePort();
const connectionSettings = { host: '127.0.0.1', port, user, password, database: 'postgres', connectionTimeoutMillis: 1000 };
const testUrl = `postgresql://${user}:${password}@127.0.0.1:${port}/${databaseName}`;
let postgresProcess;
let applicationProcess;
let nativeLog = '';
let report;
let sourceHomologation;

try {
  await writeFile(passwordFile, password, { mode: 0o600 });
  const initialization = await runProgram(binaries.initdb, ['--pgdata', clusterDirectory, '--username', user,
    '--pwfile', passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C']);
  await unlink(passwordFile);
  if (initialization.exitCode !== 0) throw new Error(`initdb falhou: ${initialization.transcript}`);
  postgresProcess = spawn(binaries.postgres, ['-D', clusterDirectory, '-p', String(port), '-h', '127.0.0.1',
    '-c', 'timezone=UTC'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  postgresProcess.stderr.on('data', (chunk) => { nativeLog += chunk.toString(); });
  postgresProcess.on('error', (failure) => { nativeLog += failure.message; });
  const startupDeadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < startupDeadline && !ready) {
    const probe = new pg.Client(connectionSettings);
    try { await probe.connect(); await probe.query('SELECT 1'); ready = true; }
    catch { if (postgresProcess.exitCode !== null) break; await wait(150); }
    finally { await probe.end().catch(() => {}); }
  }
  if (!ready) throw new Error(`PostgreSQL não iniciou: ${nativeLog}`);
  const admin = new pg.Client(connectionSettings);
  await admin.connect();
  try { await admin.query(`CREATE DATABASE "${databaseName}"`); }
  finally { await admin.end(); }
  const testEnvironment = { ...process.env, TEST_DATABASE_URL: testUrl };
  delete testEnvironment.DATABASE_URL;
  const integrity = await runProgram(process.execPath,
    ['--test', '--test-reporter=tap', 'tests/database.test.mjs'], testEnvironment);
  await writeFile(join(evidenceRoot, 'postgres-integrity.tap'), integrity.transcript);
  if (integrity.exitCode !== 0) throw new Error('Testes de integridade falharam; consulte postgres-integrity.tap.');
  const endpoints = await runProgram(process.execPath, [npmCli, 'run', 'test:api', '--', '--reporter=default',
    '--reporter=json', `--outputFile=../docs/evidencias/${evidenceRelative}/postgres-tests.json`], testEnvironment);
  await writeFile(join(evidenceRoot, 'postgres-tests.txt'), endpoints.transcript);
  if (endpoints.exitCode !== 0) throw new Error('Testes dos endpoints falharam; consulte postgres-tests.txt.');

  const database = new pg.Client({ ...connectionSettings, database: databaseName });
  await database.connect();
  let engine;
  let leakedSchemas;
  try {
    engine = (await database.query('SELECT version() AS version, inet_server_addr()::text AS address')).rows[0];
    leakedSchemas = (await database.query("SELECT count(*)::int AS total FROM pg_namespace WHERE nspname LIKE 'suite_%'")).rows[0].total;
    assert.equal(leakedSchemas, 0, 'As suítes devem remover somente seus schemas temporários.');
    await applyMigrations(database);
    await seedTickets(database, '2026-11-11');
  } finally { await database.end(); }

  // Opt-in local: lê apenas as duas origens fictícias já preparadas, nunca configurações do ZIP.
  if (process.env.THINDESK_HOMOLOGATION === '1') {
    const credentials = parseEnv(await readFile(join(projectRoot, '.cache/thindesk-homologation/.env'), 'utf8'));
    const sourceEnvironment = { ...process.env, DATABASE_URL: testUrl, THINDESK_USERNAME: credentials.THINDESK_LOGIN_USERNAME,
      THINDESK_PASSWORD: credentials.THINDESK_LOGIN_PASSWORD, THINDESK_SESSION_COOKIE: '' };
    const legacy = await runProgram(process.execPath, ['dist/thindesk-sync.js'], {
      ...sourceEnvironment, THINDESK_BASE_URL: `http://127.0.0.1:${credentials.THINDESK_PORT || 8081}` });
    const versioned = await runProgram(process.execPath, ['dist/thindesk-analytics-sync.js', '--mapping',
      join(projectRoot, 'integration/thindesk/analytics-mapping.example.json')], {
      ...sourceEnvironment, THINDESK_BASE_URL: `http://127.0.0.1:${process.env.THINDESK_ANALYTICS_PORT || 8082}` });
    for (const output of [legacy.transcript, versioned.transcript]) for (const secret of [password, credentials.THINDESK_LOGIN_PASSWORD])
      assert.ok(!output.includes(secret), 'A recepção não deve registrar credenciais.');
    assert.equal(legacy.exitCode, 0, 'A leitura da origem legada precisa concluir.');
    assert.equal(versioned.exitCode, 2, 'O export local contém referências históricas não resolvidas, explicitamente rejeitadas.');
    sourceHomologation = { legacy: JSON.parse(legacy.transcript), versioned: JSON.parse(versioned.transcript), origin_writes: false };
    assert.equal(sourceHomologation.legacy.promoted, 0); assert.equal(sourceHomologation.versioned.promoted, 3);
    assert.equal(sourceHomologation.versioned.rejected, 3);
  }

  const applicationPort = await availablePort();
  const accessToken = randomBytes(32).toString('hex');
  applicationProcess = spawn(process.execPath, ['dist/server.js'], { cwd: apiRoot, windowsHide: true,
    env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(applicationPort),
      DATABASE_URL: testUrl, API_ACCESS_TOKEN: accessToken }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((started, reject) => {
    const timeout = setTimeout(() => reject(new Error('A API compilada não iniciou em 15 segundos.')), 15_000);
    let output = '';
    applicationProcess.stdout.on('data', (chunk) => { output += chunk.toString();
      if (output.includes('"event":"api_started"')) { clearTimeout(timeout); started(); } });
    applicationProcess.once('error', (failure) => { clearTimeout(timeout); reject(failure); });
    applicationProcess.once('exit', () => { clearTimeout(timeout); reject(new Error('A API encerrou antes da consulta.')); });
    applicationProcess.stderr.resume();
  });
  const httpChecks = [];
  async function queryApplication(path, expectedStatus = 200, authenticated = true) {
    const response = await fetch(`http://127.0.0.1:${applicationPort}${path}`, { signal: AbortSignal.timeout(10_000),
      headers: authenticated ? { Authorization: `Bearer ${accessToken}` } : {} });
    assert.equal(response.status, expectedStatus, path);
    httpChecks.push({ path, status: response.status });
    return response.json();
  }
  await queryApplication('/health');
  const summary = await queryApplication('/api/v1/dashboard/summary');
  assert.equal(summary.summary.total, 480 + (sourceHomologation?.versioned.promoted ?? 0));
  if (sourceHomologation) {
    assert.equal(summary.meta.source_quality.linked, 3); assert.equal(summary.meta.source_quality.rejected, 6);
    sourceHomologation.http_verified = { total: summary.summary.total, source_quality: summary.meta.source_quality };
  }
  await queryApplication('/api/v1/dashboard/tickets-by-period?group_by=week');
  await queryApplication('/api/v1/dashboard/status-distribution');
  await queryApplication('/api/v1/dashboard/top-ticket-types?limit=3');
  const ticketPage = await queryApplication('/api/v1/tickets?page_size=2');
  await queryApplication(`/api/v1/tickets/${ticketPage.tickets[0].id}`);
  await queryApplication('/api/v1/filters/options');
  await queryApplication('/api/v1/dashboard/summary?start_date=invalid', 400);
  await queryApplication('/api/v1/dashboard/summary?start_date=2026-11-11&end_date=2026-10-01', 422);
  await queryApplication('/api/v1/tickets/00000000-0000-0000-0000-000000000000', 404);
  await queryApplication('/api/v1/dashboard/summary', 401, false);
  // A falha usa o pool real: interromper este cluster descartável precisa virar erro público 500.
  const interruptedDatabase = await runProgram(binaries.pg_ctl, ['-D', clusterDirectory, '-m', 'fast', '-w', '-t', '15', 'stop']);
  assert.equal(interruptedDatabase.exitCode, 0);
  if (postgresProcess.exitCode === null) await once(postgresProcess, 'exit');
  const unavailable = await queryApplication('/api/v1/dashboard/summary', 500);
  assert.equal(unavailable.error.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(unavailable).includes(password));
  const testOutcome = JSON.parse(await readFile(join(evidenceRoot, 'postgres-tests.json'), 'utf8'));
  report = { status: 'passed', engine, transport: 'TCP', host: '127.0.0.1', port, source_homologation: sourceHomologation,
    server_process: basename(binaries.postgres), server_pid: postgresProcess.pid,
    integrity_tests: Number(integrity.transcript.match(/# tests (\d+)/)?.[1]),
    endpoint_and_connector_tests: testOutcome.numPassedTests, leaked_schemas: leakedSchemas, http_checks: httpChecks };
} finally {
  if (applicationProcess?.exitCode === null) { applicationProcess.kill(); await once(applicationProcess, 'exit'); }
  if (postgresProcess?.exitCode === null) {
    const shutdown = await runProgram(binaries.pg_ctl, ['-D', clusterDirectory, '-m', 'fast', '-w', '-t', '15', 'stop']);
    if (shutdown.exitCode !== 0) throw new Error('Não foi possível encerrar o cluster de teste.');
  }
  // Só remove a árvore criada por mkdtemp, depois de confirmar o confinamento ao cache do projeto.
  const cleanupTarget = relative(resolvedCache, resolve(temporaryRoot));
  if (!cleanupTarget.startsWith('postgres-test-') || cleanupTarget.includes('..') || isAbsolute(cleanupTarget)) {
    throw new Error('Caminho de limpeza recusado.');
  }
  await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
if (report) {
  report.cleanup_completed = true;
  await writeFile(join(evidenceRoot, 'postgres-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`PostgreSQL nativo: ${report.integrity_tests} testes de integridade, ${report.endpoint_and_connector_tests} testes de API/conector e ${report.http_checks.length} verificações HTTP passaram.\n`);
}

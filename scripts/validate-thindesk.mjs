// Compila e verifica a homologação local do ZIP, preservando os bancos para consulta posterior.
// Credenciais ficam no cache ignorado pelo Git; evidências são gravadas com valores sensíveis removidos.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { legacyTicketFixtures } from '../integration/thindesk/fixtures.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sandboxRoot = join(projectRoot, '.cache/thindesk-homologation');
const evidenceRoot = join(projectRoot, 'docs/evidencias/thindesk-local');
await mkdir(evidenceRoot, { recursive: true });
const configuration = parseEnv(await readFile(join(sandboxRoot, '.env'), 'utf8'));
const sourceManifest = JSON.parse(await readFile(join(sandboxRoot, 'source-manifest.json'), 'utf8'));
const zipOption = process.argv.indexOf('--zip');
const archivePath = zipOption >= 0 ? process.argv[zipOption + 1] : join(homedir(), 'Documents/thindesk.zip');
assert.ok(archivePath, 'Informe --zip caminho.zip.');
const archiveHash = () => readFile(archivePath).then(bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase());
assert.equal(await archiveHash(), sourceManifest.archive_sha256);
const sourceRoot = join(sandboxRoot, 'source');
for (const file of sourceManifest.copied_files) {
  const target = resolve(sourceRoot, file.path);
  const relativePath = relative(sourceRoot, target);
  assert.ok(!relativePath.startsWith('..') && !isAbsolute(relativePath));
  assert.equal(createHash('sha256').update(await readFile(target)).digest('hex').toUpperCase(), file.sha256);
}
const allowedFiles = new Set([...sourceManifest.copied_files.map(file => file.path), 'src/main/resources/application.properties', '.dockerignore']);
for (const entry of await readdir(sourceRoot, { recursive: true })) {
  const file = await lstat(join(sourceRoot, entry));
  assert.ok(!file.isSymbolicLink(), 'A cópia de build não deve conter links.');
  if (file.isFile()) assert.ok(allowedFiles.has(entry.replaceAll('\\', '/')), `Arquivo extra no contexto de build: ${entry}`);
}
const properties = await readFile(join(sourceRoot, 'src/main/resources/application.properties'), 'utf8');
const template = await readFile(join(projectRoot, 'integration/thindesk/application.properties'), 'utf8');
assert.equal(properties.replaceAll('\r\n', '\n').trimEnd(), template.replaceAll('\r\n', '\n').trimEnd());
const secrets = Object.entries(configuration).filter(([key]) => /PASSWORD|TOKEN/.test(key)).map(([, value]) => value);
const redact = text => secrets.reduce((clean, secret) => clean.replaceAll(secret, '[REDACTED]'), text)
  .replace(/Using generated security password:[^\r\n]+/g, 'Using generated security password: [REDACTED]');
const environment = { ...process.env, ...configuration };
const composeArguments = ['compose', '--project-name', 'thindesk-homologation', '--env-file', join(sandboxRoot, '.env'),
  '--project-directory', projectRoot, '-f', join(projectRoot, 'docker-compose.thindesk.yml')];
const report = { generated_at: new Date().toISOString(), status: 'running', project: 'thindesk-homologation',
  archive_sha256: sourceManifest.archive_sha256, copied_original_files: sourceManifest.copied_files.length,
  original_archive_unchanged: false, original_sources_verified: true, credentials_from_original: false, steps: [] };
let transcript = '';

async function command(name, argumentsList, { timeout = 180_000, privateOutput = false } = {}) {
  process.stdout.write(`${name}: executando.\n`);
  const started = Date.now();
  const child = spawn('docker', argumentsList, { cwd: projectRoot, env: environment, windowsHide: true,
    signal: AbortSignal.timeout(timeout), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const [exitCode] = await once(child, 'close');
  transcript += `\n${name}\n${privateOutput ? '[Payload omitido; contagens e hashes registrados no relatório.]\n' : redact(stdout + stderr)}`;
  report.steps.push({ name, exit_code: exitCode, duration_ms: Date.now() - started });
  if (exitCode !== 0) throw new Error(`${name}: ${redact((stdout + stderr).slice(-2500))}`);
  process.stdout.write(`${name}: passou.\n`);
  return { stdout, stderr };
}
const compose = (name, argumentsList, options) => command(name, [...composeArguments, ...argumentsList], options);
const canonicalRecords = rows => JSON.stringify(rows.map(row => Object.fromEntries(Object.entries(row).sort())).sort((first, second) => first._id.localeCompare(second._id)));
const mongoAuthorization = "db.getSiblingDB('admin').auth(process.env.MONGO_INITDB_ROOT_USERNAME,process.env.MONGO_INITDB_ROOT_PASSWORD);const source=db.getSiblingDB('thindesk_homologation');";
async function mongoSnapshot(name, insertIfEmpty = false) {
  const program = mongoAuthorization + (insertIfEmpty ? `if(source.chamados.countDocuments({})===0)source.chamados.insertMany(${JSON.stringify(legacyTicketFixtures)});` : '') +
    "print(JSON.stringify(source.chamados.find({}).sort({_id:1}).toArray()));";
  const snapshot = await compose(name, ['exec', '-T', 'mongo', 'mongosh', '--quiet', '--eval', program], { privateOutput: true });
  return JSON.parse(snapshot.stdout.trim());
}

try {
  await command('Docker disponível', ['version', '--format', '{{.Server.Version}}'], { timeout: 30_000 });
  const composeSettings = JSON.parse((await compose('Configuração isolada', ['--profile', 'tools', 'config', '--format', 'json'], { privateOutput: true })).stdout);
  assert.ok(!composeSettings.services.mongo.ports && !composeSettings.services.db.ports && !composeSettings.services.api.ports);
  for (const service of ['thindesk', 'web']) assert.equal(composeSettings.services[service].ports[0].host_ip, '127.0.0.1');
  assert.equal(composeSettings.services.sync.network_mode, 'service:thindesk');
  await writeFile(join(evidenceRoot, 'compose-config.json'), redact(JSON.stringify(composeSettings, null, 2)));
  await compose('Build do código Java e das imagens de recepção', ['build'], { timeout: 900_000 });
  await compose('Inicialização e saúde dos seis serviços', ['up', '-d', '--wait', '--wait-timeout', '180'], { timeout: 600_000 });
  const before = await mongoSnapshot('Fixtures sintéticas no MongoDB separado', true);
  assert.equal(canonicalRecords(before), canonicalRecords(legacyTicketFixtures), 'A coleção deve conter apenas as fixtures previstas; dados existentes não são substituídos.');
  const verification = await compose('Login, leitura e recepção pelo conector compilado', ['--profile', 'tools', 'run', '--rm', 'verify'], { timeout: 180_000 });
  const checks = JSON.parse(verification.stdout.trim());
  assert.equal(checks.status, 'passed');
  await writeFile(join(evidenceRoot, 'checks.json'), `${JSON.stringify(checks, null, 2)}\n`);
  const after = await mongoSnapshot('Origem preservada depois da recepção');
  assert.equal(canonicalRecords(after), canonicalRecords(before));
  report.mongo_source_unchanged = true;
  report.mongo_snapshot_sha256 = createHash('sha256').update(canonicalRecords(after)).digest('hex');
  report.verification_groups = checks.checks.length;
  report.connector_executions = checks.connector_executions.length;
  report.dashboard = checks.dashboard;
  const java = await compose('Versão do Java em execução', ['exec', '-T', 'thindesk', 'java', '-version']);
  report.java = (java.stdout + java.stderr).trim();
  const mongo = await compose('Versão do MongoDB', ['exec', '-T', 'mongo', 'mongosh', '--quiet', '--eval', `${mongoAuthorization}print(db.version());`]);
  report.mongo = mongo.stdout.trim();
  const states = (await compose('Estado dos serviços de homologação', ['ps', '--all', '--format', 'json'])).stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
  for (const name of ['mongo', 'db', 'thindesk', 'api', 'web']) assert.equal(states.find(service => service.Service === name)?.Health, 'healthy');
  assert.equal(states.find(service => service.Service === 'migrate')?.ExitCode, 0);
  await writeFile(join(evidenceRoot, 'containers.json'), redact(JSON.stringify(states, null, 2)));
  const images = await command('Identificação das imagens locais', ['image', 'inspect', 'thindesk-homologation-source:local', 'thindesk-homologation-api:local',
    'thindesk-homologation-web:local', 'mongo:8.0', 'postgres:18-bookworm', '--format', '{{.RepoTags}} {{.Id}} {{json .RepoDigests}}']);
  report.image_digests = images.stdout.trim().split(/\r?\n/);
  const sourceUrl = `http://127.0.0.1:${configuration.THINDESK_PORT || '8081'}`;
  const dashboardUrl = `http://127.0.0.1:${configuration.THINDESK_DASHBOARD_PORT || '8180'}`;
  assert.equal((await fetch(`${sourceUrl}/login`, { signal: AbortSignal.timeout(15_000) })).status, 200);
  const summary = await fetch(`${dashboardUrl}/api/v1/dashboard/summary`, { signal: AbortSignal.timeout(15_000) });
  assert.equal(summary.status, 200);
  const dashboard = await summary.json();
  assert.equal(dashboard.summary.total, 0);
  assert.equal(dashboard.meta.source_quality.rejected, 3);
  report.local_urls = { thindesk: `${sourceUrl}/login`, dashboard: `${dashboardUrl}/` };
  assert.equal(await archiveHash(), sourceManifest.archive_sha256);
  report.original_archive_unchanged = true;
  report.environment_kept_running = true;
  report.status = 'passed';
} catch (failure) {
  report.status = 'failed';
  report.error = redact(failure.message);
  process.stderr.write(`${report.error}\n`);
  process.exitCode = 1;
  try { await compose('Diagnóstico da inicialização', ['logs', '--no-color', '--tail', '120', 'thindesk', 'api']); }
  catch { /* O relatório principal preserva a falha inicial caso o Docker também fique indisponível. */ }
} finally {
  await writeFile(join(evidenceRoot, 'validation.txt'), redact(transcript));
  await writeFile(join(evidenceRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
if (report.status === 'passed') process.stdout.write(`Homologação local aprovada: ${report.verification_groups} grupos de verificação; origem preservada e ambiente disponível.\n`);

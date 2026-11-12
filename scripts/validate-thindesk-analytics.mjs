// Compila a derivação local e registra evidências sintéticas, sem promover dados para PostgreSQL.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { legacyTicketFixtures } from '../integration/thindesk/fixtures.mjs';
import { verifyAnalytics } from '../integration/thindesk/analytics.verify.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = join(root, 'docs/evidencias/thindesk-analytics'); await mkdir(evidence, { recursive: true });
const envFile = join(root, '.cache/thindesk-homologation/.env');
const configuration = parseEnv(await readFile(envFile, 'utf8'));
const secrets = Object.entries(configuration).filter(([key]) => /PASSWORD|TOKEN/.test(key)).map(([, value]) => value);
const redact = text => secrets.reduce((value, secret) => value.replaceAll(secret, '[REDACTED]'), text);
const args = ['compose', '--env-file', envFile, '-f', join(root, 'docker-compose.thindesk-analytics.yml')];
let transcript = '';
async function command(binary, argumentsList, timeout = 180_000, privateOutput = false) {
  const child = spawn(binary, argumentsList, { cwd: root, windowsHide: true, signal: AbortSignal.timeout(timeout), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
  const [exit] = await once(child, 'close');
  transcript += privateOutput ? '[Operação MongoDB: conteúdo omitido.]\n' : redact(stdout + stderr);
  assert.equal(exit, 0, redact((stdout + stderr).slice(-2000))); return stdout;
}
const compose = (argumentsList, timeout, privateOutput) => command('docker', [...args, ...argumentsList], timeout, privateOutput);
const authorization = "db.getSiblingDB('admin').auth(process.env.MONGO_INITDB_ROOT_USERNAME,process.env.MONGO_INITDB_ROOT_PASSWORD);const source=db.getSiblingDB('thindesk_analytics');";
const mongo = async program => JSON.parse((await compose(['exec', '-T', 'mongo', 'mongosh', '--quiet', '--eval', authorization + program], undefined, true)).trim());
const fixtureSnapshot = () => mongo(`print(JSON.stringify(source.chamados.find({_id:{$in:${JSON.stringify(legacyTicketFixtures.map(row => row._id))}}}).sort({_id:1}).toArray()));`);
const hash = value => createHash('sha256').update(value).digest('hex');
const report = { generated_at: new Date().toISOString(), status: 'running', project: 'thindesk-analytics-source', contract_version: '1.0', promotion_implemented: false };
try {
  console.log('Verificando origem e preparando derivação.');
  await command(process.execPath, ['scripts/prepare-thindesk-analytics.mjs']);
  console.log('Compilando o Java com heap Maven limitado.');
  await compose(['build'], 900_000);
  console.log('Build concluído; iniciando Java e MongoDB isolados.');
  await compose(['up', '--no-build', '-d', '--wait', '--wait-timeout', '360'], 420_000);
  await mongo(`for(const fixture of ${JSON.stringify(legacyTicketFixtures)})if(!source.chamados.findOne({_id:fixture._id}))source.chamados.insertOne(fixture);print(JSON.stringify({seeded:true}));`);
  const before = await fixtureSnapshot(); assert.deepEqual(before, legacyTicketFixtures);
  const dashboard = async () => { const response = await fetch('http://127.0.0.1:8180/api/v1/dashboard/summary', { signal: AbortSignal.timeout(15_000) }); assert.equal(response.status, 200); return response.json(); };
  const dashboardBefore = await dashboard();
  const result = await verifyAnalytics({ baseUrl: `http://127.0.0.1:${process.env.THINDESK_ANALYTICS_PORT || 8082}/`, username: configuration.THINDESK_LOGIN_USERNAME, password: configuration.THINDESK_LOGIN_PASSWORD,
    checkExportLimit: async assertion => {
      // Injeção de falha em ID reservado e banco isolado; nunca altera os chamados criados pela API.
      const id = 'test-export-size-' + randomUUID();
      try {
        await mongo(`const ticket=source.chamados.findOne({_analytics:{$exists:true}})._analytics.ticket;ticket.external_id=${JSON.stringify(id)};ticket.description='x'.repeat(5*1024*1024);source.chamados.insertOne({_id:${JSON.stringify(id)},_analytics:{revision:1,ticket}});print(JSON.stringify({injected:true}));`);
        await assertion();
      } finally { await mongo(`source.chamados.deleteOne({_id:${JSON.stringify(id)}});print(JSON.stringify({cleaned:!source.chamados.findOne({_id:${JSON.stringify(id)}})}));`); }
    } });
  assert.deepEqual(await fixtureSnapshot(), before);
  const dashboardAfter = await dashboard(); assert.equal(dashboardAfter.summary.total, dashboardBefore.summary.total);
  assert.deepEqual(dashboardAfter.meta.source_quality, dashboardBefore.meta.source_quality);
  assert.equal(dashboardAfter.summary.total, 0); assert.equal(dashboardAfter.meta.source_quality.rejected, 3);
  await writeFile(join(evidence, 'export.json'), JSON.stringify(result.exported, null, 2) + '\n');
  report.checks = result.checks; report.verification_groups = result.checks.length;
  report.tested_ticket_id = result.tested_ticket_id; report.exported_tickets = result.exported.tickets.length; report.excluded_legacy = Number(result.excluded_legacy);
  report.legacy_fixtures_unchanged = true; report.legacy_snapshot_sha256 = hash(JSON.stringify(before));
  report.existing_dashboard = { total: dashboardAfter.summary.total, rejected: dashboardAfter.meta.source_quality.rejected, unchanged: true };
  const manifest = JSON.parse(await readFile(join(root, '.cache/thindesk-homologation/analytics-build-manifest.json')));
  report.build_provenance = manifest;
  report.image_id = (await command('docker', ['image', 'inspect', 'thindesk-analytics-source:local', '--format', '{{.Id}}'])).trim();
  report.java = (await compose(['exec', '-T', 'thindesk', 'java', '--version'])).trim();
  const zipOption = process.argv.indexOf('--zip');
  const archive = await readFile(zipOption >= 0 ? process.argv[zipOption + 1] : join(homedir(), 'Documents/thindesk.zip'));
  assert.equal(hash(archive).toUpperCase(), manifest.archive_sha256); report.original_archive_unchanged = true;
  await command(process.execPath, ['scripts/prepare-thindesk-analytics.mjs']);
  report.local_url = `http://127.0.0.1:${process.env.THINDESK_ANALYTICS_PORT || 8082}/login`;
  report.status = 'passed'; console.log(`Evolução local aprovada: ${report.verification_groups} grupos HTTP, export conforme e nenhuma promoção analítica.`);
} catch (error) { report.status = 'failed'; report.error = redact(error.message); process.exitCode = 1; console.error(report.error); }
finally {
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(evidence, 'build.txt'), redact(transcript).replace(/[\t ]+$/gm, ''));
}

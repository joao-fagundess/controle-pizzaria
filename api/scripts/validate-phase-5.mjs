// Consolida builds, duas modalidades de PostgreSQL, cobertura e rastreabilidade em uma execução.
// Os comandos não carregam DATABASE_URL nem reutilizam um banco operacional.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const projectRoot = resolve(apiRoot, '..');
const evidenceRoot = join(projectRoot, 'docs', 'evidencias', 'fase-5');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Execute npm --prefix api run validate:phase-5.');
await mkdir(evidenceRoot, { recursive: true });
const environment = { ...process.env };
delete environment.DATABASE_URL;
delete environment.TEST_DATABASE_URL;
const jobs = [];
async function runJob(name, directory, argumentsList, evidenceName) {
  process.stdout.write(`${name}: executando.\n`);
  const startedAt = Date.now();
  const command = spawn(process.execPath, [npmCli, 'run', ...argumentsList], { cwd: join(projectRoot, directory),
    env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let transcript = '';
  command.stdout.on('data', (chunk) => { transcript += chunk.toString(); });
  command.stderr.on('data', (chunk) => { transcript += chunk.toString(); });
  const [exitCode] = await once(command, 'exit');
  await writeFile(join(evidenceRoot, evidenceName), transcript);
  jobs.push({ name, exit_code: exitCode, duration_ms: Date.now() - startedAt, evidence: evidenceName });
  if (exitCode !== 0) {
    process.stderr.write(transcript.slice(-5000));
    throw new Error(`${name} falhou; consulte ${evidenceName}.`);
  }
  process.stdout.write(`${name}: passou.\n`);
  return transcript;
}

await runJob('Build da API', 'api', ['build'], 'api-build.txt');
await runJob('Tipos da API e testes', 'api', ['typecheck'], 'api-typecheck.txt');
await runJob('Build do frontend', 'web', ['build'], 'web-build.txt');
const integrityTranscript = await runJob('Integridade em PostgreSQL embarcado', 'api', ['test:database'], 'embedded-integrity.txt');
await runJob('API com cobertura V8', 'api', ['test:coverage', '--', '--reporter=default', '--reporter=json',
  '--outputFile=../docs/evidencias/fase-5/api-tests.json'], 'api-tests.txt');
await runJob('Frontend com cobertura V8', 'web', ['test:coverage', '--', '--reporter=default', '--reporter=json',
  '--outputFile=../docs/evidencias/fase-5/web-tests.json'], 'web-tests.txt');
await runJob('PostgreSQL nativo e API compilada', 'api', ['test:postgres'], 'postgres-run.txt');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const apiTests = await readJson(join(evidenceRoot, 'api-tests.json'));
const webTests = await readJson(join(evidenceRoot, 'web-tests.json'));
const postgresTests = await readJson(join(evidenceRoot, 'postgres-tests.json'));
const postgresReport = await readJson(join(evidenceRoot, 'postgres-report.json'));
const apiCoverage = await readJson(join(evidenceRoot, 'api-coverage', 'coverage-summary.json'));
const webCoverage = await readJson(join(evidenceRoot, 'web-coverage', 'coverage-summary.json'));
const openApi = await readJson(join(projectRoot, 'docs', 'openapi.json'));
const traceability = await readJson(join(projectRoot, 'docs', 'rastreabilidade.json'));
const assertions = (outcome) => outcome.testResults.flatMap((suite) => suite.assertionResults);
const apiAssertions = assertions(apiTests);
const webAssertions = assertions(webTests);
const postgresAssertions = assertions(postgresTests);
const traceChecks = [];
for (const requirement of traceability.requirements) {
  for (const endpoint of requirement.endpoints) assert.ok(openApi.paths[endpoint]?.get, endpoint);
  for (const test of requirement.tests) {
    assert.ok((await readFile(join(projectRoot, test.file), 'utf8')).includes(test.title), test.title);
    const outcomes = test.suite === 'api' ? [apiAssertions, postgresAssertions] : [webAssertions];
    for (const outcome of outcomes) assert.ok(outcome.some((assertion) => assertion.title === test.title && assertion.status === 'passed'), test.title);
  }
  traceChecks.push({ requirement: requirement.id, endpoints: requirement.endpoints.length,
    named_scenarios: requirement.tests.length, status: 'passed' });
}
assert.deepEqual(traceChecks.map((entry) => entry.requirement), ['RF01', 'RF02', 'RF03', 'RF04', 'RF05', 'RF06', 'RF07']);
await writeFile(join(evidenceRoot, 'traceability-check.json'), `${JSON.stringify(traceChecks, null, 2)}\n`);
const matrixRows = traceability.requirements.map((requirement) => `| ${requirement.id} — ${requirement.description} | ` +
  requirement.endpoints.map((endpoint) => `GET \`${endpoint}\``).join('<br>') + ' | ' +
  requirement.tests.map((test) => `[${test.file}](../${test.file}): ${test.title}`).join('<br><br>') + ' | Passou |');
await writeFile(join(projectRoot, 'docs', 'rastreabilidade.md'), '# Matriz de rastreabilidade — Fase 5\n\n' +
  'Gerada por `npm --prefix api run validate:phase-5` a partir de `rastreabilidade.json` e dos resultados reais dos testes. ' +
  'Cada cenário da API foi aprovado nos modos embarcado e PostgreSQL nativo por TCP; os cenários do frontend usam jsdom.\n\n' +
  '| Requisito | Endpoint | Arquivo e cenário verificado | Resultado |\n| --- | --- | --- | --- |\n' + matrixRows.join('\n') +
  '\n\nOs nomes acima correspondem a testes executados, não a promessas de cobertura total. A lista completa está nos relatórios JSON. ' +
  'As 13 verificações HTTP da versão compilada usam o pool e o servidor PostgreSQL reais. As capturas do dashboard são da Fase 4; ' +
  'a correspondência do bundle é registrada no resumo da Fase 5. Homologação da origem Thindesk e autenticação corporativa continuam pendentes.\n');

const historicalBuild = await readFile(join(projectRoot, 'docs', 'evidencias', 'fase-4-build.txt'), 'utf8');
const historicalAssets = [...historicalBuild.matchAll(/dist\/assets\/([^\s]+\.(?:js|css))/g)].map((match) => match[1]);
const currentAssets = await readdir(join(projectRoot, 'web', 'dist', 'assets'));
const integrityCount = Number(integrityTranscript.match(/(?:# tests|ℹ tests)\s+(\d+)/)?.[1]);
assert.ok(integrityCount > 0);
assert.equal(apiTests.numFailedTests + webTests.numFailedTests + postgresTests.numFailedTests, 0);
assert.equal(postgresReport.cleanup_completed, true);
const summary = { generated_at: new Date().toISOString(), node: process.version, platform: process.platform,
  status: 'passed', jobs, tests: { unique_cases: integrityCount + apiTests.numPassedTests + webTests.numPassedTests,
    executions: integrityCount + apiTests.numPassedTests + webTests.numPassedTests + postgresReport.integrity_tests + postgresTests.numPassedTests,
    embedded_integrity: integrityCount, api_embedded: apiTests.numPassedTests, web: webTests.numPassedTests,
    postgres_integrity: postgresReport.integrity_tests, api_postgres: postgresTests.numPassedTests,
    compiled_http_checks: postgresReport.http_checks.length },
  coverage: { api: apiCoverage.total, web: webCoverage.total }, postgres: postgresReport.engine,
  traceability: { requirements: traceChecks.length, status: 'passed' },
  phase_4_visual_evidence_matches_bundle: historicalAssets.length > 0 && historicalAssets.every((asset) => currentAssets.includes(asset)),
  frontend_assets: currentAssets };
await writeFile(join(evidenceRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`Validação consolidada: ${summary.tests.unique_cases} casos distintos, ${summary.tests.executions} execuções e ${summary.tests.compiled_http_checks} verificações HTTP aprovados.\n`);

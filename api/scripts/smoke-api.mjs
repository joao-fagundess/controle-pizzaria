// Inicia a API compilada, consulta seus endpoints por HTTP e registra evidência com seed fictício.
// O processo e o banco em memória são encerrados ao terminar a verificação.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const portReservation = createServer();
portReservation.listen(0, '127.0.0.1');
await once(portReservation, 'listening');
const port = portReservation.address().port;
await new Promise((done) => portReservation.close(done));
const environment = { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port),
  CORS_ORIGINS: 'http://localhost:5173', SEED_REFERENCE_DATE: '2026-11-11' };
delete environment.API_ACCESS_TOKEN;
const apiProcess = spawn(process.execPath, ['dist/server.js', '--demo'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let apiErrors = '';
apiProcess.stderr.on('data', (chunk) => { apiErrors += chunk.toString(); });
try {
  await new Promise((ready, reject) => {
    const startupDeadline = setTimeout(() => reject(new Error('A API não iniciou em 45 segundos.')), 45_000);
    let outputBuffer = '';
    apiProcess.stdout.on('data', (chunk) => {
      outputBuffer += chunk.toString();
      if (outputBuffer.includes('"event":"api_started"')) { clearTimeout(startupDeadline); ready(); }
    });
    apiProcess.once('error', (failure) => { clearTimeout(startupDeadline); reject(failure); });
    apiProcess.once('exit', (code) => { clearTimeout(startupDeadline); reject(new Error(`A API encerrou com código ${code}: ${apiErrors}`)); });
  });
  const checks = [];
  async function queryEndpoint(path) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200);
    const payload = await response.json();
    checks.push({ path, status: response.status, keys: Object.keys(payload) });
    return payload;
  }
  await queryEndpoint('/health');
  const summary = await queryEndpoint('/api/v1/dashboard/summary');
  assert.equal(summary.summary.total, 480);
  await queryEndpoint('/api/v1/dashboard/tickets-by-period?start_date=2026-10-12&end_date=2026-11-11&group_by=week');
  await queryEndpoint('/api/v1/dashboard/status-distribution');
  await queryEndpoint('/api/v1/dashboard/top-ticket-types?limit=3');
  const tickets = await queryEndpoint('/api/v1/tickets?page_size=2');
  const detail = await queryEndpoint(`/api/v1/tickets/${tickets.tickets[0].id}`);
  assert.equal(detail.ticket.id, tickets.tickets[0].id);
  await queryEndpoint('/api/v1/filters/options');
  await queryEndpoint('/docs/openapi.json');
  await writeFile(new URL('../../docs/evidencias/fase-3-http-smoke.json', import.meta.url),
    `${JSON.stringify({ mode: 'demo', seed_reference_date: '2026-11-11', summary: summary.summary, checks }, null, 2)}\n`);
  process.stdout.write(`API compilada validada: ${checks.length} consultas HTTP, total ${summary.summary.total} chamados fictícios.\n`);
} finally {
  if (apiProcess.exitCode === null) {
    apiProcess.kill();
    await once(apiProcess, 'exit');
  }
}

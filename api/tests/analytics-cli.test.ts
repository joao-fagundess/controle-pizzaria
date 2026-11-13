// Verifica o comando compilado por TCP, em schema e arquivos temporários exclusivos da suíte.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../scripts/database.mjs';
import { createTestDatabase } from './test-database.mjs';
import { addNote, envelope, mapping, ticket } from './analytics-fixtures.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('CLI 1.0 compilada com PostgreSQL nativo', () => {
  let isolated: Awaited<ReturnType<typeof createTestDatabase>>, folder: string, databaseUrl: string, root: string;
  let baseUrl: string; const requests: string[] = [];
  const exported = envelope(addNote(ticket('cli-001')));
  const server = createServer(async (request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.url === '/login' && request.method === 'POST') {
      for await (const _ of request) { /* Consome somente o corpo fictício da autenticação. */ }
      response.writeHead(302, { Location: '/', 'Set-Cookie': 'JSESSIONID=analytics-test; HttpOnly' }).end();
    } else if (request.url === '/api/v1/analytics/tickets/export' && request.headers.cookie === 'JSESSIONID=analytics-test') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(exported));
    } else response.writeHead(302, { Location: '/login' }).end();
  });
  beforeAll(async () => {
    root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
    isolated = await createTestDatabase(); await applyMigrations(isolated.database);
    const schema = (await isolated.database.query<{ name: string }>('SELECT current_schema() AS name')).rows[0].name;
    expect(schema).toMatch(/^suite_[a-f0-9]+$/);
    const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', `-c search_path=${schema}`); databaseUrl = url.href;
    await mkdir(join(root, '.cache'), { recursive: true }); folder = await mkdtemp(join(root, '.cache', 'analytics-cli-'));
    await writeFile(join(folder, 'mapping.json'), JSON.stringify(mapping)); await writeFile(join(folder, 'export.json'), JSON.stringify(exported));
    await new Promise<void>(ready => server.listen(0, '127.0.0.1', ready));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Porta de teste indisponível.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    server.closeAllConnections(); if (server.listening) await new Promise<void>(done => server.close(() => done()));
    if (isolated) await isolated.close();
    if (folder) {
      const part = relative(join(root, '.cache'), resolve(folder));
      if (!part.startsWith('analytics-cli-') || part.includes('..') || isAbsolute(part)) throw new Error('Limpeza fora do diretório da suíte recusada.');
      await rm(folder, { recursive: true, force: true });
    }
  });
  async function run(args: string[], script = 'thindesk-analytics-sync.js') {
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, THINDESK_BASE_URL: baseUrl, THINDESK_USERNAME: 'homologacao', THINDESK_PASSWORD: 'senha-ficticia-cli' };
    delete env.THINDESK_SESSION_COOKIE;
    const child = spawn(process.execPath, [join(root, 'api/dist', script), ...args], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const [code] = await once(child, 'close');
    expect(stdout + stderr).not.toContain(databaseUrl); expect(stdout + stderr).not.toContain('senha-ficticia-cli');
    return { code, stdout, stderr };
  }
  it('autentica, lê o endpoint novo e repete o arquivo sem duplicar', async () => {
    const online = await run(['--mapping', join(folder, 'mapping.json')]); expect(online.code).toBe(0);
    expect(JSON.parse(online.stdout)).toMatchObject({ promoted: 1, rejected: 0 });
    expect(requests).toEqual(['POST /login', 'GET /api/v1/analytics/tickets/export']);
    const repeated = await run(['--mapping', join(folder, 'mapping.json'), '--file', join(folder, 'export.json')]);
    expect(repeated.code).toBe(0); expect(JSON.parse(repeated.stdout)).toMatchObject({ unchanged: 1, promoted: 0 });
    expect((await isolated.database.query('SELECT * FROM tickets')).rows).toHaveLength(1);
  });
  it('rejeita versão, tamanho, UTF-8 e uso do comando legado sem tocar na versão aceita', async () => {
    await writeFile(join(folder, 'invalid.json'), JSON.stringify({ ...exported, contract_version: '2.0' }));
    expect((await run(['--mapping', join(folder, 'mapping.json'), '--file', join(folder, 'invalid.json')])).code).toBe(1);
    await writeFile(join(folder, 'invalid.json'), Buffer.from([0xff, 0xfe]));
    expect((await run(['--mapping', join(folder, 'mapping.json'), '--file', join(folder, 'invalid.json')])).code).toBe(1);
    await writeFile(join(folder, 'invalid.json'), ' '.repeat(5 * 1024 * 1024 + 1));
    expect((await run(['--mapping', join(folder, 'mapping.json'), '--file', join(folder, 'invalid.json')])).stderr).toContain('5 MiB');
    expect((await run(['--file', join(folder, 'export.json')], 'thindesk-sync.js')).stderr).toContain('thindesk:sync:v1');
    expect((await isolated.database.query('SELECT payload FROM ticket_source_records')).rows[0].payload).toEqual(exported.tickets[0]);
  });
  it('registros novos rejeitados retornam código 2 e relatório explícito', async () => {
    await writeFile(join(folder, 'partial.json'), JSON.stringify(envelope({ external_id: 'cli-invalid', title: 'Sem campos completos' })));
    const result = await run(['--mapping', join(folder, 'mapping.json'), '--file', join(folder, 'partial.json')]);
    expect(result.code).toBe(2); expect(JSON.parse(result.stdout)).toMatchObject({ promoted: 0, rejected: 1 });
  });
});

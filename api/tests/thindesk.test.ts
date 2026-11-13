// Valida autenticação em origem HTTP de teste e recepção transacional dos legados.
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, seedTickets } from '../scripts/database.mjs';
import { createTestDatabase } from './test-database.mjs';
import { fetchThindeskTickets, readJsonResponse, sourceByteLimit } from '../src/thindesk-reader.js';
import { normalizeLegacyStatus, preserveLegacyTickets } from '../src/thindesk-import.js';
import { TicketRepository } from '../src/ticket-repository.js';

const embedded = await createTestDatabase();
const legacyTicket = { id: 'legacy-001', descricao: 'Impressora da recepção não imprime',
  status: 'Aberto', Tipo: 'Manutenção', tecnico: 'João', usuario: 'Alberto' };
const sourceRequests: string[] = [];
const sourceServer = createServer(async (incoming, response) => {
  sourceRequests.push(`${incoming.method} ${incoming.url}`);
  if (incoming.url === '/login' && incoming.method === 'POST') {
    let credentials = '';
    for await (const chunk of incoming) credentials += chunk.toString();
    const validLogin = credentials === 'username=tecnico&password=senha-ficticia';
    response.writeHead(302, { Location: validLogin ? '/' : '/login?error',
      ...(validLogin ? { 'Set-Cookie': 'JSESSIONID=fictitious-session; Path=/; HttpOnly' } : {}) }).end();
  } else if (incoming.url === '/api/chamados' && incoming.headers.cookie === 'JSESSIONID=fictitious-session') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify([legacyTicket]));
  } else if (incoming.url === '/api/chamados' && incoming.headers.cookie === 'html=1') {
    response.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>Login</html>');
  } else { response.writeHead(302, { Location: '/login' }).end(); }
});
let baseUrl: string;

beforeAll(async () => {
  await applyMigrations(embedded.database);
  await seedTickets(embedded.database, '2026-11-11');
  await new Promise<void>((ready) => sourceServer.listen(0, '127.0.0.1', ready));
  const address = sourceServer.address();
  if (!address || typeof address === 'string') throw new Error('Porta de teste indisponível.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  sourceServer.closeAllConnections();
  await new Promise<void>((done, reject) => sourceServer.close((failure) => failure ? reject(failure) : done()));
  await embedded.close();
});

describe('cliente do Thindesk', () => {
  it('autentica por formulário e consulta chamados sem escrever na origem', async () => {
    const sourceTickets = await fetchThindeskTickets({ baseUrl, username: 'tecnico', password: 'senha-ficticia' });
    expect(sourceTickets).toEqual([legacyTicket]);
    expect(sourceRequests).toEqual(['POST /login', 'GET /api/chamados']);
  });

  it('reutiliza uma sessão explicitamente fornecida', async () => {
    expect(await fetchThindeskTickets({ baseUrl, sessionCookie: 'JSESSIONID=fictitious-session' })).toEqual([legacyTicket]);
  });

  it('rejeita login inválido, sessão expirada e HTML com HTTP 200', async () => {
    await expect(fetchThindeskTickets({ baseUrl, username: 'tecnico', password: 'wrong' })).rejects.toThrow(/login/);
    await expect(fetchThindeskTickets({ baseUrl, sessionCookie: 'expired=1' })).rejects.toThrow(/HTTP 302/);
    await expect(fetchThindeskTickets({ baseUrl, sessionCookie: 'html=1' })).rejects.toThrow(/não devolveu JSON/);
  });

  it('exige HTTPS fora do loopback e não aceita credenciais na URL', async () => {
    await expect(fetchThindeskTickets({ baseUrl: 'http://support.example', sessionCookie: 'session=1' })).rejects.toThrow(/HTTPS/);
    await expect(fetchThindeskTickets({ baseUrl: 'https://user:secret@support.example' })).rejects.toThrow(/sem credenciais/);
  });

  it('rejeita JSON inválido e respostas maiores que o limite', async () => {
    await expect(readJsonResponse(new Response(Buffer.from([34, 255, 34]), { headers: { 'Content-Type': 'application/json' } }))).rejects.toThrow(/JSON válido/);
    await expect(readJsonResponse(new Response('invalid-json', { headers: { 'Content-Type': 'application/json' } }))).rejects.toThrow(/JSON válido/);
    await expect(readJsonResponse(new Response('{}', { headers: { 'Content-Type': 'application/json',
      'Content-Length': String(sourceByteLimit + 1) } }))).rejects.toThrow(/5 MiB/);
  });

  it.each([['Aberto', 'open'], [' EM_ANDAMENTO ', 'in_progress'], ['Concluído', 'resolved'],
    ['cancelado', null], ['__proto__', null], ['constructor', null], [null, null]])('normaliza somente status reconhecido: %s', (input, expected) => {
    expect(normalizeLegacyStatus(input)).toBe(expected);
  });
});

describe('preservação dos registros de origem', () => {
  it('preserva payload e erros sem inventar datas ou aumentar indicadores', async () => {
    const report = await preserveLegacyTickets(embedded.database, [legacyTicket]);
    expect(report).toEqual({ received: 1, preserved: 1, rejected: 1, unidentified: 0, promoted: 0 });
    const preserved = await embedded.database.query("SELECT * FROM ticket_source_records WHERE external_id = 'legacy-001'");
    expect(preserved.rows[0].payload).toEqual(legacyTicket);
    expect(preserved.rows[0].ticket_id).toBeNull();
    expect(preserved.rows[0].validation_errors).toContain('created_at: ausente no contrato legado');
    const summary = await new TicketRepository(embedded.database).summary({});
    expect(summary.total).toBe(480);
    expect((await new TicketRepository(embedded.database).sourceQuality()).rejected).toBe(1);
  });

  it('atualiza o último payload sem duplicar a identidade externa', async () => {
    await preserveLegacyTickets(embedded.database, [{ ...legacyTicket, descricao: 'Diagnóstico atualizado na origem' }]);
    const preserved = await embedded.database.query("SELECT payload FROM ticket_source_records WHERE external_id = 'legacy-001'");
    expect(preserved.rows).toHaveLength(1);
    expect(preserved.rows[0].payload.descricao).toBe('Diagnóstico atualizado na origem');
  });

  it('aceita identidade do export Extended JSON e registra conflito de classificação', async () => {
    const { id, ...ticketWithoutId } = legacyTicket;
    await preserveLegacyTickets(embedded.database, [{ ...ticketWithoutId, _id: { $oid: '675b1fa1d64af05ea59ee7d3' }, tipo: 'Software' }]);
    const preserved = await embedded.database.query("SELECT validation_errors FROM ticket_source_records WHERE external_id = '675b1fa1d64af05ea59ee7d3'");
    expect(preserved.rows[0].validation_errors).toContain('tipo: campos tipo e Tipo conflitantes');
  });

  it('informa registros sem identidade e rejeita duplicados antes de escrever', async () => {
    expect(await preserveLegacyTickets(embedded.database, [{ descricao: 'Sem identificador' }, null]))
      .toMatchObject({ unidentified: 2, preserved: 0 });
    await expect(preserveLegacyTickets(embedded.database, [{ ...legacyTicket, id: 'duplicate' }, { ...legacyTicket, id: 'duplicate' }])).rejects.toThrow(/duplicados/);
    expect((await embedded.database.query("SELECT id FROM ticket_source_records WHERE external_id = 'duplicate'")).rows).toEqual([]);
  });

  it('reverte a recepção se um registro já tiver vínculo normalizado', async () => {
    const canonicalId = (await embedded.database.query('SELECT id FROM tickets LIMIT 1')).rows[0].id;
    await embedded.database.query(`INSERT INTO ticket_source_records
      (source_system, external_id, payload, import_state, ticket_id)
      VALUES ('thindesk', 'already-linked', '{}', 'linked', $1)`, [canonicalId]);
    await expect(preserveLegacyTickets(embedded.database, [{ ...legacyTicket, id: 'rollback-first' },
      { ...legacyTicket, id: 'already-linked' }])).rejects.toThrow(/revertida/);
    expect((await embedded.database.query("SELECT id FROM ticket_source_records WHERE external_id = 'rollback-first'")).rows).toEqual([]);
  });
});

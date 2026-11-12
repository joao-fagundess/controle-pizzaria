// Isola cada suíte em memória ou em um schema próprio de um banco PostgreSQL exclusivo de teste.
import { randomUUID } from 'node:crypto';
import pg from 'pg';

export async function createTestDatabase() {
  if (!process.env.TEST_DATABASE_URL) {
    const { createEmbeddedDatabase } = await import('../src/embedded-database.ts');
    return createEmbeddedDatabase();
  }
  const address = new URL(process.env.TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(address.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname) ||
      !/^\/thindesk_test_[a-z0-9_]+$/.test(address.pathname)) {
    throw new Error('TEST_DATABASE_URL exige banco local com prefixo thindesk_test_; a suíte não usa DATABASE_URL.');
  }
  const connection = new pg.Client({ connectionString: address.href, connectionTimeoutMillis: 5_000, statement_timeout: 15_000 });
  const schema = `suite_${randomUUID().replaceAll('-', '')}`;
  await connection.connect();
  try {
    // O nome é gerado internamente, sem aceitar identificadores SQL da configuração externa.
    await connection.query(`CREATE SCHEMA "${schema}"`);
    await connection.query(`SET search_path TO "${schema}"`);
  } catch (setupError) { await connection.end(); throw setupError; }
  let pendingQuery = Promise.resolve();
  const database = { query(sql, parameters) {
    // Uma conexão mantém as transações dos testes; consultas paralelas aguardam sua vez no fio.
    const consultation = pendingQuery.then(() => connection.query(sql, parameters));
    pendingQuery = consultation.then(() => undefined, () => undefined);
    return consultation;
  } };
  return { database, async close() {
    await pendingQuery;
    try {
      await connection.query('ROLLBACK');
      await connection.query('RESET search_path');
      await connection.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally { await connection.end(); }
  } };
}

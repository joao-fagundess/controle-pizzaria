// Inicializa o servidor e encerra conexões de forma controlada ao receber um sinal.
import pg from 'pg';
import { applyMigrations, seedTickets } from '../scripts/database.mjs';
import { createApp } from './app.js';
import { readConfiguration } from './configuration.js';
import type { TicketDatabase } from './database.js';
import { createEmbeddedDatabase } from './embedded-database.js';

async function startServer() {
  const demo = process.argv.includes('--demo');
  const configuration = readConfiguration(process.env, demo);
  let database: TicketDatabase;
  let closeDatabase: () => Promise<void>;
  if (demo) {
    const embeddedPostgres = await createEmbeddedDatabase();
    database = embeddedPostgres.database;
    closeDatabase = embeddedPostgres.close;
    await applyMigrations(database);
    await seedTickets(database, configuration.SEED_REFERENCE_DATE);
  } else {
    const pool = new pg.Pool({ connectionString: configuration.DATABASE_URL, max: 10,
      connectionTimeoutMillis: 5_000, statement_timeout: 15_000, idleTimeoutMillis: 30_000 });
    pool.on('error', () => process.stderr.write('{"event":"database_connection_error"}\n'));
    database = pool;
    closeDatabase = () => pool.end();
  }
  await database.query('SELECT 1');
  const app = createApp(database, { corsOrigins: configuration.corsOrigins, accessToken: configuration.API_ACCESS_TOKEN });
  const server = app.listen(configuration.PORT, configuration.HOST, () => {
    process.stdout.write(`${JSON.stringify({ event: 'api_started', host: configuration.HOST,
      port: configuration.PORT, mode: demo ? 'demo' : 'postgresql' })}\n`);
  });
  const shutdown = () => {
    const deadline = setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => { closeDatabase().then(() => { clearTimeout(deadline); process.exitCode = 0; })
      .catch(() => { process.exitCode = 1; }); });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  server.once('error', async () => { await closeDatabase(); process.exitCode = 1;
    process.stderr.write('Não foi possível abrir a porta da API.\n'); });
}

startServer().catch(() => {
  // A configuração pode conter segredos; a mensagem de inicialização não os reproduz.
  process.stderr.write('Falha ao iniciar a API. Verifique configuração, migrations e acesso ao banco.\n');
  process.exitCode = 1;
});

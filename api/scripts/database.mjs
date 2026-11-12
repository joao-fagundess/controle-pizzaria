// Executa migrations com checksum e seed transacional no PostgreSQL configurado.
// O comando não apaga tabelas nem modifica o banco MongoDB do Thindesk.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const apiDirectory = new URL('../', import.meta.url);

export async function applyMigrations(connection) {
  // O lock da sessão serializa processos concorrentes também durante o bootstrap.
  await connection.query('SELECT pg_advisory_lock(784290113)');
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const migrationNames = (await readdir(new URL('migrations/', apiDirectory)))
      .filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
    const appliedNames = [];
    for (const migrationName of migrationNames) {
      const migrationSql = await readFile(new URL(`migrations/${migrationName}`, apiDirectory), 'utf8');
      const checksum = createHash('sha256').update(migrationSql).digest('hex');
      const appliedMigration = await connection.query(
        'SELECT checksum FROM schema_migrations WHERE name = $1', [migrationName],
      );
      if (appliedMigration.rows.length) {
        if (appliedMigration.rows[0].checksum !== checksum) {
          throw new Error(`Migration já aplicada foi alterada: ${migrationName}`);
        }
        continue;
      }
      await connection.query('BEGIN');
      try {
        await connection.query(migrationSql);
        await connection.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [migrationName, checksum]);
        await connection.query('COMMIT');
        appliedNames.push(migrationName);
      } catch (migrationError) {
        await connection.query('ROLLBACK');
        throw migrationError;
      }
    }
    return appliedNames;
  } finally {
    await connection.query('SELECT pg_advisory_unlock(784290113)');
  }
}

export async function seedTickets(connection, referenceDate) {
  if (referenceDate && (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) ||
      !Number.isFinite(Date.parse(`${referenceDate}T00:00:00Z`)) ||
      new Date(`${referenceDate}T00:00:00Z`).toISOString().slice(0, 10) !== referenceDate)) {
    throw new Error('SEED_REFERENCE_DATE deve ser uma data válida em YYYY-MM-DD.');
  }
  const ticketSeedSql = await readFile(new URL('seeds/001_demo_tickets.sql', apiDirectory), 'utf8');
  await connection.query('BEGIN');
  try {
    await connection.query("SELECT set_config('app.seed_reference_date', $1, true)", [referenceDate ?? '']);
    await connection.query(ticketSeedSql);
    await connection.query('COMMIT');
  } catch (seedError) {
    await connection.query('ROLLBACK');
    throw seedError;
  }
}

async function runDatabaseCommand() {
  const command = process.argv[2];
  if (!['migrate', 'seed'].includes(command)) throw new Error('Use migrate ou seed.');
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL antes de executar.');
  const connection = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await connection.connect();
  try {
    if (command === 'migrate') {
      const appliedNames = await applyMigrations(connection);
      process.stdout.write(`Migrations aplicadas: ${appliedNames.length}.\n`);
    } else {
      await seedTickets(connection, process.env.SEED_REFERENCE_DATE);
      process.stdout.write('Seed de demonstração aplicado, sem apagar registros existentes.\n');
    }
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runDatabaseCommand().catch((databaseError) => {
    // Não imprime a configuração de conexão, que pode conter credenciais.
    process.stderr.write(`Falha no comando de banco: ${databaseError.message}\n`);
    process.exitCode = 1;
  });
}

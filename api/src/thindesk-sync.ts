// Comando de recepção por HTTP ou export JSON local, separado das rotas de consulta.
import { readFile, stat } from 'node:fs/promises';
import pg from 'pg';
import { fetchThindeskTickets, sourceByteLimit } from './thindesk-reader.js';
import { preserveLegacyTickets } from './thindesk-import.js';
import { ThindeskError } from './thindesk-error.js';

async function synchronizeSource() {
  if (!process.env.DATABASE_URL) throw new ThindeskError('Configure DATABASE_URL.');
  const sourceFile = process.argv[2] === '--file' ? process.argv[3] : undefined;
  if (process.argv.length > 2 && (!sourceFile || process.argv.length !== 4)) {
    throw new ThindeskError('Use o comando sem argumentos ou --file caminho.json.');
  }
  let sourceTickets: unknown[];
  if (sourceFile) {
    if ((await stat(sourceFile)).size > sourceByteLimit) throw new ThindeskError('O export excede o limite de 5 MiB.');
    let exportedTickets: unknown;
    try { exportedTickets = JSON.parse((await readFile(sourceFile, 'utf8')).replace(/^\uFEFF/, '')); }
    catch { throw new ThindeskError('O export deve conter JSON válido.'); }
    if (exportedTickets && typeof exportedTickets === 'object' && 'contract_version' in exportedTickets)
      throw new ThindeskError('Use thindesk:sync:v1 para o envelope versionado; o comando atual aceita somente legados.');
    sourceTickets = Array.isArray(exportedTickets) ? exportedTickets : [exportedTickets];
  } else {
    if (!process.env.THINDESK_BASE_URL) throw new ThindeskError('Configure THINDESK_BASE_URL ou informe --file.');
    sourceTickets = await fetchThindeskTickets({ baseUrl: process.env.THINDESK_BASE_URL,
      username: process.env.THINDESK_USERNAME, password: process.env.THINDESK_PASSWORD,
      sessionCookie: process.env.THINDESK_SESSION_COOKIE });
  }
  const connection = new pg.Client({ connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000, statement_timeout: 15_000 });
  await connection.connect();
  try {
    const importReport = await preserveLegacyTickets(connection, sourceTickets);
    process.stdout.write(`${JSON.stringify(importReport)}\n`);
    if (importReport.unidentified) process.exitCode = 2;
  } finally { await connection.end(); }
}

synchronizeSource().catch((failure: unknown) => {
  // O erro da rede ou do driver pode carregar endereços e segredos; não os registra.
  process.stderr.write(failure instanceof ThindeskError ? `${failure.message}\n` :
    'Falha na recepção do Thindesk. Confira configuração, autenticação, export e acesso ao banco.\n');
  process.exitCode = 1;
});

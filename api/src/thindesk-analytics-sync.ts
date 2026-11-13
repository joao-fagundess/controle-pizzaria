// Comando explícito da versão 1.0: arquivo ou HTTP autenticado, sem escrever na origem.
import { createReadStream } from 'node:fs';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { fetchThindeskExport, sourceByteLimit } from './thindesk-reader.js';
import { receiveAnalytics } from './thindesk-analytics-import.js';
import { ThindeskError } from './thindesk-error.js';

async function readExport(path: string): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > sourceByteLimit) throw new ThindeskError('Arquivo excede 5 MiB.');
    chunks.push(bytes);
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new ThindeskError('Arquivo deve conter JSON UTF-8 válido.'); }
}
async function synchronize() {
  let options;
  try { options = parseArgs({ options: { file: { type: 'string' }, mapping: { type: 'string' } } }).values; }
  catch { throw new ThindeskError('Use --mapping tipos.json e, opcionalmente, --file export.json.'); }
  if (!options.mapping) throw new ThindeskError('Informe --mapping com o mapeamento explícito de tipos.');
  if (!process.env.DATABASE_URL) throw new ThindeskError('Configure DATABASE_URL.');
  const mapping = await readExport(options.mapping);
  if (!options.file && !process.env.THINDESK_BASE_URL) throw new ThindeskError('Configure THINDESK_BASE_URL ou informe --file.');
  const exported = options.file ? await readExport(options.file) : await fetchThindeskExport({ baseUrl: process.env.THINDESK_BASE_URL!,
    username: process.env.THINDESK_USERNAME, password: process.env.THINDESK_PASSWORD, sessionCookie: process.env.THINDESK_SESSION_COOKIE });
  const connection = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5_000, statement_timeout: 30_000 });
  await connection.connect();
  try {
    const report = await receiveAnalytics(connection, exported, mapping);
    process.stdout.write(JSON.stringify(report) + '\n');
    if (report.rejected || report.unidentified) process.exitCode = 2;
  } finally { await connection.end(); }
}
synchronize().catch((error: unknown) => {
  process.stderr.write((error instanceof ThindeskError ? error.message : 'Falha na recepção 1.0; confira configuração, export, mapeamento e banco.') + '\n');
  process.exitCode = 1;
});

// Baixa o export autenticado da origem local para transporte em arquivo, sem escrever no Java/MongoDB.
import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { fetchThindeskExport } from '../api/dist/thindesk-reader.js';
import { header } from '../api/dist/thindesk-contract.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const cache = join(root, '.cache/thindesk-homologation');
for (const path of [join(root, '.cache'), cache]) if ((await lstat(path)).isSymbolicLink()) throw new Error('Cache não pode ser um link.');
const config = parseEnv(await readFile(join(cache, '.env'), 'utf8'));
const exported = header(await fetchThindeskExport({ baseUrl: `http://127.0.0.1:${process.env.THINDESK_ANALYTICS_PORT || 8082}`,
  username: config.THINDESK_LOGIN_USERNAME, password: config.THINDESK_LOGIN_PASSWORD }));
const bytes = JSON.stringify(exported);
const temporary = join(cache, `analytics-export-${randomUUID()}.tmp`), destination = join(cache, 'analytics-export.json');
try { await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 }); await rename(temporary, destination); }
finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
console.log(JSON.stringify({ file: '.cache/thindesk-homologation/analytics-export.json', tickets: exported.tickets.length,
  sha256: createHash('sha256').update(bytes).digest('hex') }));

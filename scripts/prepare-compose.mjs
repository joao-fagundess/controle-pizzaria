// Cria credenciais aleatórias para o Compose local sem sobrescrever configuração existente.
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const configurationPath = new URL('../.env', import.meta.url);
const configuration = '# Credenciais locais geradas; não versionar este arquivo.\n' +
  `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\n` +
  `API_ACCESS_TOKEN=${randomBytes(32).toString('hex')}\n` +
  'DASHBOARD_PORT=8080\nSEED_REFERENCE_DATE=\n';
try {
  await writeFile(configurationPath, configuration, { flag: 'wx', mode: 0o600 });
  process.stdout.write('.env local criado. As credenciais não foram exibidas.\n');
} catch (failure) {
  if (failure.code !== 'EEXIST') throw failure;
  process.stdout.write('.env já existe e foi preservado.\n');
}

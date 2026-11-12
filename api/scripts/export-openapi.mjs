// Exporta o contrato servido pelo Swagger sem manter uma segunda definição manual.
import { writeFile } from 'node:fs/promises';
import { openApiDocument } from '../dist/openapi.js';

await writeFile(new URL('../../docs/openapi.json', import.meta.url), `${JSON.stringify(openApiDocument, null, 2)}\n`);
process.stdout.write('Contrato exportado para docs/openapi.json.\n');

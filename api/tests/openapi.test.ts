// Confere a estrutura do contrato publicado sem acessar referências externas.
import SwaggerParser from '@apidevtools/swagger-parser';
import { expect, it } from 'vitest';
import { openApiDocument } from '../src/openapi.js';

it('publica um OpenAPI válido com os sete endpoints e exemplos de resposta', async () => {
  const validatedContract = await SwaggerParser.validate(JSON.parse(JSON.stringify(openApiDocument)), { resolve: { external: false } });
  expect(Object.keys(validatedContract.paths ?? {})).toHaveLength(7);
  for (const endpoint of Object.values(openApiDocument.paths)) {
    expect(endpoint.get.responses[200].content['application/json'].example).toBeDefined();
  }
});

// Executa os testes TypeScript separados dos testes de migrations do Node.
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/**/*.test.ts'], fileParallelism: false,
  testTimeout: 20_000, hookTimeout: 30_000,
  coverage: { provider: 'v8', include: ['src/**/*.ts', 'scripts/database.mjs'],
    reporter: ['text-summary', 'json-summary', 'json', 'html', 'lcov'],
    reportsDirectory: '../docs/evidencias/testes/api-coverage', reportOnFailure: true } } });

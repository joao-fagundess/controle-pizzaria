// Valida a configuração antes de abrir conexões ou publicar a porta HTTP.
import { z } from 'zod';

export function readConfiguration(environment: NodeJS.ProcessEnv = process.env, demo = false) {
  const settings = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1).optional(),
    API_ACCESS_TOKEN: z.string().min(32).optional(),
    CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
    SEED_REFERENCE_DATE: z.string().optional(),
  }).safeParse(environment);
  if (!settings.success) {
    throw new Error(`Configuração inválida nos campos: ${settings.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`);
  }
  const configuration = settings.data;
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(configuration.HOST);
  if ((!loopback || configuration.NODE_ENV === 'production') && !configuration.API_ACCESS_TOKEN) {
    throw new Error('Configure API_ACCESS_TOKEN para produção ou acesso fora do computador local.');
  }
  if (demo && (!loopback || configuration.NODE_ENV === 'production')) {
    throw new Error('A demonstração embarcada está disponível somente em ambiente local de desenvolvimento.');
  }
  if (!demo && !configuration.DATABASE_URL) throw new Error('Configure DATABASE_URL.');
  const corsOrigins = configuration.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  for (const origin of corsOrigins) {
    let parsedOrigin: URL;
    try { parsedOrigin = new URL(origin); } catch { throw new Error('CORS_ORIGINS contém uma origem inválida.'); }
    if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
      throw new Error('CORS_ORIGINS aceita somente origens HTTP/HTTPS explícitas, sem caminhos.');
    }
  }
  return { ...configuration, corsOrigins };
}

// Rotas de leitura da API v1, correlação de requisições e tratamento uniforme de falhas.
import { randomUUID, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import { ApiError } from './api-error.js';
import type { TicketDatabase } from './database.js';
import { openApiDocument } from './openapi.js';
import { parseTicketQuery, selectedFilters, uuidFormat, validateCatalogFilters } from './ticket-filters.js';
import { TicketRepository } from './ticket-repository.js';

export interface RequestLog { request_id: string; method: string; path: string; status: number;
  duration_ms: number; error_code?: string; database_code?: string }
interface ApplicationOptions { corsOrigins?: string[]; accessToken?: string; log?: (entry: RequestLog) => void }

export function createApp(database: TicketDatabase, options: ApplicationOptions = {}) {
  const app = express();
  const ticketRepository = new TicketRepository(database);
  const publishedContract = { ...openApiDocument, security: options.accessToken ? [{ bearerAuth: [] }] : [] };
  const log = options.log ?? ((entry: RequestLog) => process.stdout.write(`${JSON.stringify(entry)}\n`));
  const origins = options.corsOrigins ?? ['http://localhost:5173', 'http://127.0.0.1:5173'];
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use((request, response, next) => {
    const startedAt = performance.now();
    response.locals.requestId = randomUUID();
    response.set({ 'X-Request-Id': response.locals.requestId, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    response.on('finish', () => log({ request_id: response.locals.requestId, method: request.method,
      path: request.path, status: response.statusCode, duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
      ...(response.locals.errorCode ? { error_code: response.locals.errorCode } : {}),
      ...(response.locals.databaseCode ? { database_code: response.locals.databaseCode } : {}) }));
    next();
  });
  app.use(cors({ exposedHeaders: ['X-Request-Id'], methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'], origin(origin, approve) {
      if (!origin || origins.includes(origin)) approve(null, true);
      else approve(new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Origem de acesso não permitida.'));
    } }));

  app.get('/health', async (_request, response) => {
    await database.query('SELECT 1');
    response.json({ status: 'ready' });
  });
  app.get('/docs/openapi.json', (_request, response) => response.json(publishedContract));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(publishedContract, { customSiteTitle: 'API de chamados técnicos' }));

  app.use('/api/v1', (request, _response, next) => {
    if (options.accessToken) {
      const suppliedToken = request.headers.authorization?.startsWith('Bearer ') ?
        request.headers.authorization.slice(7) : '';
      const configuredToken = Buffer.from(options.accessToken);
      const providedToken = Buffer.from(suppliedToken);
      if (configuredToken.length !== providedToken.length || !timingSafeEqual(configuredToken, providedToken)) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Autenticação necessária para consultar a API.');
      }
    }
    next();
  });

  function metadata(response: express.Response, basis: string | null, filters?: ReturnType<typeof selectedFilters>) {
    return { request_id: response.locals.requestId, generated_at: new Date().toISOString(),
      time_zone: 'America/Sao_Paulo', period_basis: basis, ...(filters ? { filters } : {}) };
  }

  app.get('/api/v1/dashboard/summary', async (request, response) => {
    const query = parseTicketQuery(request.query, 'summary');
    await validateCatalogFilters(database, query);
    const [summary, sourceQuality] = await Promise.all([ticketRepository.summary(query), ticketRepository.sourceQuality()]);
    response.json({ summary, meta: { ...metadata(response, 'created_at', selectedFilters(query)), source_quality: sourceQuality } });
  });
  app.get('/api/v1/dashboard/tickets-by-period', async (request, response) => {
    const query = parseTicketQuery(request.query, 'periods');
    await validateCatalogFilters(database, query);
    response.json({ periods: await ticketRepository.ticketsByPeriod(query), group_by: query.group_by,
      meta: metadata(response, 'resolved_at', selectedFilters(query)) });
  });
  app.get('/api/v1/dashboard/status-distribution', async (request, response) => {
    const query = parseTicketQuery(request.query, 'summary');
    await validateCatalogFilters(database, query);
    response.json({ statuses: await ticketRepository.statusDistribution(query),
      meta: metadata(response, 'created_at', selectedFilters(query)) });
  });
  app.get('/api/v1/dashboard/top-ticket-types', async (request, response) => {
    const query = parseTicketQuery(request.query, 'ranking');
    await validateCatalogFilters(database, query);
    response.json({ types: await ticketRepository.topTicketTypes(query), limit: query.limit,
      meta: metadata(response, 'resolved_at', selectedFilters(query)) });
  });
  app.get('/api/v1/tickets', async (request, response) => {
    const query = parseTicketQuery(request.query, 'tickets');
    await validateCatalogFilters(database, query);
    response.json({ ...await ticketRepository.listTickets(query), sort_by: query.sort_by, sort_order: query.sort_order,
      meta: metadata(response, 'created_at', selectedFilters(query)) });
  });
  app.get('/api/v1/tickets/:id', async (request, response) => {
    parseTicketQuery(request.query, 'none');
    const ticketId = String(request.params.id);
    if (!uuidFormat.test(ticketId)) throw new ApiError(400, 'MALFORMED_ID', 'O identificador do chamado deve ser um UUID.');
    response.json({ ...await ticketRepository.ticketDetail(ticketId), meta: metadata(response, null) });
  });
  app.get('/api/v1/filters/options', async (request, response) => {
    parseTicketQuery(request.query, 'none');
    response.json({ options: await ticketRepository.filterOptions(), meta: metadata(response, null) });
  });
  app.use((_request, _response) => { throw new ApiError(404, 'ROUTE_NOT_FOUND', 'Rota não encontrada.'); });

  const respondToError: ErrorRequestHandler = (failure: unknown, _request, response, _next) => {
    const knownFailure = failure instanceof ApiError ? failure :
      new ApiError(500, 'INTERNAL_ERROR', 'Não foi possível concluir a consulta. Tente novamente.');
    response.locals.errorCode = knownFailure.code;
    if (failure && typeof failure === 'object' && 'code' in failure && /^[A-Z0-9]{5}$/.test(String(failure.code))) {
      response.locals.databaseCode = String(failure.code);
    }
    if (knownFailure.status === 401) response.set('WWW-Authenticate', 'Bearer');
    response.status(knownFailure.status).json({ error: { code: knownFailure.code, message: knownFailure.message,
      details: knownFailure.details } });
  };
  app.use(respondToError);
  return app;
}

// Contrato OpenAPI servido pelo Swagger e exportado para a documentação da entrega.
// Os exemplos usam dados fictícios e deixam explícita a base temporal das consultas.
import { groupCodes, priorityCodes, sortCodes, statusCodes, uuidFormat } from './ticket-filters.js';

type Schema = Record<string, unknown>;
const reference = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const objectSchema = (properties: Record<string, Schema>, required = Object.keys(properties)) =>
  ({ type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false });
const arraySchema = (items: Schema) => ({ type: 'array', items });
const stringSchema = { type: 'string' };
const integerSchema = { type: 'integer', minimum: 0 };
const uuidSchema = { type: 'string', pattern: uuidFormat.source, description: 'UUID textual do PostgreSQL em formato 8-4-4-4-12.' };
const timestampSchema = { type: 'string', format: 'date-time' };
const nullable = (schema: Schema) => ({ ...schema, nullable: true });
const countOption = objectSchema({ code: stringSchema, name: stringSchema });
const personReference = nullable(objectSchema({ id: uuidSchema, name: nullable(stringSchema) }));
const technicalNoteSchema = objectSchema({ id: uuidSchema, content: stringSchema, created_at: timestampSchema, author: personReference });
const filterProperties = { start_date: { type: 'string', format: 'date' }, end_date: { type: 'string', format: 'date' },
  status: { type: 'string', enum: statusCodes }, type_id: uuidSchema, priority: { type: 'string', enum: priorityCodes }, assignee_id: uuidSchema };
const schemas: Record<string, Schema> = {
  Error: objectSchema({ error: objectSchema({ code: stringSchema, message: stringSchema,
    details: arraySchema({ type: 'object', additionalProperties: true }) }) }),
  Meta: objectSchema({ request_id: uuidSchema, generated_at: timestampSchema,
    time_zone: { type: 'string', enum: ['America/Sao_Paulo'] },
    period_basis: { type: 'string', enum: ['created_at', 'resolved_at', null], nullable: true },
    filters: objectSchema(filterProperties, []), source_quality: reference('SourceQuality') },
  ['request_id', 'generated_at', 'time_zone', 'period_basis']),
  SourceQuality: objectSchema({ received: integerSchema, rejected: integerSchema, pending: integerSchema,
    linked: integerSchema, last_received_at: nullable(timestampSchema),
    mode: { type: 'string', enum: ['empty', 'demo', 'operational', 'mixed'] } }),
  Summary: objectSchema({ total: integerSchema, open: integerSchema, in_progress: integerSchema,
    waiting: integerSchema, resolved: integerSchema,
    average_resolution_seconds: { type: 'number', minimum: 0, nullable: true },
    resolution_rate: { type: 'number', minimum: 0, maximum: 100, nullable: true } }),
  TechnicalNote: technicalNoteSchema,
  HistoryEvent: objectSchema({ id: uuidSchema, event_type: { type: 'string', enum: ['created', 'status_changed',
    'assignee_changed', 'type_changed', 'priority_changed'] }, occurred_at: timestampSchema,
    author: personReference, previous_value: { description: 'Valor JSON anterior; null quando não há valor anterior.' }, new_value: {} }),
  Ticket: objectSchema({ id: uuidSchema, title: stringSchema, description: stringSchema,
    status: countOption, type: objectSchema({ id: uuidSchema, code: stringSchema, name: stringSchema }),
    priority: countOption, assignee: personReference,
    requester: objectSchema({ id: uuidSchema, name: stringSchema, department: nullable(stringSchema) }),
    created_at: timestampSchema, updated_at: timestampSchema, resolved_at: nullable(timestampSchema),
    source: nullable(objectSchema({ system: stringSchema, external_id: stringSchema })),
    latest_technical_note: nullable(technicalNoteSchema) }),
  Pagination: objectSchema({ page: { type: 'integer', minimum: 1 }, page_size: { type: 'integer', minimum: 1, maximum: 100 },
    total: integerSchema, total_pages: integerSchema }),
  SummaryResponse: objectSchema({ summary: reference('Summary'), meta: reference('Meta') }),
  PeriodsResponse: objectSchema({ periods: arraySchema(objectSchema({ period_start: { type: 'string', format: 'date' },
    tickets: integerSchema })), group_by: { type: 'string', enum: groupCodes }, meta: reference('Meta') }),
  StatusResponse: objectSchema({ statuses: arraySchema(objectSchema({ code: stringSchema, name: stringSchema,
    tickets: integerSchema })), meta: reference('Meta') }),
  RankingResponse: objectSchema({ types: arraySchema(objectSchema({ id: uuidSchema, code: stringSchema,
    name: stringSchema, tickets: integerSchema })), limit: { type: 'integer', minimum: 1, maximum: 20 }, meta: reference('Meta') }),
  TicketsResponse: objectSchema({ tickets: arraySchema(reference('Ticket')), pagination: reference('Pagination'),
    sort_by: { type: 'string', enum: sortCodes }, sort_order: { type: 'string', enum: ['asc', 'desc'] }, meta: reference('Meta') }),
  DetailResponse: objectSchema({ ticket: reference('Ticket'), technical_notes: arraySchema(reference('TechnicalNote')),
    history: arraySchema(reference('HistoryEvent')), meta: reference('Meta') }),
  OptionsResponse: objectSchema({ options: objectSchema({ statuses: arraySchema(countOption),
    types: arraySchema(objectSchema({ id: uuidSchema, code: stringSchema, name: stringSchema, active: { type: 'boolean' } })),
    priorities: arraySchema(objectSchema({ code: stringSchema, name: stringSchema, severity: { type: 'integer', minimum: 1, maximum: 4 } })),
    assignees: arraySchema(objectSchema({ id: uuidSchema, name: stringSchema, active: { type: 'boolean' } })) }), meta: reference('Meta') }),
};

const filterDescriptions: Record<string, string> = {
  start_date: 'Início inclusivo no fuso America/Sao_Paulo. Informar junto de end_date; omitir ambos consulta todo o histórico.',
  end_date: 'Fim inclusivo: consulta usa o início do dia seguinte como limite exclusivo.',
  status: 'Status atual. Nas consultas de conclusões, status não concluído produz zero atendimentos.',
  type_id: 'UUID de um tipo existente, inclusive inativo se já utilizado.',
  priority: 'Prioridade atual.', assignee_id: 'UUID de um técnico existente.',
};
const commonParameters = Object.entries(filterProperties).map(([name, schema]) =>
  ({ in: 'query', name, required: false, description: filterDescriptions[name], schema }));
const queryParameter = (name: string, schema: Schema, description: string) => ({ in: 'query', name, required: false, schema, description });
const metaExample = { request_id: '10000000-0000-4000-8000-000000000001', generated_at: '2026-11-11T18:00:00.000Z',
  time_zone: 'America/Sao_Paulo', period_basis: 'created_at', filters: {} };
const ticketExample = { id: '10000000-0000-4000-8000-000000000002', title: 'Impressora da recepção não imprime',
  description: 'Impressora da recepção sem comunicação com a estação.', status: { code: 'open', name: 'Aberto' },
  type: { id: '10000000-0000-4000-8000-000000000003', code: 'printing', name: 'Impressão' },
  priority: { code: 'normal', name: 'Normal' }, assignee: null,
  requester: { id: '10000000-0000-4000-8000-000000000004', name: 'Ana Paula Ribeiro', department: 'Recepção' },
  created_at: '2026-11-11T12:00:00.000Z', updated_at: '2026-11-11T12:00:00.000Z', resolved_at: null,
  source: { system: 'demo', external_id: 'ticket-1' }, latest_technical_note: null };

function operation(operationId: string, summary: string, description: string, responseSchema: string,
  parameters: unknown[], example: unknown) {
  const errorResponses = Object.fromEntries(Object.entries({
    400: ['MALFORMED_QUERY', 'Formato de consulta inválido.'],
    401: ['UNAUTHORIZED', 'Autenticação necessária para consultar a API.'],
    403: ['ORIGIN_NOT_ALLOWED', 'Origem de acesso não permitida.'],
    404: ['TICKET_NOT_FOUND', 'Chamado não encontrado.'],
    422: ['INVALID_QUERY', 'Os parâmetros de consulta precisam de correção.'],
    500: ['INTERNAL_ERROR', 'Não foi possível concluir a consulta. Tente novamente.'],
  }).filter(([status]) => status !== '404' || operationId === 'ticketDetail').map(([status, [code, message]]) =>
    [status, { description: message, content: { 'application/json': { schema: reference('Error'),
      example: { error: { code, message, details: [] } } } } }]));
  return { operationId, summary, description, parameters,
    responses: { 200: { description: 'Consulta concluída.', headers: { 'X-Request-Id': { schema: uuidSchema,
      description: 'Identificador gerado no servidor para correlação com os logs.' } },
    content: { 'application/json': { schema: reference(responseSchema), example } } }, ...errorResponses } };
}

export const openApiDocument = {
  openapi: '3.0.3', info: { title: 'API do dashboard de chamados técnicos', version: '1.0.0',
    description: 'API de leitura de helpdesk. Instantes em UTC/ISO 8601; filtros no fuso America/Sao_Paulo. ' +
      'Indicadores e lista usam criação; série e ranking usam resolução vigente. Os filtros de dimensões usam valores atuais. ' +
      'Bearer é exigido quando API_ACCESS_TOKEN está configurado; o desenvolvimento restrito ao loopback pode operar sem token. ' +
      'O conector legado preserva dados incompletos fora dos indicadores; o resumo informa a qualidade global da origem.' },
  servers: [{ url: '/', description: 'Mesmo servidor da documentação' }],
  security: [{ bearerAuth: [] }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'Token de acesso configurado no servidor ou injetado pelo gateway.' } }, schemas },
  paths: {
    '/api/v1/dashboard/summary': { get: operation('dashboardSummary', 'Indicadores gerais',
      'População pela criação. Resolvidos inclui fechados. Média em segundos corridos, sem arredondamento. ' +
      'Sem população, taxa é null; sem conclusões, média é null. source_quality é global, não recebe os filtros.',
      'SummaryResponse', commonParameters, { summary: { total: 3, open: 1, in_progress: 0, waiting: 0, resolved: 2,
        average_resolution_seconds: 14400, resolution_rate: 66.66666666666667 }, meta: { ...metaExample,
        source_quality: { received: 0, rejected: 0, pending: 0, linked: 0, last_received_at: null, mode: 'demo' } } }) },
    '/api/v1/dashboard/tickets-by-period': { get: operation('ticketsByPeriod', 'Conclusões por período',
      'Agrupa resolução vigente. Semanas começam na segunda-feira; inclui intervalos com zero. ' +
      'Sem datas usa a menor e a maior resolução selecionada; sem conclusões e sem datas devolve lista vazia. ' +
      'Reabrir remove a conclusão anterior desta série; isto não é uma contagem histórica de eventos.',
      'PeriodsResponse', [...commonParameters, queryParameter('group_by', { type: 'string', enum: groupCodes, default: 'day' }, 'Agrupamento de calendário local.')],
      { periods: [{ period_start: '2026-11-11', tickets: 2 }], group_by: 'day', meta: { ...metaExample, period_basis: 'resolved_at' } }) },
    '/api/v1/dashboard/status-distribution': { get: operation('statusDistribution', 'Distribuição por status atual',
      'Usa a data de criação. Retorna todos os status, inclusive aqueles com contagem zero.', 'StatusResponse', commonParameters,
      { statuses: [{ code: 'open', name: 'Aberto', tickets: 1 }, { code: 'in_progress', name: 'Em andamento', tickets: 0 },
        { code: 'waiting', name: 'Em espera', tickets: 0 }, { code: 'resolved', name: 'Resolvido', tickets: 1 },
        { code: 'closed', name: 'Fechado', tickets: 1 }], meta: metaExample }) },
    '/api/v1/dashboard/top-ticket-types': { get: operation('topTicketTypes', 'Tipos mais atendidos',
      'Somente concluídos, pela resolução vigente. Desempata por nome em collation C e depois UUID; omite tipos com zero.',
      'RankingResponse', [...commonParameters, queryParameter('limit', { type: 'integer', minimum: 1, maximum: 20, default: 5 }, 'Quantidade máxima de tipos.')],
      { types: [{ ...ticketExample.type, tickets: 2 }], limit: 5, meta: { ...metaExample, period_basis: 'resolved_at' } }) },
    '/api/v1/tickets': { get: operation('listTickets', 'Listagem paginada de chamados',
      'Filtra criação. Última nota não multiplica linhas. Prioridade ordena por severidade; nulos ficam por último. ' +
      'UUID desempata na mesma direção. Página além do fim retorna lista vazia com total preservado.', 'TicketsResponse', [...commonParameters,
      queryParameter('page', { type: 'integer', minimum: 1, default: 1 }, 'Número da página; produto do deslocamento deve ser inteiro seguro.'),
      queryParameter('page_size', { type: 'integer', minimum: 1, maximum: 100, default: 25 }, 'Tamanho da página.'),
      queryParameter('sort_by', { type: 'string', enum: sortCodes, default: 'created_at' }, 'Campo permitido para ordenação.'),
      queryParameter('sort_order', { type: 'string', enum: ['asc', 'desc'], default: 'desc' }, 'Direção da ordenação.')],
    { tickets: [ticketExample], pagination: { page: 1, page_size: 25, total: 1, total_pages: 1 },
      sort_by: 'created_at', sort_order: 'desc', meta: metaExample }) },
    '/api/v1/tickets/{id}': { get: operation('ticketDetail', 'Detalhe de um chamado',
      'Retorna notas e histórico em ordem cronológica, com UUID como desempate. Autor ausente é null. Não aceita filtros de consulta.',
      'DetailResponse', [{ in: 'path', name: 'id', required: true, schema: uuidSchema, description: 'UUID local do chamado, não o identificador MongoDB.' }],
      { ticket: ticketExample, technical_notes: [], history: [], meta: { ...metaExample, period_basis: null } }) },
    '/api/v1/filters/options': { get: operation('filterOptions', 'Opções dos filtros',
      'Não aceita filtros de consulta. Inclui técnicos e tipos ativos e inativos já referenciados por chamados.', 'OptionsResponse', [],
      { options: { statuses: [{ code: 'open', name: 'Aberto' }], types: [{ ...ticketExample.type, active: true }],
        priorities: [{ code: 'normal', name: 'Normal', severity: 2 }], assignees: [] }, meta: { ...metaExample, period_basis: null } }) },
  },
};

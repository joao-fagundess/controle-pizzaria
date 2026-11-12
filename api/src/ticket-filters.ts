// Valida o formato dos parâmetros e separa erros de sintaxe das regras de consulta.
import { z } from 'zod';
import { ApiError } from './api-error.js';
import type { TicketDatabase } from './database.js';

export const statusCodes = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;
export const priorityCodes = ['low', 'normal', 'high', 'urgent'] as const;
export const groupCodes = ['day', 'week', 'month'] as const;
export const sortCodes = ['created_at', 'updated_at', 'resolved_at', 'priority'] as const;
export const uuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFormat = /^\d{4}-\d{2}-\d{2}$/;

export interface TicketFilters {
  start_date?: string;
  end_date?: string;
  status?: string;
  type_id?: string;
  priority?: string;
  assignee_id?: string;
}
export interface TicketQuery extends TicketFilters {
  group_by: 'day' | 'week' | 'month';
  limit: number;
  page: number;
  page_size: number;
  sort_by: typeof sortCodes[number];
  sort_order: 'asc' | 'desc';
}

type QueryPurpose = 'summary' | 'periods' | 'ranking' | 'tickets' | 'none';
const textParameter = z.string({ error: 'Informe um único valor textual.' });
const queryFields = {
  start_date: textParameter.regex(dateFormat, 'Use YYYY-MM-DD.').optional(),
  end_date: textParameter.regex(dateFormat, 'Use YYYY-MM-DD.').optional(),
  status: textParameter.optional(),
  type_id: textParameter.regex(uuidFormat, 'Informe um UUID válido.').optional(),
  priority: textParameter.optional(),
  assignee_id: textParameter.regex(uuidFormat, 'Informe um UUID válido.').optional(),
};
const integerParameter = textParameter.regex(/^\d+$/, 'Informe um número inteiro positivo.');

function validCalendarDate(calendarDate: string): boolean {
  const timestamp = Date.parse(`${calendarDate}T00:00:00Z`);
  return !calendarDate.startsWith('0000') && Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === calendarDate;
}

function semanticError(field: string, message: string): never {
  throw new ApiError(422, 'INVALID_QUERY', 'Os parâmetros de consulta precisam de correção.', [{ field, message }]);
}

export function parseTicketQuery(rawQuery: unknown, purpose: QueryPurpose): TicketQuery {
  const extraFields = purpose === 'periods' ? { group_by: textParameter.optional() } :
    purpose === 'ranking' ? { limit: integerParameter.optional() } :
      purpose === 'tickets' ? { page: integerParameter.optional(), page_size: integerParameter.optional(),
        sort_by: textParameter.optional(), sort_order: textParameter.optional() } : {};
  const parsedQuery = z.strictObject({ ...(purpose === 'none' ? {} : queryFields), ...extraFields }).safeParse(rawQuery);
  if (!parsedQuery.success) {
    throw new ApiError(400, 'MALFORMED_QUERY', 'Formato de consulta inválido.', parsedQuery.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'query',
      message: issue.code === 'unrecognized_keys' ? 'Há parâmetros não permitidos nesta rota.' : issue.message,
    })));
  }
  const query = parsedQuery.data as Record<string, string | undefined>;
  for (const field of ['start_date', 'end_date'] as const) {
    if (query[field] && !validCalendarDate(query[field])) semanticError(field, 'A data não existe no calendário.');
  }
  if (Boolean(query.start_date) !== Boolean(query.end_date)) semanticError('period', 'Informe início e fim juntos.');
  if (query.start_date && query.end_date && query.start_date > query.end_date) {
    semanticError('period', 'O início deve ser anterior ou igual ao fim.');
  }
  for (const [field, allowed] of Object.entries({ status: statusCodes, priority: priorityCodes,
    group_by: groupCodes, sort_by: sortCodes, sort_order: ['asc', 'desc'] })) {
    if (query[field] !== undefined && !(allowed as readonly string[]).includes(query[field]!)) {
      semanticError(field, `Valores permitidos: ${allowed.join(', ')}.`);
    }
  }
  const numericValues = { page: Number(query.page ?? 1), page_size: Number(query.page_size ?? 25), limit: Number(query.limit ?? 5) };
  for (const [field, maximum] of Object.entries({ page: Number.MAX_SAFE_INTEGER, page_size: 100, limit: 20 })) {
    const numericValue = numericValues[field as keyof typeof numericValues];
    if (!Number.isSafeInteger(numericValue) || numericValue < 1 || numericValue > maximum) {
      semanticError(field, `Informe um inteiro entre 1 e ${maximum}.`);
    }
  }
  if (!Number.isSafeInteger((numericValues.page - 1) * numericValues.page_size)) {
    semanticError('page', 'A combinação de página e tamanho excede o limite de consulta.');
  }
  return { start_date: query.start_date, end_date: query.end_date, status: query.status,
    type_id: query.type_id?.toLowerCase(), priority: query.priority, assignee_id: query.assignee_id?.toLowerCase(),
    ...numericValues, group_by: (query.group_by ?? 'day') as TicketQuery['group_by'],
    sort_by: (query.sort_by ?? 'created_at') as TicketQuery['sort_by'], sort_order: (query.sort_order ?? 'desc') as 'asc' | 'desc' };
}

export async function validateCatalogFilters(database: TicketDatabase, filters: TicketFilters): Promise<void> {
  if (!filters.type_id && !filters.assignee_id) return;
  const catalogMatches = await database.query<{ type_exists: boolean; assignee_exists: boolean }>(`
    SELECT ($1::uuid IS NULL OR EXISTS (SELECT 1 FROM ticket_types WHERE id = $1)) AS type_exists,
      ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM users WHERE id = $2 AND role = 'technician')) AS assignee_exists`,
  [filters.type_id ?? null, filters.assignee_id ?? null]);
  if (!catalogMatches.rows[0].type_exists) semanticError('type_id', 'Tipo de chamado não encontrado.');
  if (!catalogMatches.rows[0].assignee_exists) semanticError('assignee_id', 'Técnico não encontrado.');
}

export function selectedFilters(query: TicketFilters): TicketFilters {
  return { start_date: query.start_date, end_date: query.end_date, status: query.status,
    type_id: query.type_id, priority: query.priority, assignee_id: query.assignee_id };
}

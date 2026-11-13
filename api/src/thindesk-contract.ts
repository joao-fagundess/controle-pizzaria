// Valida o contrato 1.0 sem coerção e compara versões com precisão de nanossegundos.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { ThindeskError } from './thindesk-error.js';

export type Coverage = 'complete' | 'partial' | 'unavailable';
export interface Staff { external_id: string; name: string; role: 'technician' | 'supervisor'; active: boolean }
export interface Requester { external_id: string; name: string; department?: string | null }
export interface SourceType { external_id: string; name: string }
export interface SourceNote { external_id: string; author: Staff | null; content: string; created_at: string }
export interface SourceEvent { external_id: string; sequence: number; event_type: string; author: Staff | null;
  occurred_at: string; previous_value: unknown; new_value: unknown }
export interface AnalyticsTicket { external_id: string; title: string; title_is_derived: boolean; description: string;
  status: string; priority: string; type: SourceType; requester: Requester; assignee: Staff | null;
  created_at: string; updated_at: string; resolved_at: string | null;
  history: { coverage: Coverage; items: SourceEvent[] }; technical_notes: { coverage: Coverage; items: SourceNote[] } }
export interface Envelope { contract_version: '1.0'; source_system: 'thindesk'; exported_at: string; tickets: unknown[] }
export type Profile = Staff | Requester | SourceType;
export type CatalogKind = 'staff' | 'requester' | 'type';
const schema = JSON.parse(readFileSync(new URL('../contracts/thindesk-analytics-v1.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const formats = createRequire(import.meta.url)('ajv-formats') as import('ajv-formats').FormatsPlugin;
formats(ajv, { mode: 'full' });
ajv.addSchema(schema);
export const validTicket = ajv.compile<AnalyticsTicket>({ $ref: `${schema.$id}#/$defs/ticket` });
const validHeader = ajv.compile<Envelope>({ ...schema, $id: `${schema.$id}:header`,
  properties: { ...schema.properties, tickets: { type: 'array' } } });
export function header(value: unknown): Envelope {
  if (!validHeader(value)) throw new ThindeskError('Envelope inválido: exige contrato 1.0, origem thindesk e campos previstos.');
  instant(value.exported_at);
  return value;
}
export function identity(value: unknown): value is string {
  return typeof value === 'string' && [...value].length > 0 && [...value].length <= 256 && !/[\s\u0000-\u001f\u007f]/u.test(value);
}
export function unsupportedText(value: unknown): boolean {
  if (typeof value === 'string') return /[\u0000\uD800-\uDFFF]/u.test(value);
  if (Array.isArray(value)) return value.some(unsupportedText);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, entry]) => unsupportedText(key) || unsupportedText(entry));
  return false;
}
export function instant(value: string): bigint {
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1] ?? '';
  const seconds = Date.parse(value.replace(/\.\d+(?=Z|[+-]\d\d:\d\d$)/, ''));
  if (!Number.isFinite(seconds) || fraction.length > 9 || value.startsWith('0000'))
    throw new ThindeskError('Instante inválido ou precisão superior a nanossegundos.');
  return BigInt(seconds) * 1_000_000n + BigInt(fraction.padEnd(9, '0'));
}
export const sqlInstant = (value: string | null) => value === null ? null : value.replace(/\.(\d{6})\d+(?=Z|[+-]\d\d:\d\d$)/, '.$1');
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function profiles(ticket: AnalyticsTicket): [CatalogKind, Profile][] {
  return [['type', ticket.type], ['requester', { ...ticket.requester, department: ticket.requester.department ?? null }],
    ...[ticket.assignee, ...ticket.history.items.map(event => event.author), ...ticket.technical_notes.items.map(note => note.author)]
      .filter((staff): staff is Staff => staff !== null).map(staff => ['staff', staff] as [CatalogKind, Profile])];
}
export function normalized(ticket: AnalyticsTicket): unknown {
  const value = structuredClone(ticket);
  value.requester.department ??= null;
  value.history.items.sort((a, b) => a.sequence - b.sequence);
  value.technical_notes.items.sort((a, b) => a.external_id < b.external_id ? -1 : a.external_id > b.external_id ? 1 : 0);
  // A representação normalizada é interna; o payload recebido permanece preservado.
  const walk = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(walk);
    if (entry && typeof entry === 'object') return Object.fromEntries(Object.entries(entry).map(([key, item]) =>
      [key, /^(created_at|updated_at|resolved_at|occurred_at)$/.test(key) && typeof item === 'string' ? instant(item).toString() : walk(item)]));
    return entry;
  };
  return walk(value);
}
export function fact(value: SourceNote | SourceEvent): string {
  const { author, ...fields } = value;
  const dateKey = 'created_at' in value ? 'created_at' : 'occurred_at';
  return stable({ ...fields, [dateKey]: instant('created_at' in value ? value.created_at : value.occurred_at).toString(), author: author?.external_id ?? null });
}

export function semanticIssues(ticket: AnalyticsTicket, exportedAt: string, knownStaff: Set<string>, mappedTypes: Set<string>): string[] {
  const issues: string[] = [];
  const issue = (condition: boolean, message: string) => { if (!condition) issues.push(message); };
  try {
    const created = instant(ticket.created_at), updated = instant(ticket.updated_at);
    issue(created <= updated && updated <= instant(exportedAt), 'chronology: criação ≤ atualização ≤ exportação');
    if (ticket.resolved_at) issue(created <= instant(ticket.resolved_at) && instant(ticket.resolved_at) <= updated, 'resolved_at: fora da vida do chamado');
    const events = [...ticket.history.items].sort((a, b) => a.sequence - b.sequence);
    for (const [name, items] of [['history', events], ['technical_notes', ticket.technical_notes.items]] as const) {
      issue(new Set(items.map(item => item.external_id)).size === items.length, `${name}: identidades duplicadas`);
      for (const item of items) {
        const time = instant('occurred_at' in item ? item.occurred_at : item.created_at);
        issue(created <= time && time <= updated, `${name}: instante fora da vida do chamado`);
      }
    }
    issue(new Set(events.map(event => event.sequence)).size === events.length, 'history: sequências duplicadas');
    issue(events.every(event => Number.isSafeInteger(event.sequence)), 'history: sequência fora da precisão inteira suportada');
    issue(events.filter(event => event.event_type === 'created').length <= 1, 'history: mais de uma criação');
    const state: Record<string, unknown> = {};
    let resolution: bigint | null = null;
    const completed = (value: unknown) => value === 'resolved' || value === 'closed';
    const checkReference = (field: string, value: unknown) => {
      if (field === 'type_external_id') issue(typeof value === 'string' && mappedTypes.has(value), 'history: tipo sem mapeamento');
      if (field === 'assignee_external_id' && value !== null) issue(typeof value === 'string' && knownStaff.has(value), 'history: técnico sem identidade resolvida');
    };
    for (const [index, event] of events.entries()) {
      const time = instant(event.occurred_at), previous = events[index - 1];
      if (previous) issue(instant(previous.occurred_at) <= time, 'history: ordem temporal incoerente');
      if (ticket.history.coverage === 'complete') issue(event.sequence === index + 1, 'history: sequência completa exige início 1 e nenhuma lacuna');
      else if (previous && event.sequence !== previous.sequence + 1) for (const key of Object.keys(state)) delete state[key];
      if (event.event_type === 'created') {
        issue(event.sequence === 1 && index === 0 && time === created, 'history: criação exige sequência 1 e instante original');
        Object.assign(state, event.new_value);
        checkReference('type_external_id', state.type_external_id); checkReference('assignee_external_id', state.assignee_external_id);
        resolution = completed(state.status) ? time : null;
      } else {
        const field = ({ status_changed: 'status', priority_changed: 'priority', type_changed: 'type_external_id', assignee_changed: 'assignee_external_id' } as Record<string, string>)[event.event_type];
        issue(!Object.hasOwn(state, field) || stable(state[field]) === stable(event.previous_value), 'history: valor anterior contradiz a sequência');
        issue(stable(event.previous_value) !== stable(event.new_value), 'history: movimento sem alteração');
        checkReference(field, event.previous_value); checkReference(field, event.new_value);
        if (field === 'status') {
          if (!completed(event.new_value)) resolution = null;
          else if (!completed(event.previous_value)) resolution = time;
        }
        state[field] = event.new_value;
      }
    }
    if (ticket.history.coverage === 'complete') {
      issue(stable(state) === stable({ status: ticket.status, priority: ticket.priority,
        type_external_id: ticket.type.external_id, assignee_external_id: ticket.assignee?.external_id ?? null }), 'history: estado final diverge do snapshot');
      issue(resolution === (ticket.resolved_at ? instant(ticket.resolved_at) : null), 'history: resolução vigente incoerente');
    }
  } catch (error) { issues.push(error instanceof ThindeskError ? error.message : 'history: valores inválidos'); }
  return [...new Set(issues)];
}

// Dados fictícios de origem com fatos completos para testar recepção, versões e resolução.
import type { AnalyticsTicket } from '../src/thindesk-contract.js';
export const mapping = { contract_version: '1.0', types: { 'source-printing': 'printing', 'source-network': 'network' } };
export function ticket(id = 'ticket-v1'): AnalyticsTicket {
  const staff = { external_id: 'tech-v1', name: 'Técnico Fictício', role: 'technician' as const, active: true };
  return { external_id: id, title: 'Impressora de homologação', title_is_derived: false, description: 'Descrição fictícia do chamado.',
    status: 'open', priority: 'normal', type: { external_id: 'source-printing', name: 'Impressão' },
    requester: { external_id: 'requester-v1', name: 'Solicitante Fictício', department: null }, assignee: staff,
    created_at: '2026-11-10T10:00:00.123456789Z', updated_at: '2026-11-10T10:00:00.123456789Z', resolved_at: null,
    history: { coverage: 'complete', items: [{ external_id: 'event-1', sequence: 1, event_type: 'created', author: staff,
      occurred_at: '2026-11-10T10:00:00.123456789Z', previous_value: null,
      new_value: { status: 'open', priority: 'normal', type_external_id: 'source-printing', assignee_external_id: 'tech-v1' } }] },
    technical_notes: { coverage: 'complete', items: [] } };
}
export const envelope = (...tickets: unknown[]) => ({ contract_version: '1.0', source_system: 'thindesk', exported_at: '2026-11-13T12:00:00Z', tickets });
export function changeStatus(value: AnalyticsTicket, status: string, at: string) {
  const old = value.status, completed = (status: string) => ['resolved', 'closed'].includes(status);
  value.history.items.push({ external_id: `event-${value.history.items.length + 1}`, sequence: value.history.items.length + 1,
    event_type: 'status_changed', author: value.history.items[0].author, occurred_at: at, previous_value: old, new_value: status });
  value.status = status; value.updated_at = at;
  value.resolved_at = completed(status) ? completed(old) ? value.resolved_at : at : null;
  return value;
}
export function addNote(value: AnalyticsTicket, at = '2026-11-10T12:00:00Z') {
  value.updated_at = at;
  value.technical_notes.items.push({ external_id: `note-${value.technical_notes.items.length + 1}`,
    author: value.history.items[0].author, content: 'Observação técnica fictícia.', created_at: at });
  return value;
}

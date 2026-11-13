// Preserva o contrato legado sem fabricar os campos analíticos ausentes na origem.
// Esta recepção continua exclusiva do legado e não promove registros para tickets.
import type { TicketDatabase } from './database.js';
import { ThindeskError } from './thindesk-error.js';

export function normalizeLegacyStatus(status: unknown): string | null {
  if (typeof status !== 'string') return null;
  const normalizedStatus = status.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const statusMapping: Record<string, string> = { aberto: 'open', em_andamento: 'in_progress',
    'em andamento': 'in_progress', concluido: 'resolved' };
  return Object.hasOwn(statusMapping, normalizedStatus) ? statusMapping[normalizedStatus] : null;
}

function sourceIdentity(ticket: Record<string, unknown>): string | null {
  const mongoId = ticket._id && typeof ticket._id === 'object' && '$oid' in ticket._id ? ticket._id.$oid : ticket._id;
  if (ticket.id && mongoId && ticket.id !== mongoId) return null;
  const externalId = ticket.id ?? mongoId;
  return typeof externalId === 'string' && externalId.trim().length > 0 && externalId.length <= 256 ? externalId.trim() : null;
}

export async function preserveLegacyTickets(connection: TicketDatabase, sourceTickets: unknown[]) {
  const identifiedTickets: { externalId: string; payload: Record<string, unknown>; issues: string[] }[] = [];
  let unidentified = 0;
  const sourceIds = new Set<string>();
  for (const sourceTicket of sourceTickets) {
    if (!sourceTicket || typeof sourceTicket !== 'object' || Array.isArray(sourceTicket)) { unidentified++; continue; }
    const payload = sourceTicket as Record<string, unknown>;
    const externalId = sourceIdentity(payload);
    if (!externalId) { unidentified++; continue; }
    if (sourceIds.has(externalId)) throw new ThindeskError('A origem contém identificadores duplicados; nenhum registro foi preservado.');
    sourceIds.add(externalId);
    const issues = ['created_at: ausente no contrato legado', 'updated_at: ausente no contrato legado',
      'priority: ausente no contrato legado', 'requester_id: vínculo estável não fornecido',
      'mapping: contrato complementar necessário antes da promoção para indicadores'];
    if (!normalizeLegacyStatus(payload.status)) issues.push('status: valor não reconhecido');
    if (typeof payload.descricao !== 'string' || !payload.descricao.trim()) issues.push('descricao: texto obrigatório');
    if (payload.tipo !== undefined && payload.Tipo !== undefined && payload.tipo !== payload.Tipo) issues.push('tipo: campos tipo e Tipo conflitantes');
    if (typeof (payload.tipo ?? payload.Tipo) !== 'string') issues.push('tipo: catálogo não identificado');
    if (payload.tecnico) issues.push('assignee_id: nome não comprova identidade de técnico');
    if (normalizeLegacyStatus(payload.status) === 'resolved') issues.push('resolved_at: ausente no contrato legado');
    identifiedTickets.push({ externalId, payload, issues });
  }
  await connection.query('BEGIN');
  try {
    await connection.query('SELECT pg_advisory_xact_lock(784290114)');
    for (const ticket of identifiedTickets) {
      const preservedTicket = await connection.query(`INSERT INTO ticket_source_records
        (source_system, external_id, payload, import_state, validation_errors)
        VALUES ('thindesk', $1, $2::jsonb, 'rejected', $3::text[])
        ON CONFLICT (source_system, external_id) DO UPDATE SET payload = excluded.payload,
          import_state = excluded.import_state, validation_errors = excluded.validation_errors, last_seen_at = now()
        WHERE ticket_source_records.ticket_id IS NULL RETURNING id`,
      [ticket.externalId, JSON.stringify(ticket.payload), ticket.issues]);
      if (!preservedTicket.rows.length) throw new ThindeskError('Um registro já vinculado exige sincronização completa; a recepção foi revertida.');
    }
    await connection.query('COMMIT');
  } catch (importError) {
    await connection.query('ROLLBACK');
    throw importError;
  }
  return { received: sourceTickets.length, preserved: identifiedTickets.length,
    rejected: identifiedTickets.length, unidentified, promoted: 0 };
}

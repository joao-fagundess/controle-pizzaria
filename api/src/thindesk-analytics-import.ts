// Promove somente snapshots 1.0 válidos e conserva a versão aceita em conflitos ou observações antigas.
import type { TicketDatabase } from './database.js';
import { ThindeskError } from './thindesk-error.js';
import { sourceByteLimit } from './thindesk-reader.js';
import { fact, header, identity, instant, normalized, profiles, semanticIssues, sqlInstant, stable, unsupportedText, validTicket,
  type AnalyticsTicket, type CatalogKind, type Profile } from './thindesk-contract.js';

interface SourceRow { payload: Record<string, unknown>; ticket_id: string | null }
interface Plan { externalId: string; payload: Record<string, unknown>; ticket?: AnalyticsTicket; issues: string[];
  old?: SourceRow; action?: 'reject' | 'stale' | 'unchanged' | 'promote' | 'update' }
interface Catalog { kind: CatalogKind; profile: Profile; version: bigint }
export function typeMapping(input: unknown): Map<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ThindeskError('Mapeamento deve ser um objeto JSON.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== 'contract_version,types' || value.contract_version !== '1.0' ||
    !value.types || typeof value.types !== 'object' || Array.isArray(value.types)) throw new ThindeskError('Mapeamento exige contract_version 1.0 e types.');
  const mapping = new Map<string, string>();
  for (const [id, code] of Object.entries(value.types)) {
    if (!identity(id) || typeof code !== 'string' || !code.trim()) throw new ThindeskError('Identidade ou código inválido no mapeamento.');
    mapping.set(id, code);
  }
  return mapping;
}
const catalogKey = (kind: string, id: string) => JSON.stringify([kind, id]);
function references(ticket: AnalyticsTicket) {
  const types = new Set([ticket.type.external_id]), staff = new Set<string>();
  if (ticket.assignee) staff.add(ticket.assignee.external_id);
  for (const event of ticket.history.items) {
    if (event.event_type === 'created') {
      const state = event.new_value as { type_external_id: string; assignee_external_id: string | null };
      types.add(state.type_external_id); if (state.assignee_external_id) staff.add(state.assignee_external_id);
    }
    if (event.event_type === 'type_changed') { types.add(event.previous_value as string); types.add(event.new_value as string); }
    if (event.event_type === 'assignee_changed') for (const id of [event.previous_value, event.new_value]) if (typeof id === 'string') staff.add(id);
  }
  return { types, staff };
}
function immutableIssues(before: AnalyticsTicket, after: AnalyticsTicket, older: boolean): string[] {
  const issues: string[] = [];
  if (instant(before.created_at) !== instant(after.created_at)) issues.push('created_at: criação imutável');
  for (const key of ['history', 'technical_notes'] as const) {
    const incoming = new Map(after[key].items.map(item => [item.external_id, fact(item)]));
    for (const item of before[key].items) {
      if (incoming.has(item.external_id) ? incoming.get(item.external_id) !== fact(item) : !older)
        issues.push(`${key}: fatos aceitos não podem ser editados ou removidos`);
    }
  }
  return issues;
}
// A conexão deve estar reservada para esta operação, como o pg.Client da CLI; não passar pool.query.
export async function receiveAnalytics(connection: TicketDatabase, input: unknown, mappingInput: unknown) {
  if (Buffer.byteLength(JSON.stringify(input) ?? '') > sourceByteLimit) throw new ThindeskError('Export excede 5 MiB.');
  if (unsupportedText(input)) throw new ThindeskError('Export contém NUL ou Unicode não representável no PostgreSQL; nenhuma alteração realizada.');
  const envelope = header(input), mapping = typeMapping(mappingInput);
  const plans: Plan[] = [], seen = new Set<string>(), metadata = new Map<string, { kind: CatalogKind; profile: Profile }>();
  let unidentified = 0;
  for (const value of envelope.tickets) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !identity((value as Record<string, unknown>).external_id)) { unidentified++; continue; }
    const payload = value as Record<string, unknown>, externalId = payload.external_id as string;
    if (seen.has(externalId)) throw new ThindeskError('Identidades duplicadas no lote; nenhuma alteração realizada.');
    seen.add(externalId);
    const plan: Plan = { externalId, payload, issues: [] };
    if (!validTicket(value)) plan.issues = [...new Set(validTicket.errors?.map(error => `schema: ${error.instancePath || '/'} ${error.keyword}`))];
    else {
      plan.ticket = value;
      for (const [kind, profile] of profiles(value)) {
        const key = catalogKey(kind, profile.external_id), existing = metadata.get(key);
        if (existing && stable(existing.profile) !== stable(profile)) throw new ThindeskError('Metadados contraditórios para a mesma identidade no lote.');
        metadata.set(key, { kind, profile });
      }
    }
    plans.push(plan);
  }
  const report = { received: envelope.tickets.length, preserved: plans.length, rejected: 0, unidentified,
    promoted: 0, updated: 0, unchanged: 0, stale: 0 };
  await connection.query('BEGIN');
  try {
    await connection.query('SELECT pg_advisory_xact_lock(784290114)');
    const types = new Map((await connection.query<{ id: string; code: string }>('SELECT id, code FROM ticket_types')).rows.map(row => [row.code, row.id]));
    for (const code of mapping.values()) if (!types.has(code)) throw new ThindeskError('Mapeamento aponta para um código de tipo inexistente.');
    const storedMappings = (await connection.query<{ external_id: string; code: string }>(`SELECT m.external_id,t.code FROM ticket_type_source_mappings m
      JOIN ticket_types t ON t.id=m.type_id WHERE m.source_system='thindesk'`)).rows;
    for (const stored of storedMappings) if (mapping.has(stored.external_id) && mapping.get(stored.external_id) !== stored.code)
      throw new ThindeskError('Um tipo já mapeado não pode mudar de identidade analítica.');
    const staffRows = (await connection.query<{ id: string; external_id: string }>("SELECT id,external_id FROM users WHERE source_system='thindesk'")).rows;
    const knownStaff = new Set(staffRows.map(row => row.external_id));
    // Remove candidatos inválidos até que nenhuma referência dependa apenas de um registro rejeitado.
    let removed: boolean;
    do {
      removed = false;
      const available = new Set(knownStaff);
      for (const plan of plans) if (plan.ticket && !plan.issues.length) for (const [kind, profile] of profiles(plan.ticket)) if (kind === 'staff') available.add(profile.external_id);
      for (const plan of plans) if (plan.ticket && !plan.issues.length) {
        const issues = semanticIssues(plan.ticket, envelope.exported_at, available, new Set(mapping.keys()));
        if (!mapping.has(plan.ticket.type.external_id)) issues.push('type: mapeamento explícito ausente');
        if (issues.length) { plan.issues.push(...issues); removed = true; }
      }
    } while (removed);
    for (const plan of plans) {
      plan.old = (await connection.query<SourceRow>("SELECT payload,ticket_id FROM ticket_source_records WHERE source_system='thindesk' AND external_id=$1 FOR UPDATE", [plan.externalId])).rows[0];
      if (plan.old?.ticket_id) {
        if (!validTicket(plan.old.payload)) throw new ThindeskError('Chamado vinculado sem snapshot aceito 1.0; exige correção explícita.');
        if (plan.ticket && !plan.issues.length) {
          const previous = plan.old.payload, version = instant(plan.ticket.updated_at), accepted = instant(previous.updated_at);
          plan.issues.push(...immutableIssues(previous, plan.ticket, version < accepted));
          if (version === accepted && stable(normalized(previous)) !== stable(normalized(plan.ticket))) plan.issues.push('updated_at: mesma versão com payload diferente');
          plan.action = version < accepted ? 'stale' : version === accepted ? 'unchanged' : 'update';
        }
        if (plan.issues.length) throw new ThindeskError('Atualização inválida de chamado vinculado; lote revertido e versão aceita preservada.');
      } else {
        if ((await connection.query("SELECT id FROM tickets WHERE source_system='thindesk' AND external_id=$1", [plan.externalId])).rows.length)
          throw new ThindeskError('Chamado canônico sem vínculo de versão aceita; exige correção explícita.');
        plan.action = plan.issues.length ? 'reject' : 'promote';
      }
    }
    const wanted = new Map<string, Catalog>();
    const fresh = plans.filter(plan => plan.action === 'promote' || plan.action === 'update');
    for (const plan of fresh) {
      const ticket = plan.ticket!;
      const entries = [...profiles(ticket)];
      for (const id of references(ticket).staff) {
        const item = metadata.get(catalogKey('staff', id));
        if (item) entries.push(['staff', item.profile]);
      }
      for (const [kind, profile] of entries) {
        const key = catalogKey(kind, profile.external_id), version = instant(ticket.updated_at);
        if (!wanted.has(key) || version > wanted.get(key)!.version) wanted.set(key, { kind, profile, version });
      }
    }
    const staffIds = new Map(staffRows.map(row => [row.external_id, row.id])), requesterIds = new Map<string, string>();
    for (const { kind, profile, version } of wanted.values()) {
      const old = (await connection.query<{ payload: Profile; source_version: string }>(`SELECT payload,source_version FROM source_catalog_snapshots
        WHERE source_system='thindesk' AND kind=$1 AND external_id=$2`, [kind, profile.external_id])).rows[0];
      if (old && stable(old.payload) !== stable(profile) && version <= BigInt(old.source_version))
        throw new ThindeskError('Metadados de cadastro conflitam com uma versão mais recente já aceita.');
      if (!old || version >= BigInt(old.source_version)) {
        await connection.query(`INSERT INTO source_catalog_snapshots(source_system,kind,external_id,payload,source_version)
          VALUES('thindesk',$1,$2,$3::jsonb,$4) ON CONFLICT(source_system,kind,external_id)
          DO UPDATE SET payload=excluded.payload,source_version=excluded.source_version`, [kind, profile.external_id, JSON.stringify(profile), version.toString()]);
      }
      // Metadados iguais com versão antiga não fazem o cadastro regredir.
      if (kind === 'staff') {
        const staff = profile as import('./thindesk-contract.js').Staff;
        const row = (await connection.query<{ id: string }>(`INSERT INTO users(name,role,active,source_system,external_id) VALUES($1,$2,$3,'thindesk',$4)
          ON CONFLICT(source_system,external_id) DO UPDATE SET name=excluded.name,role=excluded.role,active=excluded.active RETURNING id`,
        [staff.name, staff.role, staff.active, staff.external_id])).rows[0]; staffIds.set(staff.external_id, row.id);
      } else if (kind === 'requester') {
        const requester = profile as import('./thindesk-contract.js').Requester;
        const row = (await connection.query<{ id: string }>(`INSERT INTO requesters(name,department,source_system,external_id) VALUES($1,$2,'thindesk',$3)
          ON CONFLICT(source_system,external_id) DO UPDATE SET name=excluded.name,department=excluded.department RETURNING id`,
        [requester.name, requester.department ?? null, requester.external_id])).rows[0]; requesterIds.set(requester.external_id, row.id);
      }
    }
    const typeId = (id: string) => types.get(mapping.get(id)!)!;
    for (const plan of plans) {
      if (plan.action === 'stale' || plan.action === 'unchanged') {
        await connection.query("UPDATE ticket_source_records SET last_seen_at=now() WHERE source_system='thindesk' AND external_id=$1", [plan.externalId]);
        report[plan.action]++; continue;
      }
      if (plan.action === 'reject') {
        await connection.query(`INSERT INTO ticket_source_records(source_system,external_id,payload,import_state,validation_errors)
          VALUES('thindesk',$1,$2::jsonb,'rejected',$3::text[]) ON CONFLICT(source_system,external_id)
          DO UPDATE SET payload=excluded.payload,import_state='rejected',validation_errors=excluded.validation_errors,last_seen_at=now()`,
        [plan.externalId, JSON.stringify(plan.payload), plan.issues]); report.rejected++; continue;
      }
      const ticket = plan.ticket!;
      for (const id of references(ticket).types) await connection.query(`INSERT INTO ticket_type_source_mappings(source_system,external_id,type_id)
        VALUES('thindesk',$1,$2) ON CONFLICT(source_system,external_id) DO NOTHING`, [id, typeId(id)]);
      const values = [ticket.title, ticket.description, ticket.status, typeId(ticket.type.external_id), ticket.priority,
        ticket.assignee ? staffIds.get(ticket.assignee.external_id) : null, requesterIds.get(ticket.requester.external_id),
        sqlInstant(ticket.created_at), sqlInstant(ticket.updated_at), sqlInstant(ticket.resolved_at), ticket.external_id,
        ticket.title_is_derived, ticket.history.coverage, ticket.technical_notes.coverage, sqlInstant(envelope.exported_at)];
      let ticketId: string;
      if (plan.action === 'promote') ticketId = (await connection.query<{ id: string }>(`INSERT INTO tickets
        (title,description,status_code,type_id,priority_code,assignee_id,requester_id,created_at,updated_at,resolved_at,source_system,external_id,
         title_is_derived,history_coverage,notes_coverage,contract_version,accepted_exported_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'thindesk',$11,$12,$13,$14,'1.0',$15) RETURNING id`, values)).rows[0].id;
      else {
        ticketId = plan.old!.ticket_id!;
        await connection.query(`UPDATE tickets SET title=$1,description=$2,status_code=$3,type_id=$4,priority_code=$5,assignee_id=$6,
          requester_id=$7,created_at=$8,updated_at=$9,resolved_at=$10,title_is_derived=$12,history_coverage=$13,notes_coverage=$14,
          contract_version='1.0',accepted_exported_at=$15 WHERE source_system='thindesk' AND external_id=$11`, values);
      }
      for (const note of ticket.technical_notes.items) await connection.query(`INSERT INTO technical_notes(ticket_id,author_id,content,created_at,source_external_id,source_time_ns)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(ticket_id,source_external_id) DO NOTHING`,
      [ticketId, note.author ? staffIds.get(note.author.external_id) : null, note.content, sqlInstant(note.created_at), note.external_id, instant(note.created_at).toString()]);
      const localValue = (type: string, value: unknown): unknown => {
        if (type === 'assignee_changed') return value === null ? null : staffIds.get(value as string);
        if (type === 'type_changed') return typeId(value as string);
        return value;
      };
      for (const event of ticket.history.items) await connection.query(`INSERT INTO ticket_history
        (ticket_id,author_id,event_type,previous_value,new_value,occurred_at,source_external_id,source_sequence)
        VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) ON CONFLICT(ticket_id,source_external_id) DO NOTHING`,
      [ticketId, event.author ? staffIds.get(event.author.external_id) : null, event.event_type,
        JSON.stringify(localValue(event.event_type, event.previous_value)), JSON.stringify(localValue(event.event_type, event.new_value)),
        sqlInstant(event.occurred_at), event.external_id, event.sequence]);
      await connection.query(`INSERT INTO ticket_source_records(source_system,external_id,payload,import_state,validation_errors,ticket_id)
        VALUES('thindesk',$1,$2::jsonb,'linked','{}',$3) ON CONFLICT(source_system,external_id)
        DO UPDATE SET payload=excluded.payload,import_state='linked',validation_errors='{}',ticket_id=excluded.ticket_id,last_seen_at=now()`,
      [plan.externalId, JSON.stringify(ticket), ticketId]);
      if (plan.action === 'promote') report.promoted++; else report.updated++;
    }
    const invalidAssignees = await connection.query(`SELECT t.id FROM tickets t JOIN users u ON u.id=t.assignee_id
      WHERE t.source_system='thindesk' AND u.role<>'technician' LIMIT 1`);
    if (invalidAssignees.rows.length) throw new ThindeskError('Atualização de papel deixa chamado atribuído a pessoa que não é técnico.');
    await connection.query('COMMIT'); return report;
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
}

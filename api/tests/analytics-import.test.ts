// Exercita o contrato 1.0 em PostgreSQL isolado e repete a suíte por TCP no runner nativo.
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../scripts/database.mjs';
import { createTestDatabase } from './test-database.mjs';
import { receiveAnalytics } from '../src/thindesk-analytics-import.js';
import { TicketRepository } from '../src/ticket-repository.js';
import { preserveLegacyTickets } from '../src/thindesk-import.js';
import { addNote, changeStatus, envelope, mapping, ticket } from './analytics-fixtures.js';
import type { AnalyticsTicket } from '../src/thindesk-contract.js';

const testDatabase = await createTestDatabase(), db = testDatabase.database, repository = new TicketRepository(db);
beforeAll(async () => { await applyMigrations(db); });
beforeEach(async () => { await db.query('TRUNCATE ticket_source_records,ticket_history,technical_notes,tickets,users,requesters,source_catalog_snapshots,ticket_type_source_mappings CASCADE'); });
afterAll(() => testDatabase.close());
const receive = (...tickets: unknown[]) => receiveAnalytics(db, envelope(...tickets), mapping);
const rows = (table: string) => db.query(`SELECT * FROM ${table}`); // Nomes internos dos testes, sem entrada externa.
const detail = async () => repository.ticketDetail((await rows('tickets')).rows[0].id as string);

describe('recepção versionada', () => {
  it.each(['\u0000', '\ud800', '\udc00'])('recusa lote sem corromper texto não representável: %j', async value => {
    await expect(receive({ external_id: 'invalid-text', description: value }, ticket())).rejects.toThrow(/não representável/);
    expect((await rows('ticket_source_records')).rows).toHaveLength(0); expect((await rows('tickets')).rows).toHaveLength(0);
  });
  it('promove o snapshot, preserva o payload e expõe proveniência sem fabricar datas', async () => {
    const original = ticket(); expect(await receive(original)).toMatchObject({ promoted: 1, rejected: 0 });
    expect((await rows('ticket_source_records')).rows[0]).toMatchObject({ payload: original, import_state: 'linked', validation_errors: [] });
    expect(await repository.summary({})).toMatchObject({ total: 1, open: 1 });
    expect((await detail()).ticket.provenance).toMatchObject({ contract_version: '1.0', title_is_derived: false, history_coverage: 'complete', technical_notes_coverage: 'complete' });
    expect((await detail()).ticket.created_at).toBe('2026-11-10T10:00:00.123Z');
  });
  it('repete sem duplicar fatos, pessoas ou observação inicial', async () => {
    const original = addNote(addNote(ticket()));
    original.technical_notes.items[0].external_id = 'é'; original.technical_notes.items[1].external_id = 'e\u0301';
    await receive(original);
    const before = (await rows('ticket_source_records')).rows[0];
    const repeated = { ...original, history: { ...original.history, items: [...original.history.items].reverse() },
      technical_notes: { ...original.technical_notes, items: [...original.technical_notes.items].reverse() } };
    expect(await receive(repeated)).toMatchObject({ promoted: 0, updated: 0, unchanged: 1 });
    expect((await rows('ticket_source_records')).rows[0].first_seen_at).toEqual(before.first_seen_at);
    for (const name of ['tickets', 'users', 'requesters', 'ticket_history']) expect((await rows(name)).rows).toHaveLength(1);
    expect((await rows('technical_notes')).rows).toHaveLength(2);
  });
  it('aceita offsets equivalentes e diferenças abaixo de microssegundo sem confundir a versão', async () => {
    const original = ticket(); await receive(original);
    const equivalent = structuredClone(original);
    equivalent.created_at = equivalent.updated_at = equivalent.history.items[0].occurred_at = '2026-11-10T07:00:00.123456789-03:00';
    expect(await receive(equivalent)).toMatchObject({ unchanged: 1 });
    equivalent.updated_at = '2026-11-10T10:00:00.123456790Z'; equivalent.title = 'Alteração real abaixo de um microssegundo';
    expect(await receive(equivalent)).toMatchObject({ updated: 1 });
    expect((await detail()).ticket.title).toBe(equivalent.title);
  });
  it('atualiza notas e movimentos simultâneos pela sequência, preservando IDs locais', async () => {
    const original = ticket(); await receive(original); const id = (await rows('ticket_history')).rows[0].id;
    changeStatus(original, 'in_progress', '2026-11-10T12:00:00Z');
    changeStatus(original, 'waiting', '2026-11-10T12:00:00Z'); addNote(original);
    original.history.items.reverse();
    expect(await receive(original)).toMatchObject({ updated: 1 });
    const result = await detail(); expect(result.history.map(item => item.sequence)).toEqual([1, 2, 3]);
    expect(result.history[0].id).toBe(id); expect(result.technical_notes).toHaveLength(1);
    expect(await receive(original)).toMatchObject({ unchanged: 1 });
  });
  it('última nota e detalhe conservam nanossegundos em vez da ordem dos UUIDs locais', async () => {
    const value = addNote(ticket(), '2026-11-10T12:00:00.123456001Z');
    value.technical_notes.items[0].content = 'Mais antiga'; value.technical_notes.items[0].external_id = 'z';
    addNote(value, '2026-11-10T12:00:00.123456002Z'); value.technical_notes.items[1].content = 'Mais recente'; value.technical_notes.items[1].external_id = 'a';
    await receive(value);
    await db.query("UPDATE technical_notes SET id=CASE source_external_id WHEN 'z' THEN 'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid ELSE '00000000-0000-4000-8000-000000000001'::uuid END");
    const result = await detail(); expect(result.ticket.latest_technical_note?.content).toBe('Mais recente');
    expect(result.technical_notes.map(note => note.content)).toEqual(['Mais antiga', 'Mais recente']);
  });
  it('reabre e resolve novamente sem duplicar conclusões ou perder a resolução antiga', async () => {
    const original = ticket(); changeStatus(original, 'resolved', '2026-11-10T12:00:00Z'); await receive(original);
    changeStatus(original, 'closed', '2026-11-10T13:00:00Z'); await receive(original);
    expect((await detail()).ticket.resolved_at).toBe('2026-11-10T12:00:00.000Z');
    changeStatus(original, 'open', '2026-11-11T10:00:00Z'); await receive(original);
    expect((await detail()).ticket.resolved_at).toBeNull(); expect((await repository.summary({})).resolved).toBe(0);
    changeStatus(original, 'resolved', '2026-11-11T12:00:00Z'); await receive(original);
    expect((await repository.summary({}))).toMatchObject({ total: 1, resolved: 1 });
    expect((await detail()).history).toHaveLength(5);
  });
  it('snapshot antigo não substitui payload, cadastro ou chamado aceitos', async () => {
    const original = ticket(), newer = addNote(structuredClone(original), '2026-11-11T10:00:00Z'); newer.title = 'Título atualizado';
    await receive(newer); const accepted = (await rows('ticket_source_records')).rows[0];
    original.requester.name = 'Nome antigo';
    expect(await receive(original)).toMatchObject({ stale: 1, updated: 0 });
    expect((await rows('ticket_source_records')).rows[0].payload).toEqual(accepted.payload);
    expect((await detail()).ticket.title).toBe(newer.title); expect((await detail()).ticket.requester.name).toBe(newer.requester.name);
  });
  it('atualização inválida vinculada reverte também outros chamados do lote', async () => {
    const original = ticket(); await receive(original); const invalid = structuredClone(original); invalid.priority = 'desconhecida';
    await expect(receive(ticket('outro'), invalid)).rejects.toThrow(/versão aceita preservada/);
    expect((await rows('tickets')).rows).toHaveLength(1); expect((await rows('ticket_source_records')).rows[0].payload).toEqual(original);
  });
  it.each(['same-version', 'created-at', 'edit-note', 'remove-note', 'edit-event'])('recusa alteração de evidência aceita: %s', async scenario => {
    const original = addNote(ticket()); await receive(original); const invalid = structuredClone(original);
    if (scenario === 'same-version') invalid.title = 'Mudança sem atualizar a versão';
    else invalid.updated_at = '2026-11-11T12:00:00Z';
    if (scenario === 'created-at') { invalid.created_at = invalid.history.items[0].occurred_at = '2026-11-10T09:00:00Z'; }
    if (scenario === 'edit-note') invalid.technical_notes.items[0].content = 'Conteúdo reescrito';
    if (scenario === 'remove-note') invalid.technical_notes.items = [];
    if (scenario === 'edit-event') { invalid.history.items[0].new_value = { ...(invalid.history.items[0].new_value as object), priority: 'low' }; invalid.priority = 'low'; }
    await expect(receive(invalid)).rejects.toThrow(/versão aceita preservada/);
    expect((await rows('ticket_source_records')).rows[0].payload).toEqual(original);
  });
  it('identidades e metadados conflitantes impedem o lote antes de qualquer promoção', async () => {
    await expect(receive(ticket(), ticket())).rejects.toThrow(/duplicadas/);
    const conflicting = ticket('outro'); conflicting.requester.name = 'Outro nome para a mesma identidade';
    await expect(receive(ticket(), conflicting)).rejects.toThrow(/Metadados contraditórios/);
    expect((await rows('tickets')).rows).toHaveLength(0);
  });
  it('preserva novos inválidos, contabiliza não identificados e nunca promove legados incompletos', async () => {
    expect(await receive({ external_id: 'incompleto', title: 'Sem dados' }, null, { title: 'Sem identidade' })).toMatchObject({ rejected: 1, unidentified: 2, promoted: 0 });
    expect((await rows('ticket_source_records')).rows[0].validation_errors).not.toHaveLength(0);
    expect((await rows('tickets')).rows).toHaveLength(0);
    expect(await preserveLegacyTickets(db, [{ id: 'legado', descricao: 'Descrição', status: 'ABERTO', tipo: 'Manutenção' }])).toMatchObject({ promoted: 0, rejected: 1 });
  });
  it('não associa homônimos e permite autoria explicitamente desconhecida', async () => {
    const first = ticket(), second = ticket('homônimo'); second.requester.external_id = 'outro-solicitante';
    first.assignee = null; first.history.items[0].author = null;
    (first.history.items[0].new_value as Record<string, unknown>).assignee_external_id = null;
    await receive(first, second); expect((await rows('requesters')).rows).toHaveLength(2);
    expect((await repository.ticketDetail((await db.query<{ id: string }>("SELECT id FROM tickets WHERE external_id='ticket-v1'")).rows[0].id)).history[0].author).toBeNull();
  });
  it('cobertura parcial e indisponível chega ao contrato de consulta sem afirmar ausência', async () => {
    const value = ticket(); value.title_is_derived = true; value.history.coverage = 'partial';
    value.history.items = [{ ...value.history.items[0], sequence: 7, event_type: 'status_changed', previous_value: 'waiting', new_value: 'open' }];
    value.technical_notes = { coverage: 'unavailable', items: [] };
    expect(await receive(value)).toMatchObject({ promoted: 1 });
    expect((await detail()).ticket.provenance).toMatchObject({ title_is_derived: true, history_coverage: 'partial', technical_notes_coverage: 'unavailable' });
  });
  it('cadastros atualizados mantêm IDs e mudam nomes sem editar fatos ou aceitar regressão', async () => {
    const value = addNote(ticket()); await receive(value); const localId = (await rows('users')).rows[0].id;
    const newer = structuredClone(value); newer.updated_at = '2026-11-12T12:00:00Z';
    newer.assignee!.name = newer.history.items[0].author!.name = newer.technical_notes.items[0].author!.name = 'Nome atualizado';
    await receive(newer); expect((await rows('users')).rows[0].id).toBe(localId);
    expect((await detail()).technical_notes[0].author?.name).toBe('Nome atualizado');
    const oldMetadata = ticket('outro-antigo'); oldMetadata.assignee!.name = oldMetadata.history.items[0].author!.name = 'Nome conflitante';
    await expect(receive(oldMetadata)).rejects.toThrow(/cadastro conflitam/);
    expect((await rows('tickets')).rows).toHaveLength(1);
  });
  it('mapeamento de tipo já utilizado não muda silenciosamente', async () => {
    await receive(ticket());
    await expect(receiveAnalytics(db, envelope(ticket()), { contract_version: '1.0', types: { 'source-printing': 'hardware' } })).rejects.toThrow(/tipo já mapeado/);
    expect((await detail()).ticket.type.code).toBe('printing');
  });
  it('troca de papel não deixa outros chamados atribuídos a supervisor', async () => {
    await receive(ticket()); const other = ticket('autor-promovido'); other.created_at = other.updated_at = other.history.items[0].occurred_at = '2026-11-12T10:00:00Z';
    other.assignee = null; other.history.items[0].author!.role = 'supervisor';
    (other.history.items[0].new_value as Record<string, unknown>).assignee_external_id = null;
    await expect(receive(other)).rejects.toThrow(/não é técnico/);
    expect((await rows('users')).rows[0].role).toBe('technician'); expect((await rows('tickets')).rows).toHaveLength(1);
  });
  it('não reassume automaticamente um chamado canônico que perdeu a versão de origem', async () => {
    await receive(ticket()); await db.query('DELETE FROM ticket_source_records');
    await expect(receive(ticket())).rejects.toThrow(/sem vínculo de versão aceita/);
    expect((await rows('tickets')).rows).toHaveLength(1);
  });
  it('identidades históricas podem ser resolvidas por cadastro já aceito, sem repetição por nome', async () => {
    await receive(ticket()); const value = ticket('histórico-conhecido'); value.assignee = null; value.history.items[0].author = null;
    value.history.items.push({ external_id: 'event-2', sequence: 2, event_type: 'assignee_changed', author: null,
      occurred_at: '2026-11-10T12:00:00Z', previous_value: 'tech-v1', new_value: null });
    value.updated_at = '2026-11-10T12:00:00Z';
    expect(await receive(value)).toMatchObject({ promoted: 1 });
    expect((await rows('users')).rows).toHaveLength(1);
  });
  it('cópia do schema de execução coincide com o contrato publicado', async () => {
    const runtime = JSON.parse(await readFile(new URL('../contracts/thindesk-analytics-v1.schema.json', import.meta.url), 'utf8'));
    expect(runtime).toEqual(JSON.parse(await readFile(new URL('../../docs/contracts/thindesk-analytics-v1.schema.json', import.meta.url), 'utf8')));
  });
  it('recebe o export real da homologação e exclui históricos sem cadastro resolvido', async () => {
    const actual = JSON.parse(await readFile(new URL('../../docs/evidencias/thindesk-analytics/export.json', import.meta.url), 'utf8'));
    const result = await receiveAnalytics(db, actual, { contract_version: '1.0', types: { 'analytics-printing': 'printing', 'analytics-network': 'network' } });
    expect(result).toMatchObject({ received: 6, promoted: 3, rejected: 3 });
    expect((await repository.summary({}))).toMatchObject({ total: 3, open: 1, resolved: 2 });
    expect((await rows('ticket_source_records')).rows.filter(row => row.import_state === 'rejected').every(row => (row.validation_errors as string[]).includes('history: técnico sem identidade resolvida'))).toBe(true);
  });
});

const mutations: [string, (value: AnalyticsTicket) => void][] = [
  ['atualização futura', value => { value.updated_at = '2027-01-01T00:00:00Z'; }],
  ['nota anterior à criação', value => { addNote(value); value.technical_notes.items[0].created_at = '2020-01-01T00:00:00Z'; }],
  ['sequência com lacuna completa', value => { value.history.items[0].sequence = 2; }],
  ['sequência sem precisão', value => { value.history.coverage = 'partial'; value.history.items[0].sequence = Number.MAX_SAFE_INTEGER + 1; }],
  ['instantes fora de ordem', value => { changeStatus(value, 'waiting', '2026-11-11T10:00:00Z'); changeStatus(value, 'open', '2026-11-10T11:00:00Z'); value.updated_at = '2026-11-12T00:00:00Z'; }],
  ['estado final divergente', value => { value.status = 'waiting'; }],
  ['resolução divergente', value => { changeStatus(value, 'resolved', '2026-11-11T10:00:00Z'); value.resolved_at = '2026-11-11T11:00:00Z'; value.updated_at = '2026-11-11T12:00:00Z'; }],
  ['fato anterior contraditório', value => { changeStatus(value, 'waiting', '2026-11-11T10:00:00Z'); value.history.items[1].previous_value = 'in_progress'; }],
  ['fato sem mudança', value => { changeStatus(value, 'open', '2026-11-11T10:00:00Z'); }],
  ['notas com mesmo ID', value => { addNote(value); value.technical_notes.items.push(structuredClone(value.technical_notes.items[0])); }],
  ['eventos com mesmo ID', value => { changeStatus(value, 'waiting', '2026-11-11T10:00:00Z'); value.history.items[1].external_id = 'event-1'; }],
  ['tipo sem mapeamento', value => { value.type.external_id = 'sem-mapa'; }],
  ['referência histórica não resolvida', value => { (value.history.items[0].new_value as Record<string, unknown>).assignee_external_id = 'desconhecido'; }],
  ['precisão temporal não suportada', value => { value.updated_at = '2026-11-10T10:00:01.1234567891Z'; }],
];
it.each(mutations)('recusa semântica inválida sem aumentar indicadores: %s', async (_name, mutate) => {
  const value = ticket(); mutate(value);
  expect(await receive(value)).toMatchObject({ rejected: 1, promoted: 0 }); expect((await repository.summary({})).total).toBe(0);
});

// Aplica a migration nova sobre a estrutura anterior com dados existentes, sem alterar sua identidade.
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createTestDatabase } from './test-database.mjs';

it('migra dados anteriores sem perder fatos e impõe unicidade das identidades de origem', async () => {
  const isolated = await createTestDatabase(), db = isolated.database;
  try {
    for (const file of ['001_initial_schema.sql', '002_ticket_catalogs.sql']) await db.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    const requester = (await db.query<{ id: string }>("INSERT INTO requesters(name) VALUES('Solicitante antigo fictício') RETURNING id")).rows[0].id;
    const id = (await db.query<{ id: string }>(`INSERT INTO tickets(title,description,status_code,type_id,priority_code,requester_id,created_at,updated_at)
      VALUES('Chamado antigo fictício','Dados anteriores','open',(SELECT id FROM ticket_types WHERE code='printing'),'normal',$1,'2026-11-01Z','2026-11-02Z') RETURNING id`, [requester])).rows[0].id;
    await db.query("INSERT INTO technical_notes(ticket_id,content,created_at) VALUES($1,'Nota anterior','2026-11-01Z')", [id]);
    await db.query("INSERT INTO ticket_history(ticket_id,event_type,new_value,occurred_at) VALUES($1,'created','{}','2026-11-01Z')", [id]);
    await db.query(await readFile(new URL('../migrations/003_analytics_source.sql', import.meta.url), 'utf8'));
    expect((await db.query('SELECT * FROM tickets')).rows[0]).toMatchObject({ id, notes_coverage: 'partial', history_coverage: 'partial', contract_version: null });
    await db.query("INSERT INTO technical_notes(ticket_id,content,created_at,source_external_id) VALUES($1,'Nota nova','2026-11-02Z','note-1')", [id]);
    await expect(db.query("INSERT INTO technical_notes(ticket_id,content,created_at,source_external_id) VALUES($1,'Duplicada','2026-11-02Z','note-1')", [id])).rejects.toMatchObject({ code: '23505' });
    await db.query("INSERT INTO ticket_history(ticket_id,event_type,new_value,occurred_at,source_external_id,source_sequence) VALUES($1,'created','{}','2026-11-01Z','event-1',1)", [id]);
    await expect(db.query("INSERT INTO ticket_history(ticket_id,event_type,new_value,occurred_at,source_external_id,source_sequence) VALUES($1,'created','{}','2026-11-01Z','event-2',1)", [id])).rejects.toMatchObject({ code: '23505' });
    expect((await db.query('SELECT * FROM technical_notes')).rows).toHaveLength(2);
    await db.query("UPDATE tickets SET source_system='thindesk',external_id='old-v1',contract_version='1.0',accepted_exported_at='2026-11-13T00:00:00Z' WHERE id=$1", [id]);
    await db.query("UPDATE technical_notes SET created_at='2026-11-02T00:00:00.123456Z' WHERE source_external_id='note-1'");
    await db.query(`INSERT INTO ticket_source_records(source_system,external_id,payload,import_state,ticket_id)
      VALUES('thindesk','old-v1',$1::jsonb,'linked',$2)`, [JSON.stringify({ technical_notes: { items: [{ external_id: 'note-1', created_at: '2026-11-02T00:00:00.123456789Z' }] } }), id]);
    await db.query(await readFile(new URL('../migrations/004_note_source_precision.sql', import.meta.url), 'utf8'));
    const notes = (await db.query('SELECT source_external_id,source_time_ns FROM technical_notes')).rows;
    expect(String(notes.find(note => note.source_external_id === 'note-1')!.source_time_ns)).toBe((BigInt(Date.parse('2026-11-02T00:00:00Z')) * 1000000n + 123456789n).toString());
    expect(notes.find(note => note.source_external_id === null)!.source_time_ns).toBeNull();
  } finally { await isolated.close(); }
});

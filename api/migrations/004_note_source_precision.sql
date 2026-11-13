-- Conserva a ordem exata das notas sem alterar os instantes de consulta já armazenados.
ALTER TABLE technical_notes ADD COLUMN source_time_ns numeric(30,0);

-- Recupera somente precisão declarada no payload aceito; notas sem essa evidência continuam nulas.
UPDATE technical_notes notes SET source_time_ns = source_notes.source_time_ns
FROM (
    SELECT source.ticket_id, note->>'external_id' AS external_id,
      extract(epoch FROM regexp_replace(note->>'created_at', '[.][0-9]+', '')::timestamptz) * 1000000000
        + rpad(coalesce(substring(note->>'created_at' FROM '[.]([0-9]+)'), ''), 9, '0')::numeric AS source_time_ns
    FROM ticket_source_records source JOIN tickets ON tickets.id = source.ticket_id
    CROSS JOIN LATERAL jsonb_array_elements(CASE
      WHEN jsonb_typeof(source.payload->'technical_notes'->'items') = 'array'
      THEN source.payload->'technical_notes'->'items' ELSE '[]'::jsonb END) note
    WHERE source.import_state = 'linked' AND tickets.contract_version = '1.0'
) source_notes
WHERE notes.ticket_id = source_notes.ticket_id AND notes.source_external_id = source_notes.external_id;

CREATE INDEX notes_source_time_idx ON technical_notes
    (ticket_id, created_at DESC, source_time_ns DESC NULLS LAST, source_external_id COLLATE "C" DESC NULLS LAST, id DESC);
COMMENT ON COLUMN technical_notes.source_time_ns IS
    'Instante original em nanossegundos UTC, para ordenação exata; null quando não fornecido, nunca deduzido da importação.';

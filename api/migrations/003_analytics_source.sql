-- Proveniência e fatos externos da recepção versionada, sem alterar migrations anteriores.
ALTER TABLE tickets ADD COLUMN title_is_derived boolean NOT NULL DEFAULT false;
ALTER TABLE tickets ADD COLUMN history_coverage text NOT NULL DEFAULT 'unavailable'
    CHECK (history_coverage IN ('complete', 'partial', 'unavailable'));
ALTER TABLE tickets ADD COLUMN notes_coverage text NOT NULL DEFAULT 'unavailable'
    CHECK (notes_coverage IN ('complete', 'partial', 'unavailable'));
ALTER TABLE tickets ADD COLUMN contract_version text CHECK (contract_version = '1.0');
ALTER TABLE tickets ADD COLUMN accepted_exported_at timestamptz;
UPDATE tickets SET history_coverage = 'complete', notes_coverage = 'complete' WHERE source_system = 'demo';
UPDATE tickets SET history_coverage = 'partial' WHERE source_system IS DISTINCT FROM 'demo'
    AND EXISTS (SELECT 1 FROM ticket_history WHERE ticket_id = tickets.id);
UPDATE tickets SET notes_coverage = 'partial' WHERE source_system IS DISTINCT FROM 'demo'
    AND EXISTS (SELECT 1 FROM technical_notes WHERE ticket_id = tickets.id);
ALTER TABLE tickets ADD CONSTRAINT tickets_contract_export_pair CHECK
    ((contract_version IS NULL) = (accepted_exported_at IS NULL));

ALTER TABLE ticket_history ADD COLUMN source_external_id text CHECK (btrim(source_external_id) <> '');
ALTER TABLE ticket_history ADD COLUMN source_sequence bigint CHECK (source_sequence > 0);
ALTER TABLE ticket_history ADD CONSTRAINT history_source_pair CHECK
    ((source_external_id IS NULL) = (source_sequence IS NULL));
CREATE UNIQUE INDEX history_source_id_idx ON ticket_history (ticket_id, source_external_id);
CREATE UNIQUE INDEX history_source_sequence_idx ON ticket_history (ticket_id, source_sequence);
ALTER TABLE technical_notes ADD COLUMN source_external_id text CHECK (btrim(source_external_id) <> '');
CREATE UNIQUE INDEX notes_source_id_idx ON technical_notes (ticket_id, source_external_id);

CREATE TABLE ticket_type_source_mappings (
    source_system text NOT NULL CHECK (btrim(source_system) <> ''),
    external_id text NOT NULL CHECK (btrim(external_id) <> ''),
    type_id uuid NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
    PRIMARY KEY (source_system, external_id)
);
CREATE TABLE source_catalog_snapshots (
    source_system text NOT NULL CHECK (btrim(source_system) <> ''),
    kind text NOT NULL CHECK (kind IN ('staff', 'requester', 'type')),
    external_id text NOT NULL CHECK (btrim(external_id) <> ''),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    source_version text NOT NULL CHECK (source_version ~ '^-?[0-9]+$'),
    PRIMARY KEY (source_system, kind, external_id)
);
COMMENT ON TABLE ticket_source_records IS
    'Snapshot aceito quando linked; observações antigas atualizam apenas last_seen_at. Tentativas inválidas não apagam a versão aceita.';
COMMENT ON COLUMN tickets.accepted_exported_at IS 'Instante do envelope que forneceu a versão aceita, nunca data de negócio.';
COMMENT ON COLUMN source_catalog_snapshots.source_version IS 'Maior updated_at aceito com estes metadados, em nanossegundos UTC; impede regressão do cadastro.';

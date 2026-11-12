-- Estrutura de consulta do dashboard e área de recepção dos registros do Thindesk.
-- Registros sem os campos exigidos ficam na origem preservada, fora dos indicadores.

CREATE TABLE ticket_statuses (
    code text PRIMARY KEY CHECK (code IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
    name text NOT NULL CHECK (btrim(name) <> '')
);

CREATE TABLE ticket_priorities (
    code text PRIMARY KEY CHECK (code IN ('low', 'normal', 'high', 'urgent')),
    name text NOT NULL CHECK (btrim(name) <> ''),
    severity smallint NOT NULL UNIQUE CHECK (severity BETWEEN 1 AND 4)
);

CREATE TABLE ticket_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE CHECK (btrim(code) <> ''),
    name text NOT NULL UNIQUE CHECK (btrim(name) <> ''),
    active boolean NOT NULL DEFAULT true
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (btrim(name) <> ''),
    email text UNIQUE,
    role text NOT NULL CHECK (role IN ('supervisor', 'technician')),
    active boolean NOT NULL DEFAULT true,
    source_system text,
    external_id text,
    UNIQUE (source_system, external_id),
    CONSTRAINT users_source_pair CHECK (
        (source_system IS NULL AND external_id IS NULL) OR
        (source_system IS NOT NULL AND btrim(source_system) <> '' AND
         external_id IS NOT NULL AND btrim(external_id) <> '')
    )
);

CREATE TABLE requesters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (btrim(name) <> ''),
    department text,
    email text,
    source_system text,
    external_id text,
    UNIQUE (source_system, external_id),
    CONSTRAINT requesters_source_pair CHECK (
        (source_system IS NULL AND external_id IS NULL) OR
        (source_system IS NOT NULL AND btrim(source_system) <> '' AND
         external_id IS NOT NULL AND btrim(external_id) <> '')
    )
);

CREATE TABLE tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 240),
    description text NOT NULL CHECK (btrim(description) <> ''),
    status_code text NOT NULL REFERENCES ticket_statuses(code) ON DELETE RESTRICT,
    type_id uuid NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
    priority_code text NOT NULL REFERENCES ticket_priorities(code) ON DELETE RESTRICT,
    assignee_id uuid REFERENCES users(id) ON DELETE RESTRICT,
    requester_id uuid NOT NULL REFERENCES requesters(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    resolved_at timestamptz,
    source_system text,
    external_id text,
    UNIQUE (source_system, external_id),
    CONSTRAINT tickets_source_pair CHECK (
        (source_system IS NULL AND external_id IS NULL) OR
        (source_system IS NOT NULL AND btrim(source_system) <> '' AND
         external_id IS NOT NULL AND btrim(external_id) <> '')
    ),
    CONSTRAINT tickets_chronology CHECK (
        updated_at >= created_at AND
        (resolved_at IS NULL OR (resolved_at >= created_at AND updated_at >= resolved_at))
    ),
    -- O catálogo é fechado nesta versão; a regra não depende de consulta a outra tabela.
    CONSTRAINT tickets_resolution_state CHECK (
        (status_code IN ('resolved', 'closed') AND resolved_at IS NOT NULL) OR
        (status_code NOT IN ('resolved', 'closed') AND resolved_at IS NULL)
    )
);

CREATE TABLE ticket_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
    author_id uuid REFERENCES users(id) ON DELETE RESTRICT,
    event_type text NOT NULL CHECK (event_type IN (
        'created', 'status_changed', 'assignee_changed', 'type_changed', 'priority_changed'
    )),
    previous_value jsonb,
    new_value jsonb NOT NULL,
    occurred_at timestamptz NOT NULL
);

CREATE TABLE technical_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
    author_id uuid REFERENCES users(id) ON DELETE RESTRICT,
    content text NOT NULL CHECK (btrim(content) <> ''),
    created_at timestamptz NOT NULL
);

CREATE TABLE ticket_source_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system text NOT NULL CHECK (btrim(source_system) <> ''),
    external_id text NOT NULL CHECK (btrim(external_id) <> ''),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    import_state text NOT NULL DEFAULT 'pending' CHECK (import_state IN ('pending', 'rejected', 'linked')),
    validation_errors text[] NOT NULL DEFAULT '{}',
    ticket_id uuid UNIQUE REFERENCES tickets(id) ON DELETE RESTRICT,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_system, external_id),
    CHECK (last_seen_at >= first_seen_at),
    CHECK ((import_state = 'linked') = (ticket_id IS NOT NULL)),
    CHECK (import_state <> 'linked' OR cardinality(validation_errors) = 0),
    CHECK (import_state <> 'rejected' OR cardinality(validation_errors) > 0)
);

-- Os índices compostos atendem filtros por dimensão seguidos de período e desempate.
CREATE INDEX tickets_created_at_id_idx ON tickets (created_at DESC, id DESC);
CREATE INDEX tickets_status_created_at_idx ON tickets (status_code, created_at DESC, id DESC);
CREATE INDEX tickets_type_created_at_idx ON tickets (type_id, created_at DESC, id DESC);
CREATE INDEX tickets_priority_created_at_idx ON tickets (priority_code, created_at DESC, id DESC);
CREATE INDEX tickets_assignee_created_at_idx ON tickets (assignee_id, created_at DESC, id DESC);
CREATE INDEX tickets_requester_idx ON tickets (requester_id);
-- Chamados pendentes não participam de séries e ranking de conclusões.
CREATE INDEX tickets_resolved_at_type_idx ON tickets (resolved_at, type_id)
    WHERE resolved_at IS NOT NULL;
CREATE INDEX ticket_history_ticket_time_idx ON ticket_history (ticket_id, occurred_at, id);
CREATE INDEX technical_notes_ticket_time_idx ON technical_notes (ticket_id, created_at DESC, id DESC);
CREATE INDEX ticket_history_author_idx ON ticket_history (author_id);
CREATE INDEX technical_notes_author_idx ON technical_notes (author_id);
CREATE INDEX ticket_source_records_state_idx ON ticket_source_records (import_state, last_seen_at);

COMMENT ON TABLE ticket_source_records IS
    'Último registro recebido da origem; não inventa datas, prioridade, autoria ou histórico ausentes.';
COMMENT ON COLUMN tickets.resolved_at IS
    'Resolução vigente. Reabertura remove este valor e preserva a resolução anterior no histórico.';
COMMENT ON TABLE users IS
    'Pessoas da operação; esta tabela não armazena senha nem implementa autenticação.';

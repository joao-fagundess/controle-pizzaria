-- Catálogos iniciais do domínio; não representam uma lista completa extraída do Thindesk.

INSERT INTO ticket_statuses (code, name) VALUES
    ('open', 'Aberto'), ('in_progress', 'Em andamento'), ('waiting', 'Em espera'),
    ('resolved', 'Resolvido'), ('closed', 'Fechado');

INSERT INTO ticket_priorities (code, name, severity) VALUES
    ('low', 'Baixa', 1), ('normal', 'Normal', 2), ('high', 'Alta', 3), ('urgent', 'Urgente', 4);

INSERT INTO ticket_types (id, code, name) VALUES
    (md5('type-access')::uuid, 'access', 'Acesso e permissões'),
    (md5('type-network')::uuid, 'network', 'Rede e conectividade'),
    (md5('type-hardware')::uuid, 'hardware', 'Hardware'),
    (md5('type-printing')::uuid, 'printing', 'Impressão'),
    (md5('type-software')::uuid, 'software', 'Software');

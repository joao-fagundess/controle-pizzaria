-- Massa fictícia de helpdesk, com distribuição irregular em cerca de oito meses.
-- UUIDs derivados de chaves do seed permitem repetir a execução sem apagar a operação.

INSERT INTO users (id, name, email, role, source_system, external_id)
SELECT md5('demo-user-' || technician_number)::uuid, technician_name,
       'tecnico' || technician_number || '@example.invalid',
       CASE WHEN technician_number = 1 THEN 'supervisor' ELSE 'technician' END,
       'demo', 'technician-' || technician_number
FROM unnest(ARRAY['Mariana Costa', 'Rafael Almeida', 'Camila Souza', 'Bruno Ferreira',
                  'Juliana Nascimento', 'Diego Martins']) WITH ORDINALITY
     AS technicians(technician_name, technician_number)
ON CONFLICT (id) DO NOTHING;

INSERT INTO requesters (id, name, department, email, source_system, external_id)
SELECT md5('demo-requester-' || requester_number)::uuid, requester_name,
       (ARRAY['Recepção', 'Financeiro', 'Comercial', 'Recursos Humanos', 'Logística', 'Compras'])
         [1 + ((requester_number - 1) % 6)::integer],
       'solicitante' || requester_number || '@example.invalid', 'demo', 'requester-' || requester_number
FROM unnest(ARRAY['Ana Paula Ribeiro', 'Carlos Eduardo Lima', 'Beatriz Oliveira', 'Pedro Henrique Santos',
                  'Fernanda Rocha', 'Lucas Carvalho', 'Patrícia Gomes', 'André Barbosa',
                  'Larissa Mendes', 'Gustavo Teixeira', 'Renata Castro', 'Vinícius Dias',
                  'Sônia Moreira', 'Felipe Araújo', 'Cláudia Batista', 'Márcio Fernandes',
                  'Tatiane Lopes', 'Roberto Vieira', 'Débora Cardoso', 'João Vitor Reis',
                  'Mônica Freitas', 'Leandro Melo', 'Cristiane Duarte', 'Paulo Sérgio Alves'])
     WITH ORDINALITY AS requesters_seed(requester_name, requester_number)
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE seed_blueprints (
    blueprint_number integer PRIMARY KEY, type_code text, title text, technical_note text
) ON COMMIT DROP;

INSERT INTO seed_blueprints VALUES
    (1, 'printing', 'Impressora da recepção não imprime', 'Fila de impressão revisada; driver reinstalado e página de teste validada.'),
    (2, 'access', 'Acesso à VPN bloqueado após troca de senha', 'Credenciais sincronizadas e perfil de VPN revisado com o solicitante.'),
    (3, 'software', 'Sistema financeiro fecha ao emitir relatório', 'Logs coletados e versão do cliente comparada com o pacote homologado.'),
    (4, 'network', 'Wi-Fi do estoque perde conexão', 'Cobertura medida no estoque e interferência no canal do ponto de acesso identificada.'),
    (5, 'access', 'Usuária sem acesso à pasta do financeiro', 'Permissões da pasta comparadas com o grupo autorizado pelo gestor.'),
    (6, 'software', 'Outlook não sincroniza novas mensagens', 'Perfil de correio revisado e conectividade com o servidor validada.'),
    (7, 'hardware', 'Notebook do comercial desliga sozinho', 'Temperatura e alimentação verificadas; teste de estabilidade iniciado.'),
    (8, 'network', 'Telefone IP da recepção sem registro', 'Porta de rede e provisionamento do ramal conferidos.'),
    (9, 'printing', 'Etiquetas saem desalinhadas na expedição', 'Dimensões da etiqueta e calibração da impressora conferidas.'),
    (10, 'access', 'Conta bloqueada por tentativas de autenticação', 'Origem das tentativas identificada; credencial antiga removida do dispositivo.'),
    (11, 'software', 'Planilha de fechamento não abre no Excel', 'Arquivo analisado em cópia e suplementos desabilitados para diagnóstico.'),
    (12, 'network', 'Estação do RH sem acesso à rede interna', 'Endereçamento, cabo e porta do switch verificados.'),
    (13, 'hardware', 'Monitor apresenta falhas de imagem', 'Cabo e monitor substitutos testados para isolar a falha.'),
    (14, 'software', 'Certificado digital não aparece no navegador', 'Cadeia do certificado e serviço do token verificados.'),
    (15, 'access', 'Novo colaborador sem acesso ao sistema de compras', 'Perfil solicitado comparado com a autorização do responsável da área.'),
    (16, 'network', 'VPN conecta mas não acessa o ERP', 'Rotas e resolução de nomes verificadas após estabelecer o túnel.'),
    (17, 'software', 'Atualização do ERP impede emissão de pedidos', 'Versão instalada identificada e falha reproduzida em ambiente de validação.'),
    (18, 'printing', 'Scanner não envia documentos para a pasta compartilhada', 'Destino SMB e conta de serviço revisados sem registrar senhas no chamado.'),
    (19, 'hardware', 'Leitor de código de barras não reconhece etiquetas', 'Interface USB e padrão de leitura conferidos com amostras da operação.'),
    (20, 'access', 'Permissão de aprovação de despesas não disponível', 'Grupo de aprovação confrontado com o cadastro autorizado pelo financeiro.'),
    (21, 'software', 'Navegador bloqueia acesso ao portal de fornecedores', 'Políticas do navegador e cadeia de confiança verificadas.'),
    (22, 'network', 'Lentidão ao acessar arquivos do servidor', 'Latência e taxa de transferência medidas a partir da estação afetada.'),
    (23, 'software', 'Aplicativo de reuniões não detecta o microfone', 'Dispositivo padrão e permissões de áudio do aplicativo revisados.'),
    (24, 'access', 'Autenticação multifator pede novo cadastro', 'Vínculo do dispositivo conferido e procedimento de recuperação acompanhado.');

-- O hash mantém a distribuição estável sem recorrer a random() ou a datas sequenciais.
WITH seed_numbers AS (
    SELECT ticket_number,
           ('x' || substr(md5('ticket-a-' || ticket_number), 1, 7))::bit(28)::integer AS date_hash,
           ('x' || substr(md5('ticket-b-' || ticket_number), 1, 7))::bit(28)::integer AS status_hash,
           ('x' || substr(md5('ticket-c-' || ticket_number), 1, 7))::bit(28)::integer AS person_hash,
           coalesce(nullif(current_setting('app.seed_reference_date', true), '')::date,
                    (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS reference_date
    FROM generate_series(1, 480) AS ticket_number
), seed_dates AS (
    SELECT *,
           -- Os meses mais recentes têm mais demanda; dias e horários variam por chamado.
           ((ARRAY[0, 0, 0, 1, 1, 2, 3, 3, 4, 5, 6, 7])[1 + date_hash % 12] * 30
             + (status_hash % 27) + 2) AS age_days
    FROM seed_numbers
), seed_states AS (
    SELECT *,
           CASE
             WHEN status_hash % 100 < CASE WHEN age_days > 60 THEN 68 ELSE 32 END THEN 'resolved'
             WHEN status_hash % 100 < CASE WHEN age_days > 60 THEN 86 ELSE 52 END THEN 'closed'
             WHEN status_hash % 100 < CASE WHEN age_days > 60 THEN 90 ELSE 65 END THEN 'waiting'
             WHEN status_hash % 100 < CASE WHEN age_days > 60 THEN 96 ELSE 88 END THEN 'in_progress'
             ELSE 'open'
           END AS status_code,
           ((reference_date - age_days) + time '08:00' + make_interval(mins => person_hash % 571))
             AT TIME ZONE 'America/Sao_Paulo' AS created_at
    FROM seed_dates
), seed_tickets AS (
    SELECT *,
           CASE WHEN status_code IN ('resolved', 'closed')
                THEN created_at + make_interval(mins => 18 + date_hash % least(age_days * 1000, 8640))
                ELSE NULL END AS resolved_at
    FROM seed_states
)
INSERT INTO tickets (id, title, description, status_code, type_id, priority_code, assignee_id,
                     requester_id, created_at, updated_at, resolved_at, source_system, external_id)
SELECT md5('demo-ticket-' || ticket_number)::uuid, blueprint.title,
       blueprint.title || '. Ocorrência informada pelo setor; verificar impacto e registrar o diagnóstico.',
       seed_tickets.status_code, ticket_types.id,
       CASE WHEN person_hash % 100 < 8 THEN 'urgent' WHEN person_hash % 100 < 27 THEN 'high'
            WHEN person_hash % 100 < 84 THEN 'normal' ELSE 'low' END,
       CASE WHEN seed_tickets.status_code = 'open' AND person_hash % 3 = 0 THEN NULL
            ELSE md5('demo-user-' || (2 + person_hash % 5))::uuid END,
       md5('demo-requester-' || (1 + date_hash % 24))::uuid,
       created_at, CASE WHEN seed_tickets.status_code = 'closed' THEN resolved_at + interval '1 second'
                        ELSE coalesce(resolved_at, created_at + interval '35 minutes') END, resolved_at,
       'demo', 'ticket-' || ticket_number
FROM seed_tickets
JOIN seed_blueprints blueprint ON blueprint.blueprint_number = 1 + person_hash % 24
JOIN ticket_types ON ticket_types.code = blueprint.type_code
ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_history (id, ticket_id, author_id, event_type, previous_value, new_value, occurred_at)
SELECT md5('demo-history-created-' || external_id)::uuid, id, NULL, 'created', NULL,
       jsonb_build_object('status', 'open'), created_at
FROM tickets WHERE source_system = 'demo'
ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_history (id, ticket_id, author_id, event_type, previous_value, new_value, occurred_at)
SELECT md5('demo-history-progress-' || external_id)::uuid, id, assignee_id, 'status_changed',
       to_jsonb('open'::text), to_jsonb('in_progress'::text), created_at + interval '10 minutes'
FROM tickets WHERE source_system = 'demo' AND status_code <> 'open'
ON CONFLICT (id) DO NOTHING;

-- Algumas ocorrências foram reabertas; a resolução anterior existe apenas no histórico.
INSERT INTO ticket_history (id, ticket_id, author_id, event_type, previous_value, new_value, occurred_at)
SELECT md5('demo-history-first-resolution-' || external_id)::uuid, id, assignee_id, 'status_changed',
       to_jsonb('in_progress'::text), to_jsonb('resolved'::text), created_at + interval '11 minutes'
FROM tickets WHERE source_system = 'demo' AND status_code IN ('in_progress', 'resolved', 'closed')
    AND ('x' || substr(md5(external_id), 1, 7))::bit(28)::integer % 17 = 0
ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_history (id, ticket_id, author_id, event_type, previous_value, new_value, occurred_at)
SELECT md5('demo-history-reopened-' || external_id)::uuid, id, assignee_id, 'status_changed',
       to_jsonb('resolved'::text), to_jsonb('in_progress'::text), created_at + interval '11 minutes 30 seconds'
FROM tickets WHERE source_system = 'demo' AND status_code IN ('in_progress', 'resolved', 'closed')
    AND ('x' || substr(md5(external_id), 1, 7))::bit(28)::integer % 17 = 0
ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_history (id, ticket_id, author_id, event_type, previous_value, new_value, occurred_at)
SELECT md5('demo-history-last-' || external_id)::uuid, id, assignee_id, 'status_changed',
       to_jsonb('in_progress'::text), to_jsonb(CASE WHEN status_code = 'closed' THEN 'resolved' ELSE status_code END),
       coalesce(resolved_at, updated_at)
FROM tickets WHERE source_system = 'demo' AND status_code IN ('waiting', 'resolved', 'closed')
ON CONFLICT (id) DO NOTHING;

-- Fechar preserva o instante da resolução; não representa um novo atendimento.
INSERT INTO ticket_history (id, ticket_id, author_id, event_type, previous_value, new_value, occurred_at)
SELECT md5('demo-history-closed-' || external_id)::uuid, id, assignee_id, 'status_changed',
       to_jsonb('resolved'::text), to_jsonb('closed'::text), updated_at
FROM tickets WHERE source_system = 'demo' AND status_code = 'closed'
ON CONFLICT (id) DO NOTHING;

INSERT INTO technical_notes (id, ticket_id, author_id, content, created_at)
SELECT md5('demo-note-diagnosis-' || tickets.external_id)::uuid, tickets.id, tickets.assignee_id,
       blueprint.technical_note, tickets.created_at + interval '12 minutes'
FROM tickets
JOIN seed_blueprints blueprint ON blueprint.title = tickets.title
WHERE tickets.source_system = 'demo' AND tickets.status_code <> 'open'
ON CONFLICT (id) DO NOTHING;

INSERT INTO technical_notes (id, ticket_id, author_id, content, created_at)
SELECT md5('demo-note-conclusion-' || external_id)::uuid, id, assignee_id,
       CASE WHEN status_code = 'waiting' THEN 'Aguardando retorno do solicitante para continuar a validação.'
            ELSE 'Procedimento concluído e funcionamento confirmado com o solicitante.' END,
       coalesce(resolved_at, updated_at)
FROM tickets WHERE source_system = 'demo' AND status_code IN ('waiting', 'resolved', 'closed')
ON CONFLICT (id) DO NOTHING;

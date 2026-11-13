// Verifica o Java real por HTTP: captura, concorrência, fatos imutáveis e conformidade do export.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats').default;

export async function verifyAnalytics({ baseUrl, username, password, checkExportLimit }) {
  const schema = JSON.parse(await readFile(new URL('../../docs/contracts/thindesk-analytics-v1.schema.json', import.meta.url)));
  const ajv = new Ajv({ strict: true, allErrors: true }); addFormats(ajv, { mode: 'full' });
  const validate = ajv.compile(schema);
  const checks = [];
  async function check(name, work) { await work(); checks.push({ name, status: 'passed' }); console.log(`${name}: passou.`); }
  let cookie;
  const fetchSource = (path, options = {}) => fetch(new URL(path, baseUrl), { ...options, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  async function request(path, body, status = 200, method = body ? 'POST' : 'GET') {
    const response = await fetchSource(`api/v1/analytics/${path}`, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, status, `${method} ${path}`);
    if (status >= 400) { await response.body?.cancel(); return; }
    return response.json();
  }
  await check('export exige autenticação', async () => {
    const response = await fetchSource('api/v1/analytics/tickets/export'); assert.equal(response.status, 302); await response.body?.cancel();
  });
  await check('sessão válida acessa a captura complementar', async () => {
    const response = await fetchSource('login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username, password }) });
    assert.equal(response.status, 302); assert.equal(new URL(response.headers.get('location'), baseUrl).pathname, '/');
    cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; '); assert.match(cookie, /JSESSIONID=/); await response.body?.cancel();
  });
  const actor = { external_id: username, name: 'Operador de Homologação Analítica', role: 'supervisor', active: true };
  const technician = { external_id: 'analytics-tech-01', name: 'Técnico Analítico Fictício', role: 'technician', active: true };
  const requester = { external_id: 'analytics-requester-01', name: 'Solicitante Analítico Fictício', department: 'Laboratório' };
  await check('catálogos explícitos são idempotentes e impedem metadados conflitantes', async () => {
    for (const [kind, value] of [['staff', actor], ['staff', technician], ['requesters', requester], ['types', { external_id: 'analytics-printing', name: 'Impressão' }], ['types', { external_id: 'analytics-network', name: 'Rede' }]]) {
      assert.deepEqual(await request(`catalog/${kind}`, value), value); assert.deepEqual(await request(`catalog/${kind}`, value), value);
    }
    await request('catalog/staff', { ...actor, name: 'Nome conflitante' }, 409);
    await request('catalog/staff', { ...actor, email: 'nao-exportar@example.invalid' }, 400);
    await request('catalog/types', { external_id: 'id com espaço', name: 'Inválido' }, 400);
  });
  const original = { title: 'Impressora do laboratório analítico', description: 'Falha fictícia criada durante a homologação.', priority: 'normal', type_external_id: 'analytics-printing', requester_external_id: requester.external_id, assignee_external_id: null };
  await check('captura recusa dados ausentes, inválidos e datas fornecidas pelo cliente', async () => {
    const { priority, ...withoutPriority } = original;
    for (const body of [withoutPriority, { ...original, priority: 'NORMAL' }, { ...original, created_at: '2020-01-01T00:00:00Z' }, { ...original, title: '😀'.repeat(241) }, { ...original, description: '\u0000' }, { ...original, assignee_external_id: actor.external_id }]) await request('tickets', body, 400);
    await request('tickets', { ...original, requester_external_id: 'não-cadastrado' }, 409);
    const response = await fetchSource('api/v1/analytics/tickets', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{"title":"um","title":"dois"}' });
    assert.equal(response.status, 400); await response.body?.cancel();
  });
  let receipt; let id;
  const validateTicket = ticket => assert.ok(validate({ contract_version: '1.0', source_system: 'thindesk', exported_at: new Date().toISOString(), tickets: [ticket] }), JSON.stringify(validate.errors));
  await check('novo chamado registra criação real, prioridade explícita e histórico completo', async () => {
    const sourceBefore = (await request('tickets/export')).exported_at;
    receipt = await request('tickets', original, 201); id = receipt.ticket.external_id;
    const sourceAfter = (await request('tickets/export')).exported_at;
    assert.equal(receipt.revision, 1); assert.equal(receipt.ticket.status, 'open'); assert.equal(receipt.ticket.title_is_derived, false);
    assert.ok(Date.parse(receipt.ticket.created_at) >= Date.parse(sourceBefore) && Date.parse(receipt.ticket.created_at) <= Date.parse(sourceAfter));
    assert.equal(receipt.ticket.updated_at, receipt.ticket.created_at); assert.equal(receipt.ticket.resolved_at, null);
    assert.equal(receipt.ticket.history.coverage, 'complete'); assert.equal(receipt.ticket.history.items.length, 1);
    assert.deepEqual(receipt.ticket.history.items[0].author, actor); assert.equal(receipt.ticket.history.items[0].sequence, 1);
    assert.equal(receipt.ticket.history.items[0].event_type, 'created'); assert.deepEqual(receipt.ticket.technical_notes, { coverage: 'complete', items: [] });
    validateTicket(receipt.ticket); assert.deepEqual(await request(`tickets/${id}`), receipt);
  });
  const createdAt = receipt.ticket.created_at; const creationEvent = structuredClone(receipt.ticket.history.items[0]);
  let state = { ...original, status: 'in_progress', priority: 'high', type_external_id: 'analytics-network', assignee_external_id: technician.external_id };
  const put = (body = state, revision = receipt.revision, status = 200) => request(`tickets/${id}`, { ...body, expected_revision: revision }, status, 'PUT');
  await check('uma edição registra quatro transições ordenadas no mesmo instante', async () => {
    receipt = await put(); assert.equal(receipt.revision, 2); const events = receipt.ticket.history.items;
    assert.deepEqual(events.map(event => event.sequence), [1, 2, 3, 4, 5]);
    assert.deepEqual(events.slice(1).map(event => event.event_type), ['status_changed', 'priority_changed', 'type_changed', 'assignee_changed']);
    assert.equal(new Set(events.slice(1).map(event => event.occurred_at)).size, 1); assert.deepEqual(events[0], creationEvent);
  });
  await check('notas concorrentes preservam uma revisão e retornam conflito na outra', async () => {
    const responses = await Promise.all(['Nota concorrente A.', 'Nota concorrente B.'].map(content => fetchSource(`api/v1/analytics/tickets/${id}/notes`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ content, expected_revision: receipt.revision }) })));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    await Promise.all(responses.map(response => response.body?.cancel()));
    receipt = await request(`tickets/${id}`); assert.equal(receipt.revision, 3); assert.equal(receipt.ticket.technical_notes.items.length, 1);
    assert.deepEqual(receipt.ticket.technical_notes.items[0].author, actor); assert.equal(receipt.ticket.history.items.length, 5);
  });
  const firstNote = structuredClone(receipt.ticket.technical_notes.items[0]);
  let firstResolution;
  await check('resolução e fechamento preservam o instante de resolução', async () => {
    state.status = 'resolved'; receipt = await put(); firstResolution = receipt.ticket.resolved_at; assert.ok(firstResolution);
    state.status = 'closed'; receipt = await put(); assert.equal(receipt.ticket.resolved_at, firstResolution);
  });
  await check('reabertura limpa a resolução atual e mantém os fatos anteriores', async () => {
    state.status = 'waiting'; receipt = await put(); assert.equal(receipt.ticket.resolved_at, null);
    assert.deepEqual(receipt.ticket.technical_notes.items[0], firstNote);
    receipt = await request(`tickets/${id}/notes`, { content: 'Nova observação após reabertura.', expected_revision: receipt.revision });
    state.status = 'resolved'; receipt = await put(); assert.ok(Date.parse(receipt.ticket.resolved_at) >= Date.parse(firstResolution));
    assert.notEqual(receipt.ticket.resolved_at, firstResolution); assert.equal(receipt.ticket.created_at, createdAt);
  });
  await check('edição sem mudanças é estável; edição descritiva atualiza o snapshot', async () => {
    const before = structuredClone(receipt); receipt = await put(); assert.deepEqual(receipt, before);
    state.title = 'Título revisado no laboratório'; state.description += ' Descrição complementada.';
    receipt = await put(); assert.equal(receipt.revision, before.revision + 1); assert.notEqual(receipt.ticket.updated_at, before.ticket.updated_at);
    assert.deepEqual(receipt.ticket.history, before.ticket.history);
    state.assignee_external_id = null; receipt = await put(); assert.equal(receipt.ticket.assignee, null);
    assert.equal(receipt.ticket.history.items.at(-1).event_type, 'assignee_changed'); assert.equal(receipt.ticket.history.items.at(-1).new_value, null);
  });
  await check('revisão antiga e campos de auditoria não sobrescrevem a versão aceita', async () => {
    await put({ ...state, status: 'open' }, 1, 409);
    await put({ ...state, resolved_at: null }, receipt.revision, 400);
    assert.deepEqual(await request(`tickets/${id}`), receipt);
    await request('tickets/homologacao-001', { ...state, expected_revision: 1 }, 404, 'PUT');
  });
  await check('API legada lê seis campos e recusa sobrescrever chamados complementares', async () => {
    const response = await fetchSource('api/chamados', { headers: { Cookie: cookie } }); assert.equal(response.status, 200);
    const legacy = (await response.json()).find(ticket => ticket.id === id);
    assert.deepEqual(Object.keys(legacy).sort(), ['descricao', 'id', 'status', 'tecnico', 'tipo', 'usuario']);
    assert.equal(legacy.descricao, state.description); assert.equal(legacy.status, 'CONCLUIDO');
    for (const [path, method, body] of [[`api/chamados/${id}`, 'PUT', JSON.stringify(legacy)], ['api/chamados', 'POST', JSON.stringify(legacy)], [`api/chamados/atualizar/${id}`, 'POST', new URLSearchParams(legacy).toString()]]) {
      const attempt = await fetchSource(path, { method, headers: { Cookie: cookie, 'Content-Type': path.includes('atualizar') ? 'application/x-www-form-urlencoded' : 'application/json' }, body });
      assert.equal(attempt.status, 409); await attempt.body?.cancel();
    }
    assert.deepEqual(await request(`tickets/${id}`), receipt);
  });
  await check('criação e edição legadas continuam disponíveis sem inventar dados analíticos', async () => {
    const response = await fetchSource('api/chamados', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ descricao: 'Registro legado fictício de compatibilidade', status: 'ABERTO', tipo: 'Impressão', tecnico: 'Técnico fictício', usuario: 'Solicitante fictício' }) });
    assert.equal(response.status, 200); const legacy = await response.json();
    const changed = await fetchSource(`api/chamados/${legacy.id}`, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...legacy, descricao: 'Registro legado fictício atualizado' }) });
    assert.equal(changed.status, 200); assert.equal((await changed.json()).descricao, 'Registro legado fictício atualizado');
    await request(`tickets/${legacy.id}`, undefined, 404);
  });
  await check('fechamento direto captura resolução e título Unicode respeita caracteres', async () => {
    const direct = await request('tickets', { ...original, title: '😀'.repeat(240) }, 201);
    const closed = await request(`tickets/${direct.ticket.external_id}`, { ...original, title: direct.ticket.title, status: 'closed', expected_revision: direct.revision }, 200, 'PUT');
    assert.ok(closed.ticket.resolved_at); assert.equal(closed.ticket.history.items.at(-1).new_value, 'closed'); validateTicket(closed.ticket);
  });
  await check('export maior que 5 MiB falha inteiro e não retorna lote truncado', async () => {
    await checkExportLimit(async () => {
      const response = await fetchSource('api/v1/analytics/tickets/export', { headers: { Cookie: cookie } });
      assert.equal(response.status, 413); const body = await response.json(); assert.ok(!Object.hasOwn(body, 'tickets'));
    });
  });
  let exported; let excludedLegacy;
  await check('export versionado valida schema, cronologia, identidades e sequência produzida', async () => {
    const response = await fetchSource('api/v1/analytics/tickets/export', { headers: { Cookie: cookie } }); assert.equal(response.status, 200);
    exported = await response.json(); assert.ok(validate(exported), JSON.stringify(validate.errors));
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(Number(response.headers.get('x-thindesk-exported')), exported.tickets.length);
    excludedLegacy = Number(response.headers.get('x-thindesk-excluded-legacy'));
    assert.ok(excludedLegacy >= 4);
    assert.ok(!exported.tickets.some(ticket => ticket.external_id.startsWith('homologacao-')));
    assert.equal(new Set(exported.tickets.map(ticket => ticket.external_id)).size, exported.tickets.length);
    const identities = new Map();
    const consistent = (scope, value) => {
      if (!value) return;
      const key = `${scope}:${value.external_id}`;
      if (identities.has(key)) assert.deepEqual(value, identities.get(key)); else identities.set(key, value);
    };
    for (const ticket of exported.tickets) {
      consistent('type', ticket.type); consistent('requester', ticket.requester); consistent('staff', ticket.assignee);
      assert.ok(Date.parse(ticket.created_at) <= Date.parse(ticket.updated_at) && Date.parse(ticket.updated_at) <= Date.parse(exported.exported_at));
      if (ticket.resolved_at) assert.ok(Date.parse(ticket.created_at) <= Date.parse(ticket.resolved_at) && Date.parse(ticket.resolved_at) <= Date.parse(ticket.updated_at));
      const events = ticket.history.items; assert.deepEqual(events.map(event => event.sequence), events.map((_, index) => index + 1));
      assert.equal(events[0].event_type, 'created'); assert.equal(events.filter(event => event.event_type === 'created').length, 1);
      assert.equal(new Set([...events, ...ticket.technical_notes.items].map(item => item.external_id)).size, events.length + ticket.technical_notes.items.length);
      const state = { ...events[0].new_value };
      for (const [index, event] of events.entries()) {
        consistent('staff', event.author);
        assert.deepEqual(event.author, actor); assert.ok(Date.parse(event.occurred_at) >= Date.parse(ticket.created_at) && Date.parse(event.occurred_at) <= Date.parse(ticket.updated_at));
        if (!index) continue;
        assert.ok(Date.parse(event.occurred_at) >= Date.parse(events[index - 1].occurred_at));
        const field = { status_changed: 'status', priority_changed: 'priority', type_changed: 'type_external_id', assignee_changed: 'assignee_external_id' }[event.event_type];
        assert.equal(event.previous_value, state[field]); state[field] = event.new_value;
      }
      assert.deepEqual(state, { status: ticket.status, priority: ticket.priority, type_external_id: ticket.type.external_id, assignee_external_id: ticket.assignee?.external_id ?? null });
      for (const note of ticket.technical_notes.items) { consistent('staff', note.author); assert.deepEqual(note.author, actor); assert.ok(Date.parse(note.created_at) >= Date.parse(ticket.created_at) && Date.parse(note.created_at) <= Date.parse(ticket.updated_at)); }
    }
    assert.deepEqual(exported.tickets.find(ticket => ticket.external_id === id), receipt.ticket);
  });
  await check('repetição do export preserva IDs, snapshots, notas e histórico', async () => {
    assert.deepEqual((await request('tickets/export')).tickets, exported.tickets);
  });
  return { checks, exported, tested_ticket_id: id, excluded_legacy: excludedLegacy };
}

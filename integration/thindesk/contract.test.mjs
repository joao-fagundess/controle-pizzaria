// Confere a estrutura proposta do export e seus exemplos, sem importar dados ou acessar a origem.
// Cronologia, identidade entre registros e transições exigem validação semântica na implementação futura.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');
const documents = new URL('../../docs/contracts/', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, documents), 'utf8'));
const schema = await json('thindesk-analytics-v1.schema.json');
const resolved = await json('examples/valid-resolved.json');
const reopened = await json('examples/valid-reopened-partial.json');
const legacy = await json('examples/invalid-legacy.json');
const validator = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
addFormats(validator, { mode: 'full' });
const validate = validator.compile(schema);
const diagnostic = () => JSON.stringify(validate.errors);

test('aceita o exemplo resolvido com histórico completo e nota', () => {
  assert.equal(validate(resolved), true, diagnostic());
});
test('aceita reabertura com histórico parcial e notas não fornecidas', () => {
  assert.equal(validate(reopened), true, diagnostic());
});
test('recusa o formato legado sem completar seus campos', () => {
  const before = structuredClone(legacy);
  assert.equal(validate(legacy), false);
  assert.deepEqual(legacy, before);
});
test('validação não modifica o exemplo aceito', () => {
  const example = structuredClone(resolved);
  const before = structuredClone(example);
  assert.equal(validate(example), true, diagnostic());
  assert.deepEqual(example, before);
});
test('aceita export vazio sem inferir exclusão de chamados', () => {
  assert.equal(validate({ ...structuredClone(resolved), tickets: [] }), true, diagnostic());
});
test('aceita offset explícito e autor desconhecido', () => {
  const example = structuredClone(resolved);
  example.tickets[0].created_at = '2026-11-11T06:00:00.000-03:00';
  example.tickets[0].technical_notes.items[0].author = null;
  assert.equal(validate(example), true, diagnostic());
});
test('coleção completa de notas pode estar vazia', () => {
  const example = structuredClone(resolved);
  example.tickets[0].technical_notes.items = [];
  assert.equal(validate(example), true, diagnostic());
});
test('aceita fechamento preservando a resolução anterior', () => {
  const example = structuredClone(resolved);
  const ticket = example.tickets[0];
  ticket.status = 'closed';
  ticket.updated_at = '2026-11-11T13:00:00.000Z';
  ticket.history.items.push({ external_id: 'event-closed', sequence: 4, event_type: 'status_changed', author: null,
    occurred_at: ticket.updated_at, previous_value: 'resolved', new_value: 'closed' });
  assert.equal(validate(example), true, diagnostic());
});
test('aceita dados principais completos com histórico indisponível declarado', () => {
  const example = structuredClone(resolved);
  example.tickets[0].history = { coverage: 'unavailable', items: [] };
  assert.equal(validate(example), true, diagnostic());
});
test('aceita notas parciais com observações e autor supervisor', () => {
  const example = structuredClone(resolved);
  example.tickets[0].technical_notes.coverage = 'partial';
  example.tickets[0].technical_notes.items[0].author = { external_id: 'example-supervisor', name: 'Supervisor de teste', role: 'supervisor', active: true };
  assert.equal(validate(example), true, diagnostic());
});
test('aceita eventos no mesmo instante com sequência explícita', () => {
  const example = structuredClone(resolved);
  example.tickets[0].history.items[1].occurred_at = example.tickets[0].history.items[0].occurred_at;
  assert.equal(validate(example), true, diagnostic());
});

const rejectedCases = [
  ['versão desconhecida', (example, ticket) => { example.contract_version = '2.0'; }],
  ['origem desconhecida', example => { example.source_system = 'other'; }],
  ['data local sem offset', (_, ticket) => { ticket.created_at = '2026-11-11T09:00:00'; }],
  ['dia de calendário impossível', (_, ticket) => { ticket.created_at = '2026-02-30T09:00:00.000Z'; }],
  ['criação ausente', (_, ticket) => { delete ticket.created_at; }],
  ['prioridade ausente sem aplicar Normal por padrão', (_, ticket) => { delete ticket.priority; }],
  ['prioridade fora do catálogo', (_, ticket) => { ticket.priority = 'critical'; }],
  ['status legado no contrato novo', (_, ticket) => { ticket.status = 'CONCLUIDO'; }],
  ['resolvido sem data de resolução', (_, ticket) => { ticket.resolved_at = null; }],
  ['resolução em chamado reaberto', (_, ticket) => { ticket.status = 'in_progress'; }],
  ['solicitante sem identidade', (_, ticket) => { delete ticket.requester.external_id; }],
  ['responsável com papel de supervisor', (_, ticket) => { ticket.assignee.role = 'supervisor'; }],
  ['identidade com espaços', (_, ticket) => { ticket.external_id = ' id-invalido '; }],
  ['título acima de 240 caracteres', (_, ticket) => { ticket.title = 'a'.repeat(241); }],
  ['título derivado sem declaração de origem', (_, ticket) => { delete ticket.title_is_derived; }],
  ['nome vazio', (_, ticket) => { ticket.requester.name = '   '; }],
  ['controle NUL em texto', (_, ticket) => { ticket.description = 'Texto\u0000inválido'; }],
  ['campo extra de credencial', example => { example.password = 'apenas-exemplo-ficticio'; }],
  ['campo extra não solicitado na pessoa', (_, ticket) => { ticket.requester.phone = 'telefone-ficticio'; }],
  ['histórico completo sem criação', (_, ticket) => { ticket.history.items.shift(); }],
  ['duas criações em histórico completo', (_, ticket) => { ticket.history.items.push(structuredClone(ticket.history.items[0])); }],
  ['histórico indisponível com eventos', (_, ticket) => { ticket.history.coverage = 'unavailable'; }],
  ['histórico parcial sem observações', (_, ticket) => { ticket.history = { coverage: 'partial', items: [] }; }],
  ['notas indisponíveis com conteúdo', (_, ticket) => { ticket.technical_notes.coverage = 'unavailable'; }],
  ['notas parciais sem observações', (_, ticket) => { ticket.technical_notes = { coverage: 'partial', items: [] }; }],
  ['nota sem identificador estável', (_, ticket) => { delete ticket.technical_notes.items[0].external_id; }],
  ['nota com objeto em vez de texto', (_, ticket) => { ticket.technical_notes.items[0].content = { text: 'Exemplo' }; }],
  ['evento de prioridade com valor de status', (_, ticket) => {
    ticket.history.items.push({ external_id: 'event-priority', sequence: 4, event_type: 'priority_changed', author: null,
      occurred_at: ticket.updated_at, previous_value: 'normal', new_value: 'resolved' });
  }],
  ['evento de criação com estado inicial incompleto', (_, ticket) => { delete ticket.history.items[0].new_value.type_external_id; }],
  ['evento sem sequência', (_, ticket) => { delete ticket.history.items[0].sequence; }],
  ['sequência fracionária', (_, ticket) => { ticket.history.items[0].sequence = 1.5; }],
];
for (const [name, change] of rejectedCases) {
  test(`recusa ${name}`, () => {
    const example = structuredClone(resolved);
    change(example, example.tickets[0]);
    const before = structuredClone(example);
    assert.equal(validate(example), false, name);
    assert.deepEqual(example, before, 'A validação não deve corrigir ou remover campos.');
  });
}

test('formato válido não comprova cronologia: regra semântica fica explícita', () => {
  const example = structuredClone(resolved);
  example.tickets[0].updated_at = '2026-11-01T00:00:00.000Z';
  assert.equal(validate(example), true, 'JSON Schema não compara datas de campos distintos.');
});
test('schema não substitui unicidade por identidade nem mapeamento de catálogo', () => {
  const example = structuredClone(resolved);
  example.tickets.push(structuredClone(example.tickets[0]));
  example.tickets[1].description = 'Outro payload para a mesma identidade.';
  example.tickets[1].type.external_id = 'tipo-sem-mapeamento';
  assert.equal(validate(example), true, 'Essas verificações pertencem à futura validação semântica.');
});

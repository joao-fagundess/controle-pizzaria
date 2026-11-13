// Deriva um contexto separado do código verificado, sem alterar a extração original nem copiar suas credenciais.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = join(root, '.cache/thindesk-homologation');
const original = join(cache, 'source');
const target = join(cache, 'analytics-source');
const manifestPath = join(cache, 'analytics-build-manifest.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const base = JSON.parse(await readFile(join(cache, 'source-manifest.json'), 'utf8'));
assert.equal(base.archive_sha256, 'CECBA3087577848DF5A975217F42AEE4821DB30B61E3D0DA326F90AB3E2E73C7');
async function safeDirectory(path) {
  try { assert.ok((await lstat(path)).isDirectory() && !(await lstat(path)).isSymbolicLink(), 'Diretório não pode ser um link.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(path); }
}
for (const directory of [join(root, '.cache'), cache, original, target]) await safeDirectory(directory);
function confined(parent, path) {
  const result = resolve(parent, path);
  const part = relative(parent, result);
  assert.ok(part && !part.startsWith('..') && !isAbsolute(part), 'Caminho fora do contexto.');
  return result;
}
async function inventory(parent, allowed) {
  for (const entry of await readdir(parent, { recursive: true })) {
    const item = await lstat(join(parent, entry));
    assert.ok(!item.isSymbolicLink(), 'Links não são aceitos no contexto.');
    if (item.isFile()) assert.ok(allowed.has(entry.replaceAll('\\', '/')), `Arquivo inesperado: ${entry}`);
  }
}
const files = new Map();
for (const file of base.copied_files) {
  const bytes = await readFile(confined(original, file.path));
  assert.equal(hash(bytes), file.sha256, `Origem modificada: ${file.path}`);
  files.set(file.path, bytes);
}
await inventory(original, new Set([...files.keys(), 'src/main/resources/application.properties', '.dockerignore']));
const config = await readFile(join(root, 'integration/thindesk/application.properties'));
assert.equal((await readFile(join(original, 'src/main/resources/application.properties'), 'utf8')).replaceAll('\r\n', '\n').trimEnd(), config.toString().replaceAll('\r\n', '\n').trimEnd());
files.set('src/main/resources/application.properties', config);
files.set('.dockerignore', Buffer.from('target/\n.env\n.env.*\n*.log\n'));
const servicePath = 'src/main/java/com/pfc/thindesk/service/ChamadoService.java';
let service = files.get(servicePath).toString().replaceAll('\r\n', '\n');
function patch(before, after) {
  assert.equal(service.split(before).length, 2, 'O ponto de extensão da origem mudou.');
  service = service.replace(before, after);
}
patch('    private ChamadoRepository chamadoRepository;', `    private ChamadoRepository chamadoRepository;

    @Autowired
    private org.springframework.data.mongodb.core.MongoTemplate analyticsMongo;

    // Escritas antigas não podem apagar fatos capturados pela API complementar.
    private void protectAnalytics(String id) {
        if (id != null && analyticsMongo.getCollection("chamados").find(
            new org.bson.Document("_id", id).append("_analytics", new org.bson.Document("$exists", true))).first() != null)
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT, "Use a API complementar para alterar este chamado.");
    }`);
patch('    public Chamado criarChamado(Chamado chamado) {', '    public Chamado criarChamado(Chamado chamado) {\n        protectAnalytics(chamado.getId());');
patch('    public Chamado atualizarChamado(String id, Chamado chamadoAtualizado) {', '    public Chamado atualizarChamado(String id, Chamado chamadoAtualizado) {\n        protectAnalytics(id);');
files.set(servicePath, Buffer.from(service));
const overlays = [];
for (const name of ['AnalyticsController.java', 'AnalyticsService.java']) {
  const path = `integration/thindesk/analytics/${name}`;
  const bytes = await readFile(join(root, path));
  files.set(`src/main/java/com/pfc/thindesk/analytics/${name}`, bytes);
  overlays.push({ path, sha256: hash(bytes) });
}
let previous;
try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await inventory(target, new Set(previous ? previous.files.map(file => file.path) : []));
if (previous) for (const file of previous.files) {
  assert.equal(hash(await readFile(confined(target, file.path))), file.sha256, `Derivação editada; alterações preservadas: ${file.path}`);
}
for (const [path, bytes] of files) {
  const destination = confined(target, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}
await writeFile(manifestPath, JSON.stringify({ archive_sha256: base.archive_sha256, original_files_verified: base.copied_files.length,
  original_source_modified: false, patched_files: [servicePath], overlays,
  preparation_script_sha256: hash(await readFile(fileURLToPath(import.meta.url))),
  dockerfile_sha256: hash(await readFile(join(root, 'integration/thindesk/Dockerfile'))),
  compose_sha256: hash(await readFile(join(root, 'docker-compose.thindesk-analytics.yml'))),
  files: [...files].map(([path, bytes]) => ({ path, sha256: hash(bytes) })) }, null, 2) + '\n');
console.log('Contexto derivado preparado: .cache/thindesk-homologation/analytics-source. Origem verificada e preservada.');

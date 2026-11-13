// Cliente de leitura da origem Java, com sessão explícita e validação da resposta.
// Redirecionamentos e HTML de login nunca são aceitos como uma lista de chamados.
import { ThindeskError } from './thindesk-error.js';
export interface ThindeskAccess {
  baseUrl: string;
  username?: string;
  password?: string;
  sessionCookie?: string;
  timeoutMs?: number;
}
export const sourceByteLimit = 5 * 1024 * 1024;

export async function readJsonResponse(response: Response): Promise<unknown> {
  if (!response.ok || response.status >= 300) {
    await response.body?.cancel();
    throw new ThindeskError(`Thindesk respondeu HTTP ${response.status}; consulta não preservada.`);
  }
  if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel();
    throw new ThindeskError('Thindesk não devolveu JSON; confira autenticação e endereço da API.');
  }
  if (Number(response.headers.get('content-length')) > sourceByteLimit) {
    await response.body?.cancel();
    throw new ThindeskError('A resposta do Thindesk excede o limite de 5 MiB.');
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  if (reader) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > sourceByteLimit) {
        await reader.cancel();
        throw new ThindeskError('A resposta do Thindesk excede o limite de 5 MiB.');
      }
      chunks.push(chunk.value);
    }
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new ThindeskError('O conteúdo recebido do Thindesk não é um JSON válido.'); }
}

async function fetchThindeskJson(access: ThindeskAccess, path: string): Promise<unknown> {
  const base = new URL(access.baseUrl.endsWith('/') ? access.baseUrl : `${access.baseUrl}/`);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new ThindeskError('THINDESK_BASE_URL deve ser uma URL HTTP/HTTPS sem credenciais, query ou fragmento.');
  }
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    throw new ThindeskError('O acesso remoto ao Thindesk exige HTTPS.');
  }
  const signal = AbortSignal.timeout(access.timeoutMs ?? 15_000);
  let sessionCookie = access.sessionCookie;
  if (sessionCookie && /[\r\n]/.test(sessionCookie)) throw new ThindeskError('Cookie de sessão inválido.');
  if (!sessionCookie) {
    if (!access.username || !access.password) throw new ThindeskError('Configure sessão ou usuário e senha para ler o Thindesk.');
    const loginResponse = await fetch(new URL('login', base), { method: 'POST', redirect: 'manual', signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: access.username, password: access.password }) });
    const destination = new URL(loginResponse.headers.get('location') ?? 'login?error', base);
    if (![302, 303].includes(loginResponse.status) || destination.origin !== base.origin ||
        /\/login\/?$/.test(destination.pathname) || destination.searchParams.has('error')) {
      await loginResponse.body?.cancel();
      throw new ThindeskError('O login no Thindesk não foi confirmado.');
    }
    sessionCookie = loginResponse.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
    await loginResponse.body?.cancel();
    if (!sessionCookie) throw new ThindeskError('O Thindesk não forneceu uma sessão autenticada.');
  }
  const ticketResponse = await fetch(new URL(path, base), { redirect: 'manual', signal,
    headers: { Accept: 'application/json', Cookie: sessionCookie } });
  return readJsonResponse(ticketResponse);
}

export async function fetchThindeskExport(access: ThindeskAccess): Promise<unknown> {
  return fetchThindeskJson(access, 'api/v1/analytics/tickets/export');
}

export async function fetchThindeskTickets(access: ThindeskAccess): Promise<unknown[]> {
  const sourceTickets = await fetchThindeskJson(access, 'api/chamados');
  if (!Array.isArray(sourceTickets)) throw new ThindeskError('A API do Thindesk deve devolver uma lista de chamados.');
  return sourceTickets;
}

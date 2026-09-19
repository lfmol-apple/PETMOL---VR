/**
 * GET /auth/me com dedupe. Um único carregamento da Home disparava /auth/me
 * 3-5× (AuthContext + 2 pontos do bootstrap dos pets) — cada uma é uma ida e
 * volta de rede em série com o resto do boot. Requisições iguais (mesmo
 * token) dentro de TTL_MS compartilham a mesma resposta.
 *
 * Só GET. PATCH/DELETE /auth/me continuam chamando fetch direto. `invalidateMe()`
 * deve ser chamado depois de qualquer PATCH pra próxima leitura ver o dado novo.
 */
const TTL_MS = 4000;

let cached: { key: string; at: number; promise: Promise<Response> } | null = null;

export function invalidateMe(): void {
  cached = null;
}

export function fetchMe(apiBase: string, token: string | null, timeoutMs = 15000): Promise<Response> {
  const key = `${apiBase}|${token ?? ''}`;
  const now = Date.now();
  if (cached && cached.key === key && now - cached.at < TTL_MS) {
    return cached.promise.then((r) => r.clone());
  }
  const promise = fetch(`${apiBase}/auth/me`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });
  cached = { key, at: now, promise };
  // falha de rede não fica em cache
  promise.catch(() => { if (cached?.promise === promise) cached = null; });
  return promise.then((r) => r.clone());
}

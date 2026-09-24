/**
 * GET /pets com dedupe — mesma ideia de fetchMe. O boot da Home tem dois
 * pontos (forceLoadPets e loadPets) que pediam a lista de pets ao mesmo
 * tempo; requisições iguais (mesmo token) dentro de TTL_MS compartilham a
 * mesma resposta, poupando uma ida e volta de rede inteira em conexão móvel.
 *
 * Só GET da lista. Depois de criar/editar/apagar um pet, chame `invalidatePets()`
 * pra próxima leitura ver o dado novo.
 */
const TTL_MS = 4000;

let cached: { key: string; at: number; promise: Promise<Response> } | null = null;

export function invalidatePets(): void {
  cached = null;
}

export function fetchPets(apiBase: string, token: string | null, timeoutMs = 15000): Promise<Response> {
  const key = `${apiBase}|${token ?? ''}`;
  const now = Date.now();
  if (cached && cached.key === key && now - cached.at < TTL_MS) {
    return cached.promise.then((r) => r.clone());
  }
  const promise = fetch(`${apiBase}/pets`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });
  cached = { key, at: now, promise };
  // falha de rede não fica em cache
  promise.catch(() => { if (cached?.promise === promise) cached = null; });
  return promise.then((r) => r.clone());
}

export function getPetmolClientId(): string {
  if (typeof window === 'undefined') return 'server';
  const key = 'petmol_client_id';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = (globalThis.crypto?.randomUUID?.() as string) || `cid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

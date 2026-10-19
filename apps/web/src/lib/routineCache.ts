// Último estado conhecido dos botões de rotina (relógio do passeio, banheirinha) por pet, guardado no aparelho:
// a Home desenha o botão NA HORA, já na cor certa, e confirma com o servidor logo depois.
const PREFIX = 'petmol_rotina_cache_v1_';

export function readRoutineCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeRoutineCache(key: string, value: unknown | null): void {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch { /* sem armazenamento: só perde o ganho de velocidade */ }
}

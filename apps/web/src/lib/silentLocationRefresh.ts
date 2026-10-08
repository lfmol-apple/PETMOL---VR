/**
 * Renovação silenciosa da localização de quem JÁ escolheu compartilhar.
 *
 * Nunca pede permissão e nunca abre pergunta: só age se o navegador/app JÁ liberou a
 * geolocalização (Permissions API = 'granted'); em qualquer outro estado (a perguntar, negada,
 * sem suporte à consulta) não faz nada. No máximo uma vez a cada MIN_INTERVAL_MS, com baixa
 * precisão (economiza bateria) e só a última posição vai pro servidor (que arredonda, sem histórico).
 */
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { invalidateMe } from '@/lib/fetchMe';

const STORAGE_KEY = 'petmol_loc_refreshed_at';
export const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type RefreshOutcome = 'updated' | 'throttled' | 'unsupported' | 'no-token' | 'not-granted' | 'failed';

function readLast(): number {
  try { return Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch { return 0; }
}
function writeNow(now: number): void {
  try { localStorage.setItem(STORAGE_KEY, String(now)); } catch { /* best effort */ }
}

/** Esquece a última renovação (usado ao "parar de compartilhar"). */
export function forgetLocationRefresh(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* best effort */ }
}

export type GeolocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** Lê o estado real da permissão de geolocalização via Permissions API —
 *  só LEITURA, nunca dispara o diálogo nativo (query() é passivo). Usado
 *  pelo indicador de permissões da Home (canto da foto do pet) pra
 *  distinguir "nunca perguntado" de "negado pelo usuário/SO", sem
 *  duplicar a chamada já existente abaixo. */
export async function queryGeolocationPermission(): Promise<GeolocationPermissionState> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported';
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state as GeolocationPermissionState;
  } catch {
    return 'unsupported';
  }
}

async function geolocationIsGranted(): Promise<boolean> {
  return (await queryGeolocationPermission()) === 'granted';
}

export async function refreshLocationSilently(now: number = Date.now()): Promise<RefreshOutcome> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'unsupported';
  const last = readLast();
  if (last && now - last < MIN_INTERVAL_MS) return 'throttled';
  const token = getToken();
  if (!token) return 'no-token';
  if (!(await geolocationIsGranted())) return 'not-granted';   // nunca dispara o pedido do sistema

  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false }),
    );
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    });
    if (!res.ok) return 'failed';
    writeNow(now);
    invalidateMe();
    return 'updated';
  } catch {
    return 'failed';
  }
}

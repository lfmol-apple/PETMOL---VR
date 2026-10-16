import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

export interface WalkConfig {
  enabled: boolean;
  days: number[];   // ISO: 1 = segunda ... 7 = domingo
  times: string[];  // HH:MM, de 1 a 6 horários no dia
  tz: string;
}

function headers(): Record<string, string> {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** null = recurso desligado no servidor (404) ou indisponível: a tela não mostra o relógio. */
export async function fetchWalk(petId: string): Promise<WalkConfig | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/routine/walk`, { headers: headers(), cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as WalkConfig;
  } catch {
    return null;
  }
}

export async function saveWalk(petId: string, cfg: WalkConfig): Promise<WalkConfig | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/routine/walk`, {
      method: 'PUT', headers: headers(), body: JSON.stringify(cfg),
    });
    if (!res.ok) return null;
    return (await res.json()) as WalkConfig;
  } catch {
    return null;
  }
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

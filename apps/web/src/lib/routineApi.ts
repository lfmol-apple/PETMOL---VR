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

// ── Banho e tosa ──────────────────────────────────────────────────────────────

export interface BathConfig {
  enabled: boolean;
  interval_days: number;          // de quantos em quantos dias (qualquer número, 1–365)
  time: string;                   // HH:MM
  with_grooming: boolean;
  tz: string;
  petshop_name?: string | null;
  petshop_phone?: string | null;  // do tutor; se vazio, o do último registro de banho/tosa
  last_bath_on?: string | null;   // YYYY-MM-DD
  next_at?: string | null;        // ISO UTC do próximo aviso
}

/** null = recurso desligado no servidor (404) ou indisponível: a tela não mostra a banheirinha. */
export async function fetchBath(petId: string): Promise<BathConfig | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/routine/bath`, { headers: headers(), cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as BathConfig;
  } catch {
    return null;
  }
}

export async function saveBath(petId: string, cfg: BathConfig): Promise<BathConfig | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/routine/bath`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({
        enabled: cfg.enabled, interval_days: cfg.interval_days, time: cfg.time, with_grooming: cfg.with_grooming,
        tz: cfg.tz, petshop_name: cfg.petshop_name ?? null, petshop_phone: cfg.petshop_phone ?? null,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as BathConfig;
  } catch {
    return null;
  }
}

async function bathAction(petId: string, action: 'done' | 'snooze'): Promise<BathConfig | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/routine/bath/${action}`, { method: 'POST', headers: headers() });
    if (!res.ok) return null;
    return (await res.json()) as BathConfig;
  } catch {
    return null;
  }
}
export const bathDone = (petId: string) => bathAction(petId, 'done');
export const bathSnooze = (petId: string) => bathAction(petId, 'snooze');

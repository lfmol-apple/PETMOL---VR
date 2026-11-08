import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { HeatCycle } from '@/lib/heatCycles';

function headers(): Record<string, string> {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export type HeatResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch { /* sem corpo */ }
  return 'Não foi possível salvar agora. Tente de novo.';
}

export async function fetchHeatCycles(petId: string): Promise<HeatCycle[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/heat-cycles`, { headers: headers(), cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as HeatCycle[];
  } catch {
    return null;
  }
}

export interface HeatCycleInput {
  started_on: string;
  ended_on?: string | null;
  mated_on?: string | null;
  notes?: string | null;
}

export async function createHeatCycle(petId: string, input: HeatCycleInput): Promise<HeatResult<HeatCycle>> {
  try {
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/heat-cycles`, { method: 'POST', headers: headers(), body: JSON.stringify(input) });
    return res.ok ? { ok: true, data: (await res.json()) as HeatCycle } : { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: 'Sem conexão. Tente de novo.' };
  }
}

export async function updateHeatCycle(
  petId: string,
  cycleId: string,
  patch: Partial<HeatCycleInput> & { clear_ended_on?: boolean },
): Promise<HeatResult<HeatCycle>> {
  try {
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/heat-cycles/${cycleId}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) });
    return res.ok ? { ok: true, data: (await res.json()) as HeatCycle } : { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: 'Sem conexão. Tente de novo.' };
  }
}

export async function deleteHeatCycle(petId: string, cycleId: string): Promise<HeatResult<null>> {
  try {
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/heat-cycles/${cycleId}`, { method: 'DELETE', headers: headers() });
    return res.ok ? { ok: true, data: null } : { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: 'Sem conexão. Tente de novo.' };
  }
}

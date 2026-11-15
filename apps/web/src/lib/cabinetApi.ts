import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

export type CabinetCategory = 'higiene' | 'alimentacao' | 'saude' | 'brinquedos' | 'passeio' | 'outros';

export interface CabinetItem {
  id: string;
  pet_id: string;
  name: string;
  brand?: string | null;
  category: CabinetCategory;
  gtin?: string | null;
  image_url?: string | null;
  duration_days?: number | null;
  started_on?: string | null;
  ends_on?: string | null;
  days_left?: number | null;
  notes?: string | null;
}

export interface CabinetItemInput {
  name: string;
  brand?: string | null;
  category?: CabinetCategory;
  gtin?: string | null;
  image_url?: string | null;
  duration_days?: number | null;
}

export type CabinetResult<T> = { ok: true; data: T } | { ok: false; message: string };

function headers(): Record<string, string> {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch { /* sem corpo */ }
  return 'Não foi possível salvar agora. Tente de novo.';
}

const base = (petId: string) => `${API_BASE_URL}/pets/${petId}/cabinet`;

export async function fetchCabinet(petId: string): Promise<CabinetItem[] | null> {
  try {
    const res = await fetch(base(petId), { headers: headers(), cache: 'no-store' });
    return res.ok ? ((await res.json()) as CabinetItem[]) : null;
  } catch {
    return null;
  }
}

export async function addCabinetItem(petId: string, input: CabinetItemInput): Promise<CabinetResult<CabinetItem>> {
  try {
    const res = await fetch(base(petId), { method: 'POST', headers: headers(), body: JSON.stringify(input) });
    return res.ok ? { ok: true, data: (await res.json()) as CabinetItem } : { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: 'Sem conexão. Tente de novo.' };
  }
}

export interface CabinetPatch {
  duration_days?: number;
  clear_duration?: boolean;
  restarted_today?: boolean;
}

export async function updateCabinetItem(petId: string, itemId: string, patch: CabinetPatch): Promise<CabinetResult<CabinetItem>> {
  try {
    const res = await fetch(`${base(petId)}/${itemId}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) });
    return res.ok ? { ok: true, data: (await res.json()) as CabinetItem } : { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: 'Sem conexão. Tente de novo.' };
  }
}

export async function deleteCabinetItem(petId: string, itemId: string): Promise<CabinetResult<null>> {
  try {
    const res = await fetch(`${base(petId)}/${itemId}`, { method: 'DELETE', headers: headers() });
    return res.ok ? { ok: true, data: null } : { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: 'Sem conexão. Tente de novo.' };
  }
}

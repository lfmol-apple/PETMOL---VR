import { getToken } from '@/lib/auth-token';
import type { UserRow } from '@/lib/admin/analyticsApi';

/** Linha da lista de tutores com os dados de conta que o BI antigo não mostrava. */
export interface TutorRow extends UserRow {
  phone: string | null;
  whatsapp: boolean;
  neighborhood: string | null;
  country: string | null;
  login_methods: string[];
  terms_accepted: boolean;
  terms_version: string | null;
  terms_accepted_at: string | null;
  checkin_day: number | null;
  checkin_hour: number | null;
  first_seen: string | null;
  ip_city: string | null;
  ip_region: string | null;
  origin_campaign: string | null;
  origin_source: string | null;
}

export interface TutorsListResponse {
  total: number; page: number; page_size: number; items: TutorRow[];
}

/** Conta completa, como o admin edita (GET/PATCH /v1/admin/accounts/{id}). */
export interface AccountRecord {
  user_id: string;
  name: string | null; email: string; phone: string | null; whatsapp: boolean;
  postal_code: string | null; street: string | null; number: string | null; complement: string | null;
  neighborhood: string | null; city: string | null; state: string | null; country: string | null;
  email_verified: boolean;
  terms_accepted: boolean; terms_version: string | null; terms_accepted_at: string | null;
  login_methods: string[];
  lat: number | null; lng: number | null; location_source: string | null; location_updated_at: string | null;
  monthly_checkin_day: number; monthly_checkin_hour: number;
  created_at: string; updated_at: string;
}

export type AccountEdit = Partial<Pick<AccountRecord,
  'name' | 'email' | 'phone' | 'whatsapp' | 'postal_code' | 'street' | 'number' | 'complement'
  | 'neighborhood' | 'city' | 'state' | 'country' | 'email_verified'>>;

async function accountFetch<T>(userId: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api/v1/admin/accounts/${encodeURIComponent(userId)}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === 'string' ? body.detail : `Erro ${res.status}`;
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const getAccount = (userId: string) => accountFetch<AccountRecord>(userId);
export const editAccount = (userId: string, edit: AccountEdit) =>
  accountFetch<AccountRecord>(userId, { method: 'PATCH', body: JSON.stringify(edit) });

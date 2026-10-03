'use client';

/**
 * Typed client for /v1/admin/campaigns/* — mesma guarda (JWT ou chave
 * read-only) e mesmo padrão de fetch do analyticsApi.ts, só que pro domínio
 * de campanhas de ativação (não BI de analytics).
 */
import { getToken } from '@/lib/auth-token';
import { AdminApiError } from './analyticsApi';

const BASE = '/api/v1/admin/campaigns';

export async function campaignsGet<T = unknown>(path: string): Promise<T> {
  const token = getToken();
  if (!token) {
    if (typeof window !== 'undefined') window.location.href = '/home';
    throw new AdminApiError(401, 'no token');
  }
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      if (typeof window !== 'undefined') window.location.href = '/home';
    }
    const body = await res.json().catch(() => ({}));
    throw new AdminApiError(res.status, body.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface ActivationConversion {
  campaign: string;
  contacted_total: number;
  converted_push: number;
  converted_location: number;
  converted_either: number;
  last_contacted_at: string | null;
}

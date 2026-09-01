'use client';

/**
 * Typed client for /v1/admin/analytics/*. Read-only BI endpoints, guarded
 * server-side by the master JWT. Frontend hiding is not the security layer.
 */
import { getToken } from '@/lib/auth-token';

const BASE = '/api/v1/admin/analytics';

export class AdminApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function adminGet<T = unknown>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const token = getToken();
  if (!token) {
    if (typeof window !== 'undefined') window.location.href = '/home';
    throw new AdminApiError(401, 'no token');
  }
  const qs = params
    ? '?' + Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const res = await fetch(`${BASE}${path}${qs}`, {
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

// ── Global filter ──────────────────────────────────────────────────────────

export interface GlobalFilter {
  period_days?: number;
  platform?: string;
  app_version?: string;
  os?: string;
  state?: string;
  city?: string;
}

export function filterParams(f: GlobalFilter): Record<string, string | number | undefined> {
  return {
    period_days: f.period_days,
    platform: f.platform,
    app_version: f.app_version,
    os: f.os,
    state: f.state,
    city: f.city,
  };
}

// ── Response shapes (partial — enough for the UI) ──────────────────────────

export interface SeriesPoint { date: string; value: number }

export interface OverviewResponse {
  generated_at: string;
  totals: Record<string, number>;
  engagement: {
    active_users_24h: number; wau: number; mau: number;
    dau_mau: number | null; sessions_7d: number; note: string;
  };
  tutors: {
    with_pet: number; without_pet: number; avg_pets_per_tutor: number;
    with_feeding_configured: number; pets_with_feeding_configured: number;
    pets_with_active_control: number;
  };
  platforms: { platform: string; users: number }[];
  app_versions: { version: string; users: number }[];
  top_features: { key: string; label: string; configured_pets: number; active_pets: number; adoption_pct: number }[];
  series: { new_users: SeriesPoint[]; new_pets: SeriesPoint[]; active_users: SeriesPoint[] };
  data_quality_headline: { issues: DataQualityIssue[] };
}

export interface FeatureRow {
  key: string; label: string; kind: string; scope: string;
  users: number; pets: number | null;
  active: number | null; stale: number | null; inactive: number | null;
  never_configured: number | null;
  adoption_pct: number; note: string;
}
export interface FeatureMatrixResponse {
  generated_at: string; total_users: number; total_pets: number;
  features: FeatureRow[]; state_rules: Record<string, string>;
}

export interface UserRow {
  user_id: string; email: string; name: string | null;
  created_at: string; last_activity: string | null; activity_status: string;
  pets: number; has_feeding: boolean; active_control_pets: number;
  last_platform: string | null; city: string | null; state: string | null;
  email_verified: boolean;
}
export interface UsersListResponse {
  total: number; page: number; page_size: number;
  sort: string; direction: string; items: UserRow[];
}

export interface DataQualityIssue {
  key: string; label: string; count: number; of: number; pct: number; drilldown: boolean;
}
export interface DataQualityResponse { generated_at: string; issues: DataQualityIssue[] }

export interface PopulationResponse {
  key: string; label: string; state: string | null; total: number;
  page: number; page_size: number;
  items: Array<Record<string, unknown>>;
}

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

export type DeviceType = 'iphone' | 'ipad' | 'android' | 'desktop' | 'outros';

export const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  iphone: 'iPhone', ipad: 'iPad', android: 'Android', desktop: 'Desktop', outros: 'Outros',
};

export interface GlobalFilter {
  period_days?: number;
  /** Recorte exato (ISO) — quando presente, manda no backend por cima de
   * period_days (ver AnalyticsFilters.build no backend). Usado pelos
   * presets finos (Hoje/Ontem/Últimas 24h) e pelo range customizado. */
  since?: string;
  until?: string;
  platform?: string;
  app_version?: string;
  os?: string;
  device_type?: DeviceType;
  state?: string;
  city?: string;
}

export function filterParams(f: GlobalFilter): Record<string, string | number | undefined> {
  return {
    period_days: f.period_days,
    since: f.since,
    until: f.until,
    platform: f.platform,
    app_version: f.app_version,
    os: f.os,
    device_type: f.device_type,
    state: f.state,
    city: f.city,
  };
}

// ── Response shapes (partial — enough for the UI) ──────────────────────────

export interface SeriesPoint { date: string; value: number }

export interface DownloadsSummary {
  total: number; ios: number; android: number; pwa: number;
  prev_period_total: number | null; delta_pct: number | null; note: string;
}
export interface AcessosSummary {
  total_sessions: number; unique_visitors: number; web: number; app_opens: number;
  prev_period_total: number | null; delta_pct: number | null; note: string;
}

export interface OverviewResponse {
  generated_at: string;
  totals: Record<string, number>;
  downloads: DownloadsSummary;
  acessos: AcessosSummary;
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

// ── Resumo do dia ("Hoje" + boletim por e-mail) ────────────────────────

export interface BriefMetric {
  label: string; value: number; prev: number; avg7: number;
  delta_prev_pct: number | null; delta_avg7_pct: number | null;
}
export interface BriefResponse {
  day: string; label: string; is_today: boolean;
  metrics: Record<string, BriefMetric>;
  funnel: { label: string; n: number }[];
  campaigns: { utm_source: string; utm_medium: string; utm_campaign: string; downloads: number; acessos: number }[];
  has_campaign_attribution: boolean;
  cities: { city: string; region: string; downloads: number; acessos: number }[];
  attention: { severity: 'critical' | 'attention' | 'info'; key: string; message: string }[];
  suggestion: { title: string; body: string } | null;
  note: string;
}

// ── Locais / campanhas ───────────────────────────────────────────────────

export interface LocationRow {
  city: string; region: string; country: string;
  downloads: number; acessos: number; total: number;
  cadastros_declared_location: number;
  lat: number | null; lng: number | null;
}
export interface LocationsResponse {
  downloads_today: number; acessos_today: number;
  downloads_campaign: number; acessos_campaign: number;
  total_campaign: number;
  places: LocationRow[]; places_total: number;
  mapped_places: number; unmapped_places: number;
  sort_by: 'total' | 'downloads' | 'acessos';
  window_label: string; custom_window: boolean;
  note: string;
}

export interface CampaignRow {
  utm_source: string; utm_medium: string; utm_campaign: string;
  downloads: number; acessos: number; visitantes_unicos: number;
  cadastros: number; gasto_brl: number;
  custo_por_download: number | null; custo_por_cadastro: number | null;
  total: number;
}
export interface CampaignsResponse {
  campaigns: CampaignRow[]; campaigns_total: number; has_any_attribution: boolean;
  totals: { downloads: number; cadastros: number; gasto_brl: number; custo_por_download: number | null; custo_por_cadastro: number | null };
  note: string;
}
export interface CampaignSpendItem { id: string; utm_campaign: string; spent_on: string; amount_brl: number; note: string | null }

export interface LocationEventRow {
  occurred_at: string | null; event: 'download' | 'acesso';
  user_id: string | null; name: string; identified: boolean;
  city: string; state: string; platform: string | null;
  utm_campaign: string; utm_source: string | null;
}
export interface LocationEventsResponse {
  total: number; page: number; page_size: number; items: LocationEventRow[]; note: string;
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

export interface PetThumbnail {
  pet_id: string; name: string; species: string; photo_url: string | null;
}
export interface UserRow {
  user_id: string; email: string; name: string | null;
  created_at: string; last_activity: string | null; activity_status: string;
  pets: number; pet_thumbnails: PetThumbnail[]; has_feeding: boolean; active_control_pets: number;
  last_platform: string | null; device_type: DeviceType | null; app_version_label: string;
  city: string | null; state: string | null;
  email_verified: boolean;
  // permissões do tutor
  push_active: boolean; push_platforms: PushPlatform[]; push_last_seen_at: string | null;
  location_source: 'gps' | 'city' | 'ip' | null; location_shared: boolean;
  location_updated_at: string | null; location_fresh: boolean;
}
export type PushPlatform = 'ios' | 'android' | 'web';
export interface PermissionsSummary {
  total_users: number;
  push: { active: number; none: number; ios: number; android: number; web: number };
  location: { gps: number; gps_fresh: number; city_only: number; ip_only: number; none: number; fresh_days: number };
  combined: { both: number; only_push: number; only_location: number; neither: number };
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

export interface PermissionSnapshotRow {
  id: string; kind: 'baseline' | 'daily' | 'manual'; taken_at: string; total_users: number;
  push_active: number; push_ios: number; push_android: number; push_web: number;
  gps: number; gps_fresh: number; both: number; only_push: number; only_location: number; neither: number;
}

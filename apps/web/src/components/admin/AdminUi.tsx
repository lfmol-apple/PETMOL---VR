'use client';

/** Peças comuns do painel do dono: filtro de período, cartão e chamada autenticada às campanhas. */
import { DateField } from '@/components/ui/DateField';
import type { GlobalFilter } from '@/lib/admin/analyticsApi';
import { getToken } from '@/lib/auth-token';
import { fmtSpDate, spStartOfToday, spYesterdayRange } from '@/lib/analytics/spTime';

export type PresetKey = '24h' | 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'all' | 'custom';
export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'all', label: 'Tudo' },
];

export function presetPatch(key: PresetKey): Pick<GlobalFilter, 'period_days' | 'since' | 'until'> {
  const now = new Date();
  switch (key) {
    case '24h': return { period_days: undefined, since: new Date(now.getTime() - 86400000).toISOString(), until: undefined };
    case 'today': return { period_days: undefined, since: spStartOfToday(now).toISOString(), until: undefined };
    case 'yesterday': {
      const { start, end } = spYesterdayRange(now);
      return { period_days: undefined, since: start.toISOString(), until: end.toISOString() };
    }
    case '7d': return { period_days: 7, since: undefined, until: undefined };
    case '30d': return { period_days: 30, since: undefined, until: undefined };
    case '90d': return { period_days: 90, since: undefined, until: undefined };
    default: return { period_days: undefined, since: undefined, until: undefined };
  }
}

export function periodLabel(filter: GlobalFilter): string {
  if (filter.since && filter.until) return `${fmtSpDate(new Date(filter.since))} até ${fmtSpDate(new Date(filter.until))}`;
  if (filter.since) return `Desde ${fmtSpDate(new Date(filter.since))}`;
  if (filter.period_days) return `Últimos ${filter.period_days} dias`;
  return 'Todo o período';
}

export function FilterBar({
  filter, setFilter, preset, applyPreset, from, to, setFrom, setTo, applyRange,
}: {
  filter: GlobalFilter;
  setFilter: React.Dispatch<React.SetStateAction<GlobalFilter>>;
  preset: PresetKey;
  applyPreset: (k: PresetKey) => void;
  from: string; to: string;
  setFrom: (v: string) => void; setTo: (v: string) => void;
  applyRange: (a: string, b: string) => void;
}) {
  const hasExtra = Boolean(filter.platform || filter.state || filter.city);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px]">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => applyPreset(p.key)}
              className={`rounded-md px-2.5 py-1 font-semibold ${preset === p.key ? 'bg-[#0056D2] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <DateField value={from} ariaLabel="De" className="w-[8.5rem]"
            onChange={(iso) => { setFrom(iso); applyRange(iso, to); }}
            inputClassName={`w-full rounded-md border px-2 py-1 pr-8 text-[13px] tabular-nums ${preset === 'custom' ? 'border-[#0056D2]' : 'border-slate-200'}`} />
          <span className="text-slate-400">até</span>
          <DateField value={to} ariaLabel="Até" className="w-[8.5rem]"
            onChange={(iso) => { setTo(iso); applyRange(from, iso); }}
            inputClassName={`w-full rounded-md border px-2 py-1 pr-8 text-[13px] tabular-nums ${preset === 'custom' ? 'border-[#0056D2]' : 'border-slate-200'}`} />
        </div>
        <select value={filter.platform || ''} aria-label="Plataforma"
          onChange={(e) => setFilter((f) => ({ ...f, platform: e.target.value || undefined }))}
          className="rounded-md border border-slate-200 px-2 py-1">
          <option value="">Todas as plataformas</option>
          <option value="ios">iPhone (app)</option>
          <option value="android">Android (app)</option>
          <option value="pwa">App instalado (PWA)</option>
          <option value="web">Navegador</option>
        </select>
        <input placeholder="UF" value={filter.state || ''} maxLength={2}
          onChange={(e) => setFilter((f) => ({ ...f, state: e.target.value.toUpperCase() || undefined }))}
          className="w-14 rounded-md border border-slate-200 px-2 py-1" />
        <input placeholder="cidade" value={filter.city || ''}
          onChange={(e) => setFilter((f) => ({ ...f, city: e.target.value || undefined }))}
          className="w-36 rounded-md border border-slate-200 px-2 py-1" />
        {hasExtra && (
          <button type="button"
            onClick={() => setFilter((f) => ({ period_days: f.period_days, since: f.since, until: f.until }))}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-500">
            limpar
          </button>
        )}
      </div>
      <p className="mt-1.5 px-1 text-[11px] font-semibold text-slate-500">Analisando: {periodLabel(filter)}</p>
    </div>
  );
}

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-[15px] font-extrabold text-slate-800">{title}</h2>
      {subtitle && <p className="mb-3 mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </section>
  );
}

export const panelFetch = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`/api/v1/admin/campaigns/panel${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === 'string' ? body.detail : `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
};

/** Chamada autenticada ao /api/v1/admin (abas novas do painel). Lança Error com a mensagem do servidor. */
export async function adminApi<T>(path: string, init?: RequestInit & { params?: Record<string, string | number | undefined> }): Promise<T> {
  const qs = init?.params
    ? '?' + new URLSearchParams(Object.entries(init.params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()
    : '';
  const { params: _params, ...rest } = init ?? {};
  void _params;
  const res = await fetch(`/api/v1/admin${path}${qs === '?' ? '' : qs}`, {
    ...rest,
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...(rest.headers || {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === 'string' ? body.detail : `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

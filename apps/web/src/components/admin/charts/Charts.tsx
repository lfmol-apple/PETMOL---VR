'use client';

/**
 * Tiny dependency-free SVG chart kit for the admin BI console.
 * Desktop-first, theme-agnostic (admin is always light). No animation loop.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';

interface Point { date: string; value: number }

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

// ── LineChart ─────────────────────────────────────────────────────────────

export function LineChart({
  data, height = 180, color = '#0056D2', label,
}: { data: Point[]; height?: number; color?: string; label?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 640;
  const pad = { l: 34, r: 12, t: 12, b: 22 };
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (data.length <= 1 ? 0 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(data.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${pad.l},${(pad.t + ih).toFixed(1)} Z`;
  const gid = useId();

  return (
    <div className="w-full">
      {label && <div className="mb-1 text-[12px] font-semibold text-slate-500">{label}</div>}
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={label}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih * t} y2={pad.t + ih * t}
              stroke="#e2e8f0" strokeWidth="1" />
            <text x={pad.l - 6} y={pad.t + ih * t + 3} textAnchor="end"
              className="fill-slate-400" fontSize="9">{Math.round(max * (1 - t))}</text>
          </g>
        ))}
        {data.length > 1 && <path d={area} fill={`url(#${gid})`} />}
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <rect key={i} x={x(i) - iw / data.length / 2} y={pad.t} width={iw / data.length} height={ih}
            fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke={color} strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(data[hover].value)} r="3.5" fill={color} />
            <text x={Math.min(x(hover) + 6, w - 90)} y={pad.t + 10} fontSize="10" className="fill-slate-700 font-semibold">
              {data[hover].date.slice(5)} · {data[hover].value}
            </text>
          </g>
        )}
        {data.length > 1 && (
          <>
            <text x={pad.l} y={height - 6} fontSize="9" className="fill-slate-400">{data[0].date.slice(5)}</text>
            <text x={w - pad.r} y={height - 6} textAnchor="end" fontSize="9" className="fill-slate-400">
              {data[data.length - 1].date.slice(5)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

// ── BarChart (horizontal ranking) ─────────────────────────────────────────

export function BarRanking({
  data, valueKey = 'value', labelKey = 'label', color = '#0056D2', max: forcedMax,
  formatValue,
}: {
  data: Array<Record<string, unknown>>;
  valueKey?: string; labelKey?: string; color?: string; max?: number;
  formatValue?: (v: number) => string;
}) {
  const max = forcedMax ?? Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const v = Number(d[valueKey]) || 0;
        return (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <div className="w-32 flex-shrink-0 truncate text-slate-600" title={String(d[labelKey])}>{String(d[labelKey])}</div>
            <div className="h-4 flex-1 rounded bg-slate-100">
              <div className="h-full rounded" style={{ width: `${(v / max) * 100}%`, background: color }} />
            </div>
            <div className="w-16 flex-shrink-0 text-right font-semibold tabular-nums text-slate-700">
              {formatValue ? formatValue(v) : v.toLocaleString('pt-BR')}
            </div>
          </div>
        );
      })}
      {data.length === 0 && <div className="text-[12px] text-slate-400">Sem dados.</div>}
    </div>
  );
}

// ── Donut ─────────────────────────────────────────────────────────────────

const DONUT_COLORS = ['#0056D2', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

export function Donut({ segments, size = 130 }: { segments: { label: string; value: number }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const r = size / 2 - 8;
  const c = size / 2;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {segments.map((s, i) => {
          const frac = s.value / total;
          const a0 = acc * 2 * Math.PI - Math.PI / 2;
          acc += frac;
          const a1 = acc * 2 * Math.PI - Math.PI / 2;
          const large = frac > 0.5 ? 1 : 0;
          const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0);
          const x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1);
          return (
            <path key={i} d={`M${c},${c} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`}
              fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
          );
        })}
        <circle cx={c} cy={c} r={r * 0.58} fill="white" />
      </svg>
      <div className="space-y-1 text-[12px]">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="text-slate-600">{s.label}</span>
            <span className="font-semibold text-slate-800">{s.value.toLocaleString('pt-BR')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────

export function StatCard({
  label, value, sub, tone = 'default', onClick, trend,
}: {
  label: string; value: ReactNode; sub?: ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  onClick?: () => void; trend?: Point[];
}) {
  const toneClass = {
    default: 'border-slate-200',
    good: 'border-emerald-200 bg-emerald-50/40',
    warn: 'border-amber-200 bg-amber-50/40',
    bad: 'border-rose-200 bg-rose-50/40',
  }[tone];
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`flex flex-col rounded-xl border bg-white p-4 text-left shadow-sm transition-shadow ${toneClass} ${onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'}`}>
      <span className="text-[12px] font-semibold text-slate-500">{label}</span>
      <span className="mt-1 text-2xl font-black tabular-nums text-slate-900">{value}</span>
      {sub && <span className="mt-1 text-[11px] font-medium text-slate-400">{sub}</span>}
      {trend && trend.length > 1 && (
        <div className="mt-2 -mb-1"><Sparkline data={trend} /></div>
      )}
    </button>
  );
}

export function Sparkline({ data, color = '#0056D2', height = 28 }: { data: Point[]; color?: string; height?: number }) {
  const w = 120;
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const rng = max - min || 1;
  const path = data.map((d, i) =>
    `${i === 0 ? 'M' : 'L'}${((i / (data.length - 1)) * w).toFixed(1)},${(height - ((d.value - min) / rng) * height).toFixed(1)}`
  ).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── Percent bar (for adoption / data quality) ─────────────────────────────

export function PercentBar({ pct, tone = 'blue' }: { pct: number; tone?: 'blue' | 'amber' | 'rose' | 'emerald' }) {
  const color = { blue: '#0056D2', amber: '#f59e0b', rose: '#ef4444', emerald: '#10b981' }[tone];
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full max-w-[120px] rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, background: color }} />
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-slate-600">{(pct * 100).toFixed(1)}%</span>
    </div>
  );
}

export function useMemoSegments(rows: { label: string; value: number }[], limit = 5) {
  return useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, limit);
    const rest = sorted.slice(limit).reduce((s, x) => s + x.value, 0);
    return rest > 0 ? [...top, { label: 'outros', value: rest }] : top;
  }, [rows, limit]);
}

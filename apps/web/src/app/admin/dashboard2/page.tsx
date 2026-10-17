'use client';

/**
 * Dashboard 2 — Crescimento. Uma pergunta só: onde as pessoas se perdem entre
 * ver o PETMOL, baixar, cadastrar-se, cadastrar o pet e configurar a ração?
 * O Mission Control (/admin/dashboard) continua intacto ao lado.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PremiumScreenShell } from '@/components/premium';
import { useAdmin } from '@/hooks/useAdmin';
import { adminGet, type GlobalFilter } from '@/lib/admin/analyticsApi';
import { getToken } from '@/lib/auth-token';
import {
  FAILURE_LABEL, PLATFORM_LABEL, pct,
  type CampaignsPanelSummary, type CampaignState, type EntryResponse, type FoodCampaignResults, type ActivationItem, type GrowthPlatformRow, type GrowthResponse, type GrowthSeriesPoint, type GrowthStep,
} from '@/lib/admin/growthApi';
import { useAsync, Loading, ErrorBox, numberFmt, RetentionSection, FeaturesSection } from '@/components/admin/sections/sections';
import { FeedingSection } from '@/components/admin/sections/FeedingSection';
import { PermissionsSection } from '@/components/admin/sections/PermissionsSection';
import { TodaySection, BaseStrip } from '@/components/admin/sections/TodaySection';
import { PhotoLightboxProvider } from '@/components/admin/PhotoLightbox';
import { TutorsSection, type TutorsPreset } from './TutorsSection';
import { fmtSpDate, spDayBounds, spStartOfToday, spYesterdayRange } from '@/lib/analytics/spTime';

type PresetKey = '24h' | 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'all' | 'custom';
const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'all', label: 'Tudo' },
];

function presetPatch(key: PresetKey): Pick<GlobalFilter, 'period_days' | 'since' | 'until'> {
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

function periodLabel(filter: GlobalFilter): string {
  if (filter.since && filter.until) return `${fmtSpDate(new Date(filter.since))} até ${fmtSpDate(new Date(filter.until))}`;
  if (filter.since) return `Desde ${fmtSpDate(new Date(filter.since))}`;
  if (filter.period_days) return `Últimos ${filter.period_days} dias`;
  return 'Todo o período';
}

export default function AdminDashboard2Page() {
  const router = useRouter();
  const { isAdmin, adminData, isLoading } = useAdmin();
  const [filter, setFilter] = useState<GlobalFilter>({ period_days: 30 });
  const [preset, setPreset] = useState<PresetKey>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preset2, setPreset2] = useState<TutorsPreset | undefined>(undefined);
  const focusTutors = (goal: TutorsPreset['goal']) => setPreset2({ goal, nonce: Date.now() });

  useEffect(() => {
    if (isLoading) return;
    if (!isAdmin) router.push('/home');
  }, [isLoading, isAdmin, router]);

  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    setFilter((f) => ({ ...f, ...presetPatch(key) }));
  };
  const applyRange = (a: string, b: string) => {
    setPreset('custom');
    setFilter((f) => ({
      ...f, period_days: undefined,
      since: a ? spDayBounds(a)?.start.toISOString() : undefined,
      until: b ? spDayBounds(b)?.end.toISOString() : undefined,
    }));
  };

  if (isLoading || !isAdmin || !adminData) {
    return (
      <PremiumScreenShell title="Crescimento" hideBack wide>
        <p className="py-16 text-center text-slate-500">Verificando autenticação…</p>
      </PremiumScreenShell>
    );
  }

  return (
    <PremiumScreenShell
      title="Crescimento"
      subtitle="Do acesso ao pet com ração cadastrada"
      hideBack
      wide
      rightAction={
        <Link href="/admin/dashboard" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-blue-300">
          Mission Control
        </Link>
      }
    >
      <div className="w-full space-y-5 px-4 py-4 sm:px-6 lg:px-10">
        <FilterBar
          filter={filter} setFilter={setFilter} preset={preset} applyPreset={applyPreset}
          from={from} to={to} setFrom={setFrom} setTo={setTo} applyRange={applyRange}
        />
        <GrowthBody filter={filter} onFocusTutors={focusTutors} />
        <TutorsSection filter={filter} preset={preset2} />
      </div>
    </PremiumScreenShell>
  );
}

// ── Filtros ───────────────────────────────────────────────────────────────

function FilterBar({
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
          <input type="date" value={from} aria-label="De"
            onChange={(e) => { setFrom(e.target.value); applyRange(e.target.value, to); }}
            className={`rounded-md border px-2 py-1 ${preset === 'custom' ? 'border-[#0056D2]' : 'border-slate-200'}`} />
          <span className="text-slate-400">até</span>
          <input type="date" value={to} aria-label="Até"
            onChange={(e) => { setTo(e.target.value); applyRange(from, e.target.value); }}
            className={`rounded-md border px-2 py-1 ${preset === 'custom' ? 'border-[#0056D2]' : 'border-slate-200'}`} />
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

// ── Corpo ─────────────────────────────────────────────────────────────────

function GrowthBody({ filter, onFocusTutors }: { filter: GlobalFilter; onFocusTutors: (g: TutorsPreset['goal']) => void }) {
  const { data, error, loading } = useAsync<GrowthResponse>(
    () => adminGet('/growth', {
      period_days: filter.period_days, since: filter.since, until: filter.until,
      platform: filter.platform, state: filter.state, city: filter.city,
    }),
    [filter.period_days, filter.since, filter.until, filter.platform, filter.state, filter.city],
  );

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  return (
    <>
      <ActivationCard data={data} onFocusTutors={onFocusTutors} />
      <TodayBlock onFocusTutors={onFocusTutors} />
      <CampaignsPanel />
      <EmailRacaoPanel />
      <LeakBanner data={data} />
      <EntryCard filter={filter} />
      <SignupReconCard filter={filter} />
      <EntryByPlatformCard filter={filter} />
      <FunnelCard data={data} />
      <StuckCards data={data} />
      <PlatformTable rows={data.platforms} />
      <RetentionBlock filter={filter} onFocusTutors={onFocusTutors} />
      <PermissionsBlock />
      <FoodCampaignCard />
      <DailySeries series={data.series} />
      <Notes notes={data.notes} />
    </>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-[15px] font-extrabold text-slate-800">{title}</h2>
      {subtitle && <p className="mb-3 mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </section>
  );
}

function ActivationCard({ data, onFocusTutors }: { data: GrowthResponse; onFocusTutors: (g: TutorsPreset['goal']) => void }) {
  const a = data.activation;
  const weakest = a.items.find((i) => i.key === a.weakest);
  return (
    <section className="rounded-2xl border-2 border-[#0056D2] bg-white p-4 shadow-sm sm:p-5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#0056D2]">Meta do PETMOL</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[34px] font-extrabold leading-none text-slate-900">{pct(a.complete_pct)}</p>
          <p className="mt-1 text-[13px] text-slate-600">
            {numberFmt(a.complete)} de {numberFmt(a.total)} cadastrados têm pet, ração, notificação e localização.
          </p>
        </div>
        <button type="button" onClick={() => onFocusTutors('incomplete')}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:border-blue-300">
          Ver quem falta
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {a.items.map((i) => <ActivationRow key={i.key} item={i} weakest={i.key === a.weakest} onFocusTutors={onFocusTutors} />)}
      </ul>

      {weakest && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <strong>Maior lacuna: {weakest.label.toLowerCase()}</strong> — {numberFmt(weakest.missing)} pessoas sem isso
          ({numberFmt(weakest.only_missing)} só precisam desta etapa para completar). {weakest.where_to_act}
        </p>
      )}
    </section>
  );
}

function ActivationRow({ item, weakest, onFocusTutors }: {
  item: ActivationItem; weakest: boolean; onFocusTutors: (g: TutorsPreset['goal']) => void;
}) {
  return (
    <li className="flex items-center gap-3">
      <div className="w-52 shrink-0 text-[13px] font-semibold text-slate-700">{item.label}</div>
      <div className="h-6 flex-1 rounded-md bg-slate-100">
        <div className={`h-6 rounded-md ${weakest ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min((item.pct ?? 0) * 100, 100)}%` }} />
      </div>
      <div className="w-24 shrink-0 text-right text-[13px] font-extrabold text-slate-900">
        {pct(item.pct)} <span className="font-medium text-slate-400">({numberFmt(item.n)})</span>
      </div>
      <button type="button" onClick={() => onFocusTutors(item.key)}
        className="w-24 shrink-0 text-right text-[11px] font-semibold text-[#0056D2] hover:underline">
        {numberFmt(item.missing)} faltam
      </button>
    </li>
  );
}

function LeakBanner({ data }: { data: GrowthResponse }) {
  const leak = data.biggest_leak;
  if (!leak) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-600">
        Sem dados suficientes no período para apontar o maior vazamento.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Onde mexer primeiro</p>
      <p className="mt-1 text-[18px] font-extrabold text-slate-900">
        {leak.from_label} → {leak.to_label}: só {pct(leak.pct)} avançam
      </p>
      <p className="mt-1 text-[13px] text-slate-700">
        {numberFmt(leak.lost)} pessoas ficaram para trás nesta passagem. {leak.where_to_act}
      </p>
      {leak.kind === 'volume' && (
        <p className="mt-1 text-[11px] text-slate-500">Taxa indicativa: compara volumes do período, não as mesmas pessoas.</p>
      )}
    </div>
  );
}

type ReconRow = { key: string; accounts: number; with_event: number; pct: number | null };
type ReconResponse = {
  totals: { accounts: number; with_event: number; pct: number | null };
  by_day: ReconRow[]; by_platform: ReconRow[]; by_version: ReconRow[]; by_method: ReconRow[]; note: string;
};

/** Confere o funil de entrada: contas que nasceram × contas com o evento "cadastro concluído". */
function SignupReconCard({ filter }: { filter: GlobalFilter }) {
  const { data, error, loading } = useAsync<ReconResponse>(
    () => adminGet('/signup-reconciliation', {
      period_days: filter.period_days, since: filter.since, until: filter.until, platform: filter.platform,
    }),
    [filter.period_days, filter.since, filter.until, filter.platform],
  );
  const fmt = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const table = (title: string, rows: ReconRow[]) => (
    <div className="min-w-[220px] flex-1">
      <p className="mb-1 text-[12px] font-bold text-slate-700">{title}</p>
      <table className="w-full text-left text-[12px]">
        <thead><tr className="text-slate-400"><th className="py-1 pr-2"></th><th className="py-1 pr-2">Contas</th><th className="py-1 pr-2">Com evento</th><th className="py-1">%</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-100">
              <td className="py-1 pr-2 font-semibold">{r.key}</td>
              <td className="py-1 pr-2">{numberFmt(r.accounts)}</td>
              <td className="py-1 pr-2">{numberFmt(r.with_event)}</td>
              <td className="py-1">{fmt(r.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <Card title="Conferência do cadastro"
      subtitle="Contas que nasceram × contas com o evento de cadastro concluído. Se forem bem diferentes, a taxa do funil de entrada está errada por medição.">
      {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : (
        <>
          <p className="text-[14px] font-extrabold text-slate-800">
            {numberFmt(data.totals.accounts)} contas · {numberFmt(data.totals.with_event)} com evento ({fmt(data.totals.pct)})
          </p>
          <p className="mb-3 text-[11px] text-slate-400">{data.note}</p>
          <div className="flex flex-wrap gap-6">
            {table('Por dia', data.by_day)}
            {table('Por plataforma', data.by_platform)}
            {table('Por versão do app', data.by_version)}
            {table('Por método', data.by_method)}
          </div>
        </>
      )}
    </Card>
  );
}

type EntryStep = { key: string; label: string; n: number; pct_of_opened: number | null };
type EntryByPlatform = { since: string; platforms: Record<'ios' | 'android', { steps: EntryStep[]; choices: { register: number; login: number } }> };

/** Funil de entrada lado a lado (iPhone × Android), só com dados confiáveis (a partir de 15/10 se não houver período). */
function EntryByPlatformCard({ filter }: { filter: GlobalFilter }) {
  const { data, error, loading } = useAsync<EntryByPlatform>(
    () => adminGet('/entry-by-platform', { since: filter.since, until: filter.until }),
    [filter.since, filter.until],
  );
  const pctFmt = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);
  return (
    <Card title="Entrada: iPhone × Android"
      subtitle="Mesmo funil de entrada, separado por aparelho, só com dados confiáveis (a partir de 15/10, a menos que você escolha o período).">
      {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : (
        <>
          <p className="mb-2 text-[11px] text-slate-400">Desde {data.since.slice(0, 10)}</p>
          <table className="w-full text-left text-[12px]">
            <thead><tr className="text-slate-400"><th className="py-1 pr-3">Etapa</th><th className="py-1 pr-3">iPhone</th><th className="py-1">Android</th></tr></thead>
            <tbody>
              {data.platforms.ios.steps.map((s, i) => {
                const a = data.platforms.android.steps[i];
                return (
                  <tr key={s.key} className="border-t border-slate-100">
                    <td className="py-1 pr-3 font-semibold">{s.label}</td>
                    <td className="py-1 pr-3">{numberFmt(s.n)} <span className="text-slate-400">({pctFmt(s.pct_of_opened)})</span></td>
                    <td className="py-1">{numberFmt(a?.n ?? 0)} <span className="text-slate-400">({pctFmt(a?.pct_of_opened ?? null)})</span></td>
                  </tr>
                );
              })}
              <tr className="border-t border-slate-100">
                <td className="py-1 pr-3 font-semibold">Tocaram em &ldquo;Criar minha conta&rdquo;</td>
                <td className="py-1 pr-3">{numberFmt(data.platforms.ios.choices.register)}</td>
                <td className="py-1">{numberFmt(data.platforms.android.choices.register)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

function EntryCard({ filter }: { filter: GlobalFilter }) {
  const { data, error, loading } = useAsync<EntryResponse>(
    () => adminGet('/entry-funnel', {
      period_days: filter.period_days, since: filter.since, until: filter.until, platform: filter.platform,
    }),
    [filter.period_days, filter.since, filter.until, filter.platform],
  );
  return (
    <Card title="Baixou e não cadastrou"
      subtitle="Pessoas distintas que chegaram a cada tela depois de abrir o app sem conta. Mostra em qual tela elas param.">
      {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : (
        <>
          <ol className="space-y-1.5">
            {data.steps.map((s) => (
              <li key={s.key} className="flex items-center gap-3">
                <div className="w-52 shrink-0 text-[13px] font-semibold text-slate-700">{s.label}</div>
                <div className="h-6 flex-1 rounded-md bg-slate-100">
                  <div className="h-6 rounded-md bg-[#0056D2]" style={{ width: `${Math.min((s.pct_of_opened ?? 0) * 100, 100)}%` }} />
                </div>
                <div className="w-24 shrink-0 text-right text-[13px] font-extrabold text-slate-900">
                  {numberFmt(s.n)} <span className="font-medium text-slate-400">({pct(s.pct_of_opened)})</span>
                </div>
              </li>
            ))}
          </ol>
          {data.biggest_leak && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              <strong>Maior perda: {data.biggest_leak.from_label} → {data.biggest_leak.to_label}</strong> — só {pct(data.biggest_leak.pct)} avançam
              ({numberFmt(data.biggest_leak.lost)} pessoas). {data.biggest_leak.where_to_act}
            </p>
          )}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Na tela de entrada, tocaram em</p>
              <p className="text-[13px] text-slate-700">
                Criar minha conta: <strong>{numberFmt(data.choices.register)}</strong> · Já tenho conta: <strong>{numberFmt(data.choices.login)}</strong>
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Por que o cadastro falhou</p>
              {data.failures.length === 0
                ? <p className="text-[13px] text-slate-400">Nenhuma falha registrada ainda.</p>
                : <ul className="space-y-0.5 text-[13px] text-slate-700">
                    {data.failures.map((f) => (
                      <li key={f.reason}>{FAILURE_LABEL[f.reason] ?? f.reason}: <strong>{numberFmt(f.count)}</strong></li>
                    ))}
                  </ul>}
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            {data.scope === 'native' ? 'Conta o app instalado (iPhone e Android). ' : ''}{data.notes.join(' ')}
          </p>
        </>
      )}
    </Card>
  );
}

function FunnelCard({ data }: { data: GrowthResponse }) {
  const top = data.steps[0]?.n || 0;
  const leakKey = data.biggest_leak?.to;
  return (
    <Card title="Funil" subtitle="Cada barra é uma etapa; o número entre elas é quanto passou da etapa anterior.">
      <ol className="space-y-1">
        {data.steps.map((s, i) => (
          <li key={s.key}>
            {i > 0 && <Transition step={s} highlight={s.key === leakKey} />}
            <StepBar step={s} top={top} />
          </li>
        ))}
      </ol>
      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">De quem se cadastrou</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {data.extra_steps.map((s) => (
            <div key={s.key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[13px]">
              <span className="text-slate-600">{s.label}</span>
              <span className="font-bold text-slate-800">
                {numberFmt(s.n)} <span className="font-medium text-slate-400">({pct(s.pct_from_previous)})</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Visitantes únicos no período: {numberFmt(data.visitantes_unicos)}.</p>
    </Card>
  );
}

function StepBar({ step, top }: { step: GrowthStep; top: number }) {
  const width = top ? Math.max((step.n / top) * 100, step.n ? 2 : 0) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 text-[13px] font-semibold text-slate-700">{step.label}</div>
      <div className="h-8 flex-1 rounded-md bg-slate-100">
        <div className="h-8 rounded-md bg-[#0056D2]" style={{ width: `${Math.min(width, 100)}%` }} />
      </div>
      <div className="w-16 shrink-0 text-right text-[15px] font-extrabold text-slate-900">{numberFmt(step.n)}</div>
    </div>
  );
}

function Transition({ step, highlight }: { step: GrowthStep; highlight: boolean }) {
  return (
    <div className="flex items-center gap-3 py-0.5 pl-1">
      <div className="w-40 shrink-0" />
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        highlight ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-500'}`}>
        ↓ {pct(step.pct_from_previous)} avançam{step.kind === 'volume' ? ' (indicativo)' : ''}
      </span>
    </div>
  );
}

function StuckCards({ data }: { data: GrowthResponse }) {
  const items = [
    { n: data.stuck.cadastro_sem_pet, title: 'Cadastraram e não colocaram o pet', hint: 'Falta o primeiro pet.' },
    { n: data.stuck.pet_sem_alimentacao, title: 'Têm pet e não configuraram a ração', hint: 'Falta a alimentação.' },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[28px] font-extrabold leading-none text-slate-900">{numberFmt(it.n)}</p>
          <p className="mt-1.5 text-[13px] font-semibold text-slate-700">{it.title}</p>
          <p className="text-[12px] text-slate-500">{it.hint} Lista completa no Mission Control, em Tutores e Pets.</p>
        </div>
      ))}
    </div>
  );
}

function PlatformTable({ rows }: { rows: GrowthPlatformRow[] }) {
  return (
    <Card title="Por plataforma" subtitle="Onde cada etapa acontece. Um tutor que usa mais de uma plataforma aparece em todas.">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="py-1.5 pr-3">Plataforma</th>
              <th className="px-2 text-right">Acessos</th>
              <th className="px-2 text-right">Downloads</th>
              <th className="px-2 text-right">Cadastros</th>
              <th className="px-2 text-right">Com pet</th>
              <th className="px-2 text-right">Com ração</th>
              <th className="px-2 text-right">Notificação</th>
              <th className="px-2 text-right">GPS</th>
              <th className="px-2 text-right">Meta completa</th>
              <th className="pl-2 text-right">Download → cadastro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.platform} className="border-t border-slate-100">
                <td className="py-2 pr-3 font-semibold text-slate-700">{PLATFORM_LABEL[r.platform]}</td>
                <td className="px-2 text-right">{numberFmt(r.acessos)}</td>
                <td className="px-2 text-right">{numberFmt(r.downloads)}</td>
                <td className="px-2 text-right">{numberFmt(r.cadastros)}</td>
                <td className="px-2 text-right">{numberFmt(r.pet)}</td>
                <td className="px-2 text-right">{numberFmt(r.feeding)}</td>
                <td className="px-2 text-right">{numberFmt(r.push)}</td>
                <td className="px-2 text-right">{numberFmt(r.location)}</td>
                <td className="px-2 text-right font-semibold text-slate-800">
                  {numberFmt(r.complete)}{r.cadastros ? <span className="font-medium text-slate-400"> ({pct(r.complete / r.cadastros)})</span> : null}
                </td>
                <td className="pl-2 text-right text-slate-500">
                  {r.downloads ? pct(r.cadastros / r.downloads) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Telas do Mission Control que o Dashboard 2 ainda não traz (moderação, locais). */
const goMissionControl = (hash: string) => { window.location.assign(`/admin/dashboard#${hash}`); };

function TodayBlock({ onFocusTutors }: { onFocusTutors: (g: TutorsPreset['goal']) => void }) {
  return (
    <Card title="Hoje" subtitle="Dia a dia: hoje contra ontem e contra a média dos 7 dias anteriores. Não segue o filtro de período acima.">
      <div className="space-y-4">
        <TodaySection
          onOpenPeople={() => onFocusTutors('incomplete')}
          onOpenLocations={() => goMissionControl('aquisicao')}
          onOpenModeration={() => goMissionControl('pessoas')}
        />
        <BaseStrip onOpenPeople={() => onFocusTutors('incomplete')} onOpenMissingPets={() => window.location.assign('/achei-um-pet')} />
      </div>
    </Card>
  );
}

const panelFetch = async <T,>(path: string, init?: RequestInit): Promise<T> => {
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

/** Painel de campanhas: o dono dispara e acompanha com o login de admin (sem token) e liga/desliga o piloto. */
function CampaignsPanel() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useAsync<CampaignsPanelSummary>(
    () => panelFetch('/summary'), [refresh], { intervalMs: 8000 });
  const [confirm, setConfirm] = useState<'food' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setMsg(null);
    try { await fn(); setRefresh((n) => n + 1); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Não foi possível.'); }
    finally { setBusy(false); setConfirm(null); }
  };
  const run = (which: 'food', dry: boolean) =>
    act(() => panelFetch(`/${which}/run`, { method: 'POST', body: JSON.stringify({ dry_run: dry }) }));
  const toggle = (enabled: boolean) =>
    act(() => panelFetch('/autopilot', { method: 'POST', body: JSON.stringify({ enabled }) }));

  const stateLine = (st: CampaignState) => {
    if (st.phase === 'running') {
      const prog = st.result && typeof st.result.progress === 'string' ? ` (${st.result.progress})` : '';
      return <span className="font-semibold text-amber-700">Enviando{prog}…</span>;
    }
    if (st.phase === 'error') return <span className="font-semibold text-rose-600">Erro: {st.error}</span>;
    if (st.phase === 'done' && st.result) {
      const r = st.result;
      return <span className="text-slate-600">
        {r.dry_run ? 'Ensaio (nada enviado): ' : 'Concluído: '}
        {typeof r.total === 'number' ? `${numberFmt(r.total)} pessoas` : ''}
        {typeof r.sent_push === 'number' ? ` · ${numberFmt(r.sent_push)} push` : ''}
      </span>;
    }
    return <span className="text-slate-400">Parada</span>;
  };

  const rows: { key: 'food'; title: string; what: string; n: number; detail: string; st: CampaignState }[] = data ? [
    { key: 'food', title: 'Ração', what: 'Tem pet, não cadastrou a ração e tem aviso (push) ativo. Só push.',
      n: data.food.eligible, detail: `${numberFmt(data.food.skipped_recent)} já receberam há menos de 7 dias`, st: data.food.state },
  ] : [];

  return (
    <div id="campanhas"><Card title="Campanhas de ativação"
      subtitle="Disparar e acompanhar com o seu login. Cada pessoa recebe no máximo 1 mensagem por semana e quem pediu para parar nunca entra.">
      {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
            <div>
              <p className="text-[13px] font-bold text-slate-800">
                Piloto automático: {data.autopilot.enabled ? <span className="text-emerald-600">ligado</span> : <span className="text-rose-600">desligado</span>}
              </p>
              <p className="text-[12px] text-slate-500">
                Todo dia às 11h (10h–19h), até {data.autopilot.daily_cap} push por dia.
                Últimas 24h: {numberFmt(Object.values(data.autopilot.last24h).reduce((a, b) => a + b, 0))} enviadas · {numberFmt(data.autopilot.opted_out)} pediram para parar.
              </p>
            </div>
            <button type="button" disabled={busy} onClick={() => toggle(!data.autopilot.enabled)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${data.autopilot.enabled ? 'border border-rose-300 text-rose-700' : 'bg-emerald-600 text-white'}`}>
              {data.autopilot.enabled ? 'Pausar' : 'Ligar'}
            </button>
          </div>

          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.key} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-xl">
                    <p className="text-[14px] font-extrabold text-slate-800">{r.title} <span className="font-medium text-slate-500">— {numberFmt(r.n)} receberiam agora</span></p>
                    <p className="text-[12px] text-slate-500">{r.what}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{r.detail}</p>
                    <p className="mt-1 text-[12px]">{stateLine(r.st)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={busy || r.st.phase === 'running'} onClick={() => run(r.key, true)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Ensaio</button>
                    <button type="button" disabled={busy || r.st.phase === 'running' || r.n === 0} onClick={() => setConfirm(r.key)}
                      className="rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">Enviar agora</button>
                  </div>
                </div>
                {confirm === r.key && (
                  <div className="mt-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">
                    <p><strong>Enviar para {numberFmt(r.n)} pessoas agora?</strong> O push sai na hora. Não dá para desfazer.</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" disabled={busy} onClick={() => run(r.key, false)} className="rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12px] font-bold text-white">Sim, enviar</button>
                      <button type="button" onClick={() => setConfirm(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600">Cancelar</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {msg && <p className="mt-3 text-[12px] font-semibold text-rose-600">{msg}</p>}
        </>
      )}
    </Card></div>
  );
}

type EmailRacaoSummary = {
  subject: string; sendgrid: boolean; eligible: number; no_food: number; no_push: number; skipped_recent: number;
  state: CampaignState;
};
type EmailArm = { people: number; no_food_at_send: number; food_now: number; no_push_at_send: number; push_now: number };

/** E-mail "Recado Importante": teste só para o admin logado, ensaio, envio real e efeito (enviados × controle). */
function EmailRacaoPanel() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useAsync<EmailRacaoSummary>(() => panelFetch('/email-racao/summary'), [refresh], { intervalMs: 8000 });
  const results = useAsync<{ sent: EmailArm | null; control: EmailArm | null }>(() => panelFetch('/email-racao/results'), [refresh], { intervalMs: 60000 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);

  const act = async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (okText) setMsg({ ok: true, text: okText }); setRefresh((n) => n + 1); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível.' }); }
    finally { setBusy(false); setConfirm(false); }
  };
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
  const st = data?.state;
  const r = st?.result as Record<string, unknown> | null | undefined;

  return (
    <Card title="E-mail: Recado Importante"
      subtitle="Imagem clicável + botão, com link para a loja certa (iPhone/Android). Uma mensagem por pessoa, mesmo com vários pets.">
      {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : (
        <>
          <p className="text-[12px] text-slate-500">Assunto: <strong className="text-slate-800">{data.subject}</strong></p>
          <p className="mt-1 text-[14px] font-extrabold text-slate-800">
            {numberFmt(data.eligible)} receberiam agora{' '}
            <span className="font-medium text-slate-500">
              ({numberFmt(data.no_food)} com ração faltando · {numberFmt(data.no_push)} sem notificação · {numberFmt(data.skipped_recent)} já receberam há menos de 7 dias)
            </span>
          </p>
          {!data.sendgrid && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[12px] text-amber-900">
              O envio sai pela Hostinger: lotes de 10 a cada 3 minutos e no máximo 900 por dia (plano Starter Business Email da Hostinger). Se ela recusar, espera 1 hora e tenta de novo (até 3 vezes). Quando bater o teto, clique de novo no dia seguinte: quem já recebeu é pulado.
            </p>
          )}
          <p className="mt-2 text-[12px]">
            {st?.phase === 'running' ? <span className="font-semibold text-amber-700">Enviando{r && typeof r.progress === 'string' ? ` (${r.progress})` : ''}…</span>
              : st?.phase === 'error' ? <span className="font-semibold text-rose-600">Erro: {st.error}</span>
              : st?.phase === 'done' && r ? <span className="text-slate-600">
                  {r.dry_run ? 'Ensaio (nada enviado): ' : 'Concluído: '}{numberFmt(Number(r.total ?? 0))} pessoas
                  {typeof r.sent === 'number' ? ` · ${numberFmt(r.sent)} enviados` : ''}
                  {typeof r.failed === 'number' && r.failed > 0 ? ` · ${numberFmt(r.failed)} falhas` : ''}
                  {typeof r.holdout === 'number' ? ` · ${numberFmt(r.holdout)} no controle` : ''}
                  {typeof r.stopped === 'string' ? ` · ${r.stopped}` : ''}
                  {typeof r.capped === 'string' ? ` · ${r.capped}` : ''}
                  {typeof r.last_error === 'string' && r.last_error ? ` · último erro: ${r.last_error}` : ''}
                </span>
              : <span className="text-slate-400">Parado</span>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy}
              onClick={() => act(() => panelFetch('/email-racao/test', { method: 'POST' }), 'Teste enviado para o seu e-mail.')}
              className="rounded-lg border border-[#0056D2] bg-white px-3 py-1.5 text-[12px] font-bold text-[#0056D2] disabled:opacity-40">Enviar teste para mim</button>
            <button type="button" disabled={busy || st?.phase === 'running'}
              onClick={() => act(() => panelFetch('/email-racao/run', { method: 'POST', body: JSON.stringify({ dry_run: true }) }))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Ensaio</button>
            <button type="button" disabled={busy || st?.phase === 'running' || data.eligible === 0}
              onClick={() => setConfirm(true)}
              className="rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">Enviar para todos</button>
          </div>
          {confirm && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">
              <p><strong>Enviar e-mail para cerca de {numberFmt(Math.round(data.eligible * 0.9))} pessoas agora?</strong> 10% ficam de fora de propósito (grupo de controle, para medir o efeito). Não dá para desfazer.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busy} onClick={() => act(() => panelFetch('/email-racao/run', { method: 'POST', body: JSON.stringify({ dry_run: false, holdout_pct: 10 }) }))}
                  className="rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12px] font-bold text-white">Sim, enviar</button>
                <button type="button" onClick={() => setConfirm(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600">Cancelar</button>
              </div>
            </div>
          )}
          {msg && <p className={`mt-3 text-[12px] font-semibold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
          {results.data?.sent && results.data.control && (
            <div className="mt-4 overflow-x-auto">
              <p className="mb-1 text-[12px] font-bold text-slate-700">Efeito (recebeu × controle)</p>
              <table className="w-full text-left text-[12px]">
                <thead><tr className="text-slate-400"><th className="py-1 pr-3"></th><th className="py-1 pr-3">Pessoas</th><th className="py-1 pr-3">Cadastraram a ração</th><th className="py-1 pr-3">Ativaram notificação</th></tr></thead>
                <tbody>
                  {([['Receberam', results.data.sent], ['Controle', results.data.control]] as [string, EmailArm][]).map(([label, a]) => (
                    <tr key={label} className="border-t border-slate-100">
                      <td className="py-1 pr-3 font-semibold">{label}</td>
                      <td className="py-1 pr-3">{numberFmt(a.people)}</td>
                      <td className="py-1 pr-3">{numberFmt(a.food_now)}/{numberFmt(a.no_food_at_send)} ({pct(a.food_now, a.no_food_at_send)})</td>
                      <td className="py-1 pr-3">{numberFmt(a.push_now)}/{numberFmt(a.no_push_at_send)} ({pct(a.push_now, a.no_push_at_send)})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** Resultado da campanha de Alimentação (push). Fora do prefixo /analytics, então fetch próprio. */
function FoodCampaignCard() {
  const { data, error, loading } = useAsync<FoodCampaignResults>(async () => {
    const res = await fetch('/api/v1/admin/campaigns/food-activation/results', {
      headers: { Authorization: `Bearer ${getToken()}` }, cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    return res.json();
  }, [], { intervalMs: 60000 });

  const max = Math.max(1, ...(data?.series.map((p) => p.first_feeding) ?? [1]));
  const sendDay = data?.first_sent_at?.slice(0, 10);
  return (
    <Card title="Campanha de ração: funcionou?"
      subtitle="De quem recebeu o push de Alimentação, quantos cadastraram a ração depois.">
      {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : !data.first_sent_at ? (
        <p className="text-[13px] text-slate-500">Nenhum envio registrado ainda. Os números aparecem depois do primeiro disparo.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Receberam</p>
              <p className="text-[24px] font-extrabold text-slate-900">{numberFmt(data.contacted.total)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Cadastraram em {data.window_days} dias</p>
              <p className="text-[24px] font-extrabold text-slate-900">
                {numberFmt(data.contacted.converted_window)} <span className="text-[14px] font-semibold text-slate-400">({pct(data.contacted.rate_window)})</span>
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Têm ração hoje</p>
              <p className="text-[24px] font-extrabold text-slate-900">{numberFmt(data.contacted.converted_total)}</p>
            </div>
          </div>

          {data.holdout.total > 0 && (
            <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-[13px] text-blue-900">
              <strong>Contra quem não recebeu</strong> ({numberFmt(data.holdout.total)} pessoas de controle): {pct(data.contacted.rate_window)} contra{' '}
              {pct(data.holdout.rate_window)}. Diferença: {data.lift_vs_holdout == null ? '—' : `${data.lift_vs_holdout > 0 ? '+' : ''}${(data.lift_vs_holdout * 100).toFixed(1)} pontos`}.
            </p>
          )}

          <p className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Primeira ração cadastrada por dia — média {data.daily_avg_before ?? '—'} antes do envio, {data.daily_avg_after ?? '—'} depois
          </p>
          <div className="flex h-24 items-end gap-px" role="img" aria-label="Primeira ração cadastrada por dia">
            {data.series.map((p) => (
              <div key={p.date} title={`${p.date}: ${p.first_feeding}`} className="flex-1 rounded-t-sm"
                style={{ height: `${(p.first_feeding / max) * 100}%`, minHeight: p.first_feeding ? 2 : 0,
                  background: sendDay && p.date >= sendDay ? '#059669' : '#94A3B8' }} />
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Cinza: antes do envio. Verde: depois.</p>
          <ul className="mt-3 space-y-1 text-[11px] text-slate-500">{data.notes.map((n) => <li key={n}>• {n}</li>)}</ul>
        </>
      )}
    </Card>
  );
}

function PermissionsBlock() {
  return (
    <Card title="Notificação e localização" subtitle="Quantos podem ser avisados e localizados, como isso evolui e quem pode ter desinstalado. Não segue o filtro de período.">
      <PermissionsSection />
    </Card>
  );
}

function RetentionBlock({ filter, onFocusTutors }: { filter: GlobalFilter; onFocusTutors: (g: TutorsPreset['goal']) => void }) {
  return (
    <PhotoLightboxProvider>
      <Card title="Por que ficam (ou não)" subtitle="Quem volta, onde o cadastro da ração para e quais funções cada pet usa. Cada número abre a lista de pessoas.">
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Quem volta</p>
            <RetentionSection filter={filter} onOpenTutors={() => onFocusTutors('incomplete')} />
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Onde a ração para</p>
            <FeedingSection filter={filter} onOpenTutors={() => onFocusTutors('feeding')} />
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Funções que cada pet usa</p>
            <FeaturesSection filter={filter} />
          </div>
        </div>
      </Card>
    </PhotoLightboxProvider>
  );
}

const SERIES: { key: keyof Omit<GrowthSeriesPoint, 'date'>; label: string; color: string }[] = [
  { key: 'acessos', label: 'Acessos', color: '#94A3B8' },
  { key: 'downloads', label: 'Downloads', color: '#0056D2' },
  { key: 'cadastros', label: 'Cadastros', color: '#059669' },
];

function DailySeries({ series }: { series: GrowthSeriesPoint[] }) {
  const [active, setActive] = useState<'acessos' | 'downloads' | 'cadastros'>('downloads');
  const meta = SERIES.find((s) => s.key === active)!;
  const max = Math.max(1, ...series.map((p) => p[active]));
  const total = series.reduce((sum, p) => sum + p[active], 0);
  return (
    <Card title="Por dia" subtitle="Dia civil de São Paulo, no máximo os últimos 120 dias do período.">
      <div className="mb-3 flex flex-wrap gap-1">
        {SERIES.map((s) => (
          <button key={s.key} type="button" onClick={() => setActive(s.key)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${
              active === s.key ? 'bg-[#0056D2] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
            {s.label}
          </button>
        ))}
        <span className="ml-auto self-center text-[12px] text-slate-500">Total: {numberFmt(total)}</span>
      </div>
      <div className="flex h-28 items-end gap-px" role="img" aria-label={`${meta.label} por dia`}>
        {series.map((p) => (
          <div key={p.date} title={`${p.date}: ${p[active]}`} className="flex-1 rounded-t-sm"
            style={{ height: `${(p[active] / max) * 100}%`, minHeight: p[active] ? 2 : 0, background: meta.color }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{series[0]?.date.split('-').reverse().join('/')}</span>
        <span>{series[series.length - 1]?.date.split('-').reverse().join('/')}</span>
      </div>
    </Card>
  );
}

function Notes({ notes }: { notes: string[] }) {
  return (
    <ul className="space-y-1 px-1 text-[11px] text-slate-500">
      {notes.map((n) => <li key={n}>• {n}</li>)}
    </ul>
  );
}

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
import { adminGet, type CampaignsResponse, type GlobalFilter } from '@/lib/admin/analyticsApi';
import {
  PLATFORM_LABEL, pct,
  type ActivationItem, type CampaignActivationRow, type GrowthPlatformRow, type GrowthResponse, type GrowthSeriesPoint, type GrowthStep,
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
      <LeakBanner data={data} />
      <FunnelCard data={data} />
      <StuckCards data={data} />
      <PlatformTable rows={data.platforms} />
      <CampaignActivationTable rows={data.campaigns_activation} />
      <CampaignTable filter={filter} />
      <RetentionBlock filter={filter} onFocusTutors={onFocusTutors} />
      <PermissionsBlock />
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

function PermissionsBlock() {
  return (
    <Card title="Notificação e localização" subtitle="Quantos podem ser avisados e localizados, como isso evolui e quem pode ter desinstalado. Não segue o filtro de período.">
      <PermissionsSection />
    </Card>
  );
}

function CampaignActivationTable({ rows }: { rows: CampaignActivationRow[] }) {
  return (
    <Card title="Meta por campanha de origem"
      subtitle="Das pessoas que vieram de cada campanha, quantas chegaram a pet, ração, notificação e localização. Mostra qual campanha traz gente que realmente ativa.">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="py-1.5 pr-3">Origem</th>
              <th className="px-2 text-right">Cadastros</th>
              <th className="px-2 text-right">Pet</th>
              <th className="px-2 text-right">Ração</th>
              <th className="px-2 text-right">Notificação</th>
              <th className="px-2 text-right">GPS</th>
              <th className="pl-2 text-right">Meta completa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-slate-100">
                <td className="py-2 pr-3 font-semibold text-slate-700">{r.name}</td>
                <td className="px-2 text-right">{numberFmt(r.cadastros)}</td>
                {([r.pet, r.feeding, r.push, r.location] as const).map((n, i) => (
                  <td key={i} className="px-2 text-right">
                    {numberFmt(n)} <span className="text-slate-400">({pct(r.cadastros ? n / r.cadastros : null)})</span>
                  </td>
                ))}
                <td className="pl-2 text-right font-bold text-slate-800">
                  {numberFmt(r.complete)} <span className="font-medium text-slate-400">({pct(r.cadastros ? r.complete / r.cadastros : null)})</span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">Nenhum cadastro no período.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        &quot;(sem origem rastreada)&quot; = cadastro sem aparelho ligado a um acesso medido; &quot;(direto/orgânico)&quot; = sem campanha em nenhum toque.
      </p>
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

function CampaignTable({ filter }: { filter: GlobalFilter }) {
  const { data, error, loading } = useAsync<CampaignsResponse>(
    () => adminGet('/campaigns', { since: filter.since, until: filter.until, platform: filter.platform }),
    [filter.since, filter.until, filter.platform],
  );
  return (
    <Card title="Por campanha" subtitle="De onde vêm os downloads e quantos viram cadastro. Gasto lançado em Locais, no Mission Control.">
      {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-1.5 pr-3">Campanha</th>
                <th className="px-2 text-right">Acessos</th>
                <th className="px-2 text-right">Downloads</th>
                <th className="px-2 text-right">Cadastros</th>
                <th className="px-2 text-right">Download → cadastro</th>
                <th className="pl-2 text-right">Custo por cadastro</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={`${c.utm_source}|${c.utm_medium}|${c.utm_campaign}`} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{c.utm_campaign}</td>
                  <td className="px-2 text-right">{numberFmt(c.acessos)}</td>
                  <td className="px-2 text-right">{numberFmt(c.downloads)}</td>
                  <td className="px-2 text-right">{numberFmt(c.cadastros)}</td>
                  <td className="px-2 text-right text-slate-500">{c.downloads ? pct(c.cadastros / c.downloads) : '—'}</td>
                  <td className="pl-2 text-right text-slate-500">
                    {c.custo_por_cadastro == null ? '—' : `R$ ${c.custo_por_cadastro.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`}
                  </td>
                </tr>
              ))}
              {data.campaigns.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-slate-400">Nada no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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

'use client';

/**
 * Desempenho — só o essencial, com o período que o dono escolher. Cada número é contado NA DATA em que aconteceu:
 * Downloads, Se cadastrou (criou a conta), Cadastrou o pet (o primeiro) e Cadastrou a alimentação (a ração do primeiro).
 * Em cima, Hoje × Ontem; embaixo, o período escolhido (qualquer intervalo) e o dia a dia.
 */
import { useState } from 'react';
import { spDayBounds, spStartOfToday, spYesterdayRange } from '@/lib/analytics/spTime';
import { DateField } from '@/components/ui/DateField';
import { Card, adminApi } from '@/components/admin/AdminUi';
import { ErrorBox, Loading, numberFmt, useAsync } from '@/components/admin/sections/sections';

type Key = 'downloads' | 'cadastros' | 'pets' | 'alimentacao';
interface Block { totals: Record<Key, number>; series: ({ date: string } & Record<Key, number>)[] }
interface Perf extends Block { platforms?: { ios: Block; android: Block } }
type View = 'all' | 'ios' | 'android';
const VIEWS: { key: View; label: string }[] = [{ key: 'all', label: 'Todos' }, { key: 'ios', label: 'iPhone' }, { key: 'android', label: 'Android' }];

/** "iPhone 3 · Android 5" — a mesma contagem separada por aparelho. */
function Split({ perf, k }: { perf: Perf | null | undefined; k: Key }) {
  if (!perf?.platforms) return null;
  return (
    <p className="mt-1 text-[12px] text-slate-500">
      iPhone <strong className="text-slate-700">{numberFmt(perf.platforms.ios.totals[k])}</strong> · Android <strong className="text-slate-700">{numberFmt(perf.platforms.android.totals[k])}</strong>
    </p>
  );
}

const METRICS: { key: Key; label: string; hint: string }[] = [
  { key: 'downloads', label: 'Downloads', hint: 'Primeira abertura do app' },
  { key: 'cadastros', label: 'Se cadastrou', hint: 'Criou a conta' },
  { key: 'pets', label: 'Cadastrou o pet', hint: 'Cadastrou o primeiro pet' },
  { key: 'alimentacao', label: 'Cadastrou a alimentação', hint: 'Configurou a ração' },
];

type Preset = '7d' | '30d' | '90d' | 'all' | 'custom';
const PRESETS: { key: Preset; label: string }[] = [
  { key: '7d', label: '7 dias' }, { key: '30d', label: '30 dias' }, { key: '90d', label: '90 dias' }, { key: 'all', label: 'Tudo' },
];

const DAY = 86_400_000;

export function DesempenhoTab() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const range = (): { since?: string; until?: string } => {
    if (preset === 'all') return {};
    if (preset === 'custom') return { since: from ? spDayBounds(from)?.start.toISOString() : undefined, until: to ? spDayBounds(to)?.end.toISOString() : undefined };
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
    return { since: new Date(Date.now() - days * DAY).toISOString() };
  };

  const today = useAsync<Perf>(() => adminApi('/performance', { params: { since: spStartOfToday(new Date()).toISOString() } }), [], { intervalMs: 60000 });
  const yesterday = useAsync<Perf>(() => {
    const { start, end } = spYesterdayRange(new Date());
    return adminApi('/performance', { params: { since: start.toISOString(), until: end.toISOString() } });
  }, [], { intervalMs: 300000 });
  const rangeKey = `${preset}|${from}|${to}`;
  const period = useAsync<Perf>(() => adminApi('/performance', { params: range() }), [rangeKey], { intervalMs: 120000 });

  return (
    <div className="space-y-5">
      <Card title="Hoje × ontem" subtitle="Hoje ainda está em andamento; ontem já fechou.">
        {today.loading && !today.data ? <Loading /> : today.error || yesterday.error || !today.data ? <ErrorBox msg={today.error || yesterday.error} /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {METRICS.map((m) => (
              <div key={m.key} className="rounded-xl border border-slate-200 p-4">
                <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">{m.label}</p>
                <p className="mt-1 text-[32px] font-black leading-none text-slate-900">{numberFmt(today.data!.totals[m.key])}</p>
                <p className="mt-1.5 text-[12px] text-slate-500">hoje · ontem <strong className="text-slate-700">{numberFmt(yesterday.data?.totals[m.key])}</strong></p>
                <Split perf={today.data} k={m.key} />
                <p className="text-[11px] text-slate-400">ontem: iPhone {numberFmt(yesterday.data?.platforms?.ios.totals[m.key])} · Android {numberFmt(yesterday.data?.platforms?.android.totals[m.key])}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Período" subtitle="Escolha o intervalo que quiser.">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPreset(p.key)}
              className={`rounded-md px-2.5 py-1 font-semibold ${preset === p.key ? 'bg-[#0056D2] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{p.label}</button>
          ))}
          <span className="mx-1 text-slate-300">|</span>
          <DateField value={from} ariaLabel="De" className="w-[8.5rem]"
            onChange={(iso) => { setFrom(iso); setPreset('custom'); }}
            inputClassName={`w-full rounded-md border px-2 py-1 pr-8 text-[13px] tabular-nums ${preset === 'custom' ? 'border-[#0056D2]' : 'border-slate-200'}`} />
          <span className="text-slate-400">até</span>
          <DateField value={to} ariaLabel="Até" className="w-[8.5rem]"
            onChange={(iso) => { setTo(iso); setPreset('custom'); }}
            inputClassName={`w-full rounded-md border px-2 py-1 pr-8 text-[13px] tabular-nums ${preset === 'custom' ? 'border-[#0056D2]' : 'border-slate-200'}`} />
        </div>
        {period.loading && !period.data ? <Loading /> : period.error || !period.data ? <ErrorBox msg={period.error} /> : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {METRICS.map((m) => (
                <div key={m.key} className="rounded-xl bg-slate-50 p-4">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">{m.label}</p>
                  <p className="mt-1 text-[32px] font-black leading-none text-[#0056D2]">{numberFmt(period.data!.totals[m.key])}</p>
                  <p className="mt-1.5 text-[12px] text-slate-500">{m.hint}</p>
                  <Split perf={period.data} k={m.key} />
                </div>
              ))}
            </div>
            <DailyTable perf={period.data} />
          </>
        )}
      </Card>
    </div>
  );
}

function DailyTable({ perf }: { perf: Perf }) {
  const [view, setView] = useState<View>('all');
  const series = view === 'all' ? perf.series : (perf.platforms?.[view].series ?? []);
  const rows = [...series].reverse().slice(0, 90);
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-1.5 text-[12px]">
        <span className="mr-1 font-semibold text-slate-500">Dia a dia:</span>
        {VIEWS.map((v) => (
          <button key={v.key} type="button" onClick={() => setView(v.key)}
            className={`rounded-md px-2.5 py-1 font-semibold ${view === v.key ? 'bg-[#0056D2] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{v.label}</button>
        ))}
      </div>
      {rows.length === 0 ? <p className="text-[13px] text-slate-500">Nada neste período.</p> : (
        <div className="max-h-96 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Dia</th>
                {METRICS.map((m) => <th key={m.key} className="px-3 py-2 text-right">{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 tabular-nums text-slate-600">{r.date.split('-').reverse().join('/')}</td>
                  {METRICS.map((m) => <td key={m.key} className="px-3 py-1.5 text-right tabular-nums">{numberFmt(r[m.key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

'use client';

/**
 * Comercial na entrada da landing (mobile) — funil da introdução em vídeo.
 * Visitante = navegador (estimativa). Clique em download ≠ instalação. Quem viu a introdução e quem não viu são
 * públicos diferentes: a comparação é só referência (o teste controlado é o A/B da landing, filtro "Introdução").
 */
import { adminGet, filterParams, type GlobalFilter, type LandingIntroResponse } from '@/lib/admin/analyticsApi';
import { StatCard } from '@/components/admin/charts/Charts';
import { useAsync, Panel, Loading, ErrorBox, numberFmt } from './sections';

const pct = (v: number | null | undefined) => (typeof v === 'number' ? `${(v * 100).toFixed(1).replace('.', ',')}%` : '—');
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function FunnelBar({ label, value, base, tone }: { label: string; value: number; base: number; tone: string }) {
  const w = base ? Math.max(2, Math.round((value / base) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 text-[12px]">
      <span className="w-40 shrink-0 font-semibold text-slate-600">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
        <div className={`h-full rounded ${tone}`} style={{ width: `${w}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right tabular-nums text-slate-700"><b>{numberFmt(value)}</b> <span className="text-slate-400">{base ? `· ${pct(value / base)}` : ''}</span></span>
    </div>
  );
}

export function LandingIntroSection({ filter }: { filter: GlobalFilter }) {
  const { data, error, loading } = useAsync<LandingIntroResponse>(
    () => adminGet('/landing-intro', { period_days: filterParams(filter).period_days, since: filter.since, until: filter.until }),
    [filter.period_days, filter.since, filter.until],
  );
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;
  const f = data.funnel;
  const dur = data.downloads.during_video, aft = data.downloads.after_video;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <StatCard tone="blue" label="Viram o pôster" value={numberFmt(f.poster_visitors)} sub="visitantes únicos (est.)" />
        <StatCard tone="violet" label="Assistiram com som" value={pct(f.watch_rate)} sub={`${numberFmt(f.watch_visitors)} tocaram em Assistir`} />
        <StatCard tone="green" label="Viram até o fim" value={pct(f.complete_rate)} sub={`${numberFmt(f.complete_visitors)} de ${numberFmt(f.start_visitors)} que começaram`} />
        <StatCard tone="amber" label="Pularam" value={pct(f.skip_rate)} sub={`${numberFmt(data.skips.at_poster)} no pôster · ${numberFmt(data.skips.during_video)} no vídeo`} />
      </div>

      <Panel title="Funil do comercial (visitantes únicos)">
        <div className="space-y-2">
          <FunnelBar label="Pôster exibido" value={f.poster_visitors} base={f.poster_visitors} tone="bg-blue-500" />
          <FunnelBar label="Tocou em Assistir" value={f.watch_visitors} base={f.poster_visitors} tone="bg-violet-500" />
          <FunnelBar label="Vídeo começou" value={f.start_visitors} base={f.poster_visitors} tone="bg-teal-500" />
          <FunnelBar label="Vídeo concluído" value={f.complete_visitors} base={f.poster_visitors} tone="bg-emerald-500" />
        </div>
        {f.poster_visitors === 0 && <p className="mt-2 text-[11px] text-slate-400">Sem eventos no período.</p>}
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Downloads">
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <th className="py-1.5">Quando</th><th>Cliques</th><th>Visitantes</th><th>App Store</th><th>Play</th></tr></thead>
            <tbody>
              {([['Durante o vídeo', dur], ['Depois (na landing)', aft]] as const).map(([lbl, d]) => (
                <tr key={lbl} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 font-semibold text-slate-700">{lbl}</td>
                  <td className="tabular-nums">{numberFmt(d.clicks)}</td><td className="tabular-nums">{numberFmt(d.clickers)}</td>
                  <td className="tabular-nums">{numberFmt(d.apple)}</td><td className="tabular-nums">{numberFmt(d.google)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">
            Visitantes que clicaram em baixar: <b>{numberFmt(data.downloads.clickers_total)}</b> ({pct(data.downloads.conversion_of_poster_viewers)} de quem viu o pôster).
            “Sem loja identificada” (clique no computador) não entra nas colunas App Store/Play.
          </p>
        </Panel>
        <Panel title="Por comercial (um por dia, revezando)">
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <th className="py-1.5">Comercial</th><th>Pôster</th><th>Assistiu</th><th>Concluiu</th><th>Baixar</th><th>Conversão</th></tr></thead>
            <tbody>
              {data.by_commercial.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 font-semibold text-slate-700">{c.label}</td>
                  <td className="tabular-nums">{numberFmt(c.poster_visitors)}</td><td className="tabular-nums">{numberFmt(c.watch_visitors)}</td>
                  <td className="tabular-nums">{numberFmt(c.complete_visitors)}</td><td className="tabular-nums">{numberFmt(c.clickers)}</td>
                  <td className="tabular-nums">{pct(c.conversion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">Visitantes distintos que fizeram cada etapa. Dias diferentes têm públicos diferentes: use como referência, sem tirar conclusões definitivas.</p>
        </Panel>
        <Panel title="Quem não viu a introdução (referência)">
          <div className="text-2xl font-black tabular-nums text-slate-800">{pct(data.without_intro.conversion)}</div>
          <p className="text-[12px] text-slate-500">{numberFmt(data.without_intro.clickers)} de {numberFmt(data.without_intro.visitors)} visitantes clicaram em baixar.</p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{data.without_intro.note}</p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Falhas de reprodução">
          {data.errors.total === 0 ? <p className="text-[12px] text-slate-500">Nenhuma falha registrada no período.</p> : (
            <ul className="space-y-0.5 text-[12px] text-slate-600">
              {data.errors.by_reason.map((e) => <li key={e.reason}>{e.reason}: <b>{numberFmt(e.count)}</b></li>)}
              <li className="pt-1 text-[11px] text-slate-400">Em toda falha o visitante entra direto na landing.</li>
            </ul>
          )}
          {data.skips.median_watched_s != null && <p className="mt-2 text-[11px] text-slate-500">Quem pulou durante o vídeo assistiu, em mediana, {String(data.skips.median_watched_s).replace('.', ',')} s.</p>}
        </Panel>
        <Panel title="Por dia (horário de São Paulo)">
          {data.daily.length === 0 ? <p className="text-[12px] text-slate-400">Sem eventos no período.</p> : (
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"><th className="py-1.5">Dia</th><th>Pôster</th><th>Assistiu</th><th>Concluiu</th></tr></thead>
              <tbody>{data.daily.map((d) => (
                <tr key={d.date} className="border-b border-slate-100 last:border-0"><td className="py-1 font-semibold text-slate-700">{dayLabel(d.date)}</td>
                  <td className="tabular-nums">{d.poster}</td><td className="tabular-nums">{d.watch}</td><td className="tabular-nums">{d.complete}</td></tr>))}</tbody>
            </table>
          )}
        </Panel>
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-slate-400">{data.installs_note} Visitante único = navegador (estimativa).</p>
    </div>
  );
}

'use client';

/**
 * Aquisição e Conversão — Landing A/B.
 *
 * Só mostra o que o servidor gravou (eventos `landing_view` / `landing_download_click` /
 * `landing_store_redirect`). Conceitos que nunca se misturam:
 *   visita ≠ visitante único estimado ≠ clique em download ≠ instalação.
 * A conversão é "visitantes que clicaram ÷ visitantes" — uma pessoa que clica 3 vezes é 1 visitante convertido.
 * Instalações NÃO são atribuíveis à variante (o app nativo não recebe a variante) e aparecem à parte.
 */
import { useState } from 'react';
import { adminGet, filterParams, type GlobalFilter, type LandingAbDay, type LandingAbResponse, type LandingAbRow, type LandingAbVariant } from '@/lib/admin/analyticsApi';
import { StatCard } from '@/components/admin/charts/Charts';
import { useAsync, Panel, Loading, ErrorBox, numberFmt } from './sections';

const pct = (v: number | null | undefined) => (typeof v === 'number' ? `${(v * 100).toFixed(1).replace('.', ',')}%` : '—');

const VARIANT_META = {
  A: { title: 'Versão A · com imagem', sub: 'Home do app + “Cuidamos do seu pet.” (atual)', tone: 'blue' as const, color: '#2d6fd8' },
  B: { title: 'Versão B · sem imagem', sub: 'Mesmo texto, sem o telefone: 3 benefícios curtos', tone: 'violet' as const, color: '#7c3aed' },
};

const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Evolução diária: barra clara = visitantes do dia; barra cheia (de baixo pra cima) = os que clicaram em baixar. */
function DailyBars({ days, color, label }: { days: LandingAbDay[]; color: string; label: string }) {
  const max = Math.max(1, ...days.map((d) => d.visitors));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-slate-500">
        <span>{label}</span>
        <span className="flex items-center gap-3 text-[10px] font-medium text-slate-400">
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: `${color}40` }} />visitantes</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />clicaram</span>
        </span>
      </div>
      {days.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-slate-400">Sem eventos no período.</p>
      ) : (
        <>
          <div className="flex h-28 items-end gap-1" role="img" aria-label={label}>
            {days.map((d) => (
              <div key={d.date} className="flex h-full max-w-[56px] flex-1 flex-col justify-end"
                title={`${dayLabel(d.date)} · ${d.visitors} visitantes · ${d.clickers} clicaram (${pct(d.conversion)})`}>
                <div className="relative w-full overflow-hidden rounded-t" style={{ height: `${(d.visitors / max) * 100}%`, background: `${color}40` }}>
                  <div className="absolute bottom-0 w-full" style={{ height: `${d.visitors ? (d.clickers / d.visitors) * 100 : 0}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>{dayLabel(days[0].date)}</span>
            {days.length > 1 && <span>{dayLabel(days[days.length - 1].date)}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function VerdictBanner({ data }: { data: LandingAbResponse }) {
  const { status, leader, p_value, min_sample } = data.verdict;
  const a = data.variants.A, b = data.variants.B;
  const box = 'rounded-xl border p-3 text-[13px] leading-relaxed';
  if (status === 'insufficient') {
    return (
      <div className={`${box} border-amber-200 bg-amber-50 text-amber-900`}>
        <b>Ainda sem veredito.</b> Precisa de pelo menos {numberFmt(min_sample)} visitantes em cada versão (agora:
        A {numberFmt(a.visitors)} · B {numberFmt(b.visitors)}). Com poucos visitantes, uma diferença pode ser só sorte.
      </div>
    );
  }
  if (status === 'no_difference') {
    return (
      <div className={`${box} border-slate-200 bg-slate-50 text-slate-700`}>
        <b>Sem diferença clara.</b> A ({pct(a.conversion)}) e B ({pct(b.conversion)}) convertem parecido
        {p_value != null ? ` (p = ${p_value.toFixed(3).replace('.', ',')})` : ''}. Deixe rodando mais tempo ou mude algo maior.
      </div>
    );
  }
  return (
    <div className={`${box} border-emerald-200 bg-emerald-50 text-emerald-900`}>
      <b>Versão {leader} converte mais</b> ({pct(a.conversion)} × {pct(b.conversion)}) — diferença estatisticamente
      relevante (p = {p_value != null ? p_value.toFixed(3).replace('.', ',') : '—'}).
    </div>
  );
}

function VariantCards({ v, k }: { v: LandingAbVariant; k: 'A' | 'B' }) {
  const m = VARIANT_META[k];
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[15px] font-black text-slate-800">{m.title}</div>
        <div className="text-[12px] text-slate-500">{m.sub}</div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard tone={m.tone} label="Conversão" value={pct(v.conversion)} sub={`${numberFmt(v.clickers)} de ${numberFmt(v.visitors)} visitantes clicaram`} />
        <StatCard tone="teal" label="Visitantes únicos (est.)" value={numberFmt(v.visitors)} sub={`${numberFmt(v.views)} visitas`} />
        <StatCard tone="green" label="Clicaram em baixar" value={numberFmt(v.clickers)} sub={`${numberFmt(v.clicks)} cliques no total`} />
        <StatCard tone="amber" label="Lojas" value={`${numberFmt(v.apple_clicks)} · ${numberFmt(v.google_clicks)}`} sub="App Store · Google Play (cliques)" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <DailyBars label="Evolução diária" color={m.color} days={v.daily} />
      </div>
    </div>
  );
}

function RowsTable({ title, a, b, firstCol }: { title: string; a: LandingAbRow[]; b: LandingAbRow[]; firstCol: string }) {
  const names = [...new Set([...a, ...b].map((r) => r.name))];
  const get = (rows: LandingAbRow[], n: string) => rows.find((r) => r.name === n);
  const cell = (r?: LandingAbRow) => (r ? `${numberFmt(r.visitors)} · ${pct(r.conversion)}` : '—');
  return (
    <Panel title={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <th className="py-1.5 pr-3">{firstCol}</th>
              <th className="py-1.5 pr-3">A · visitantes · conv.</th>
              <th className="py-1.5">B · visitantes · conv.</th>
            </tr>
          </thead>
          <tbody>
            {names.length === 0 && <tr><td colSpan={3} className="py-3 text-slate-400">Sem dados no período.</td></tr>}
            {names.map((n) => (
              <tr key={n} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-3 font-semibold text-slate-700">{n}</td>
                <td className="py-1.5 pr-3 tabular-nums">{cell(get(a, n))}</td>
                <td className="py-1.5 tabular-nums">{cell(get(b, n))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const selectCls = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700';

export function LandingAbSection({ filter }: { filter: GlobalFilter }) {
  const [campaign, setCampaign] = useState('');
  const [source, setSource] = useState('');
  const [os, setOs] = useState('');
  const [instagram, setInstagram] = useState(false);

  const { data, error, loading } = useAsync<LandingAbResponse>(
    () => adminGet('/landing-ab', {
      period_days: filterParams(filter).period_days, since: filter.since, until: filter.until,
      campaign, source, os, instagram: instagram ? 'true' : undefined,
    }),
    [filter.period_days, filter.since, filter.until, campaign, source, os, instagram],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Filtros</span>
        <select aria-label="Campanha" className={selectCls} value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="">Todas as campanhas</option>
          {(data?.options.campaigns ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label="Origem" className={selectCls} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Todas as origens</option>
          {(data?.options.sources ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label="Sistema operacional" className={selectCls} value={os} onChange={(e) => setOs(e.target.value)}>
          <option value="">Todos os sistemas</option>
          {(data?.options.os ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="button" onClick={() => setInstagram((v) => !v)} aria-pressed={instagram}
          className={`rounded-lg border px-3 py-1.5 text-[12px] font-bold transition-colors ${instagram ? 'border-fuchsia-500 bg-fuchsia-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-fuchsia-300'}`}>
          📸 Só Instagram
        </button>
        <span className="text-[11px] text-slate-400">O período é o filtro global acima.</span>
      </div>

      {loading && <Loading />}
      {!loading && (error || !data) && <ErrorBox msg={error} />}
      {data && (
        <>
          <VerdictBanner data={data} />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <VariantCards v={data.variants.A} k="A" />
            <VariantCards v={data.variants.B} k="B" />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <RowsTable title="Por campanha" firstCol="Campanha" a={data.variants.A.by_campaign} b={data.variants.B.by_campaign} />
            <RowsTable title="Por dispositivo" firstCol="Dispositivo" a={data.variants.A.by_device} b={data.variants.B.by_device} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Cadastros atribuídos ao teste">
              <div className="flex gap-6">
                <div><div className="text-[11px] text-slate-400">Versão A</div><div className="text-2xl font-black tabular-nums text-slate-800">{numberFmt(data.variants.A.signups_attributed)}</div></div>
                <div><div className="text-[11px] text-slate-400">Versão B</div><div className="text-2xl font-black tabular-nums text-slate-800">{numberFmt(data.variants.B.signups_attributed)}</div></div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{data.signups_note}</p>
            </Panel>
            <Panel title="Instalações do app — não atribuíveis à versão">
              <div className="text-2xl font-black tabular-nums text-slate-800">{numberFmt(data.installs.total)}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{data.installs.reason}</p>
              {data.installs.by_campaign.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[12px] text-slate-600">
                  {data.installs.by_campaign.slice(0, 5).map((c) => <li key={c.name}>{c.name}: <b>{numberFmt(c.installs)}</b></li>)}
                </ul>
              )}
            </Panel>
          </div>

          <p className="px-1 text-[11px] leading-relaxed text-slate-400">
            Conversão = visitantes únicos estimados que clicaram em baixar ÷ visitantes únicos estimados da versão. Visitante único = navegador
            (aparelho/navegador diferente conta duas vezes). Clique em download não é instalação, e visita à landing não é clique no anúncio.
            {data.quality.cross_variant_visitors > 0 && ` ${data.quality.cross_variant_visitors} navegador(es) apareceram nas duas versões (armazenamento limpo) e contam pela primeira versão vista.`}
          </p>
        </>
      )}
    </div>
  );
}

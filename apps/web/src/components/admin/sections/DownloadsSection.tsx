'use client';

/**
 * Downloads — tela dedicada só a "quantas pessoas baixaram o app, de onde e
 * em qual plataforma". Antes disso o dado vivia misturado com Acessos
 * dentro de Locais (aba Aquisição); esta seção reaproveita o mesmo endpoint
 * (/locations, agora com filtro de plataforma — ver locations_bi.py) só que
 * isolando downloads, com um recorte direto por Android/iPhone/PWA.
 */
import { useState } from 'react';
import { adminGet, type LocationsResponse, type LocationRow } from '@/lib/admin/analyticsApi';
import { useAsync, Panel, Loading, ErrorBox, numberFmt } from './sections';

type PlatformFilter = '' | 'ios' | 'android' | 'pwa';

const PLATFORM_OPTIONS: { value: PlatformFilter; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'ios', label: 'iPhone' },
  { value: 'android', label: 'Android' },
  { value: 'pwa', label: 'PWA (tela de início)' },
];

function placeLabel(p: LocationRow): string {
  return [p.city, p.region].filter(Boolean).join(' · ') || p.city || '—';
}

export function DownloadsSection() {
  // Filtros próprios desta tela — plataforma/cidade/UF restringem tudo
  // (cards + ranking) de uma vez, via o mesmo /locations. Período não entra
  // aqui de propósito (ver nota de locations_bi.py: "Totais" é cumulativo
  // desde o início da campanha, igual ao resto do painel já trata).
  const [platform, setPlatform] = useState<PlatformFilter>('');
  const [stateF, setStateF] = useState('');
  const [cityF, setCityF] = useState('');

  const { data, error, loading } = useAsync<LocationsResponse>(
    () => adminGet('/locations', { platform: platform || undefined }),
    [platform],
  );

  const hasFilters = Boolean(stateF || cityF);
  const places = (data?.places || []).filter((p) =>
    (!stateF || p.region.toLowerCase().includes(stateF.trim().toLowerCase())) &&
    (!cityF || p.city.toLowerCase().includes(cityF.trim().toLowerCase())));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="font-bold uppercase tracking-wide text-slate-400">Filtros</span>
        {PLATFORM_OPTIONS.map((o) => (
          <button key={o.value} type="button" onClick={() => setPlatform(o.value)}
            className={`rounded-md px-2.5 py-1 font-semibold ${
              platform === o.value ? 'bg-[#0056D2] text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {o.label}
          </button>
        ))}
        <input placeholder="UF" value={stateF} onChange={(e) => setStateF(e.target.value)}
          className="w-16 rounded-md border border-slate-200 px-2 py-1" />
        <input placeholder="cidade" value={cityF} onChange={(e) => setCityF(e.target.value)}
          className="w-36 rounded-md border border-slate-200 px-2 py-1" />
        {hasFilters && (
          <button type="button" onClick={() => { setStateF(''); setCityF(''); }}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-500">limpar</button>
        )}
      </div>

      {loading ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Downloads hoje</p>
              <p className="mt-1 text-3xl font-extrabold text-emerald-600 tabular-nums">{numberFmt(data.downloads_today)}</p>
              <div className="mt-2 flex gap-4 text-[12px] text-slate-500">
                <span>🤖 Android: <b className="text-slate-700">{numberFmt(data.downloads_today_by_platform.android)}</b></span>
                <span>🍎 iPhone: <b className="text-slate-700">{numberFmt(data.downloads_today_by_platform.ios)}</b></span>
                <span>📲 PWA: <b className="text-slate-700">{numberFmt(data.downloads_today_by_platform.pwa)}</b></span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Downloads totais</p>
              <p className="mt-1 text-3xl font-extrabold text-[#0056D2] tabular-nums">{numberFmt(data.downloads_campaign)}</p>
              <div className="mt-2 flex gap-4 text-[12px] text-slate-500">
                <span>🤖 Android: <b className="text-slate-700">{numberFmt(data.downloads_campaign_by_platform.android)}</b></span>
                <span>🍎 iPhone: <b className="text-slate-700">{numberFmt(data.downloads_campaign_by_platform.ios)}</b></span>
                <span>📲 PWA: <b className="text-slate-700">{numberFmt(data.downloads_campaign_by_platform.pwa)}</b></span>
              </div>
            </div>
          </div>

          <Panel
            title="Por estado/cidade"
            right={<span className="text-[11px] text-slate-400">
              {places.length} local(is){platform ? ` · só ${PLATFORM_OPTIONS.find((o) => o.value === platform)?.label}` : ''}
            </span>}
          >
            <p className="mb-2 text-[11px] font-semibold text-slate-500">{data.window_label}</p>
            {places.length === 0 ? (
              <p className="text-[13px] text-slate-400">Nenhum download com esses filtros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead><tr className="text-left text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-1.5">Local</th>
                    <th className="py-1.5 text-right">Downloads</th>
                  </tr></thead>
                  <tbody>
                    {places
                      .filter((p) => p.downloads > 0)
                      .sort((a, b) => b.downloads - a.downloads)
                      .map((p) => (
                        <tr key={placeLabel(p)} className="border-t border-slate-100">
                          <td className="py-1.5 font-medium">{placeLabel(p)}</td>
                          <td className="py-1.5 text-right tabular-nums font-semibold">{numberFmt(p.downloads)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <p className="rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-600">{data.note}</p>
        </>
      )}
    </div>
  );
}

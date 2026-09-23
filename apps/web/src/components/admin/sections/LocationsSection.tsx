'use client';

/**
 * Locais — de onde vêm os acessos, downloads e cadastros do app.
 *
 * Antes disso, a única forma de ver "onde o PETMOL está sendo usado" era
 * vasculhar cada push/e-mail avulso de instalação um por um (o dono chegou
 * a receber mais de 300). Este painel agrega o mesmo dado (mesma fonte,
 * mesma distinção acesso/download do push e do e-mail diário) — agora com
 * três agrupamentos (cidade/estado, campanha, plataforma), período
 * selecionável (segue o filtro global do Mission Control) e um drill-down
 * linha-a-linha ordenado por mais recente.
 *
 * Três fontes de localização DIFERENTES aparecem aqui, nunca misturadas:
 * "Local" (cidade/estado dos acessos/downloads) vem do IP — aproximado.
 * "Cadastros" vem do cadastro do tutor (declarado) — pode divergir do IP.
 * Nenhuma delas é a localização do PET (essa é outra fonte ainda, usada só
 * no Mapa/Pet Sumido) — ver nota de cada card.
 */
import { useEffect, useRef, useState } from 'react';
import {
  adminGet, type GlobalFilter,
  type LocationsResponse, type LocationRow,
  type CampaignsResponse, type CampaignSpendItem, type LocationEventsResponse,
} from '@/lib/admin/analyticsApi';
import { getToken } from '@/lib/auth-token';
import { spIsoDate } from '@/lib/analytics/spTime';
import { StatCard } from '@/components/admin/charts/Charts';
import { Pagination, fmtDateTimeFull } from '@/components/admin/DataTable';
import { useAsync, Panel, Loading, ErrorBox, numberFmt, GeoSection } from './sections';

type GroupBy = 'campaign' | 'city_state' | 'cadastros' | 'platform';
type SortBy = 'total' | 'downloads' | 'acessos';

const GROUP_BY_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: 'campaign', label: 'Campanha' },
  { key: 'city_state', label: 'Estado/Cidade' },
  { key: 'cadastros', label: 'Cadastros (declarado)' },
  { key: 'platform', label: 'Plataforma' },
];

const brl = (n: number | null | undefined) =>
  typeof n === 'number' ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

function placeLabel(p: LocationRow): string {
  return [p.city, p.region].filter(Boolean).join(' · ') || p.city || '—';
}

// ── Agrupamento por plataforma ──────────────────────────────────────────
// Sem endpoint dedicado — reaproveita o feed de eventos (já paginado/
// filtrado por período) e conta client-side. Cap de 500 linhas é suficiente
// no volume atual do PETMOL; se crescer muito, vale um agregado no banco
// como /campaigns já tem.
const PLATFORM_LABEL: Record<string, string> = {
  ios: 'iPhone', ios_capacitor: 'iPhone', android: 'Android', android_capacitor: 'Android',
  pwa: 'App instalado (PWA)', web: 'Navegador',
};
function normalizedPlatform(p: string | null): string {
  if (!p) return 'Desconhecida';
  return PLATFORM_LABEL[p] || p;
}

function PlatformGroupTable({ filter }: { filter: GlobalFilter }) {
  const { data, error, loading } = useAsync<LocationEventsResponse>(
    () => adminGet('/location-events', { since: filter.since, until: filter.until, page_size: 200 }),
    [filter.since, filter.until],
  );
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  const byPlatform = new Map<string, { downloads: number; acessos: number }>();
  for (const it of data.items) {
    const label = normalizedPlatform(it.platform);
    const slot = byPlatform.get(label) || { downloads: 0, acessos: 0 };
    if (it.event === 'download') slot.downloads += 1; else slot.acessos += 1;
    byPlatform.set(label, slot);
  }
  const rows = [...byPlatform.entries()]
    .map(([label, v]) => ({ label, ...v, total: v.downloads + v.acessos }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="overflow-x-auto">
      {data.total > data.items.length && (
        <p className="mb-2 text-[11px] text-slate-400">
          Baseado nos {data.items.length} eventos mais recentes de {numberFmt(data.total)} no período — amostra, não o total exato.
        </p>
      )}
      <table className="w-full text-[13px]">
        <thead><tr className="text-left text-[11px] font-bold uppercase text-slate-500">
          <th className="py-1.5">Plataforma</th>
          <th className="py-1.5 text-right">Downloads</th>
          <th className="py-1.5 text-right">Acessos</th>
          <th className="py-1.5 text-right">Total</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-slate-100">
              <td className="py-1.5 font-medium">{r.label}</td>
              <td className="py-1.5 text-right tabular-nums">{numberFmt(r.downloads)}</td>
              <td className="py-1.5 text-right tabular-nums">{numberFmt(r.acessos)}</td>
              <td className="py-1.5 text-right tabular-nums font-semibold">{numberFmt(r.total)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-400">Nada no período.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Agrupamento por campanha (visão padrão) ────────────────────────────

/** "150,50" ou "150.50" ou "1.500,50" → 150.5 / 1500.5. NaN se não der. */
export function parseBrlInput(raw: string): number {
  const v = raw.trim().replace(/[R$\s]/g, '');
  if (!v) return NaN;
  const normalized = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v;
  return Number(normalized);
}

function CampaignSpendPanel({ campaignNames, onChanged }: { campaignNames: string[]; onChanged: () => void }) {
  const [campaign, setCampaign] = useState('');
  const [day, setDay] = useState(() => spIsoDate(new Date()));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const list = useAsync<{ items: CampaignSpendItem[] }>(() => adminGet('/campaign-spend', { limit: 8 }), [refresh]);

  const call = async (path: string, init: RequestInit) => {
    const token = getToken();
    const res = await fetch(`/api/v1/admin/analytics${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`);
    return body;
  };

  const submit = async () => {
    const value = parseBrlInput(amount);
    if (!campaign.trim()) return setMsg('Informe a campanha (o mesmo utm_campaign da URL).');
    if (!Number.isFinite(value) || value <= 0) return setMsg('Informe um valor maior que zero, ex.: 150,50.');
    setBusy(true); setMsg(null);
    try {
      await call('/campaign-spend', {
        method: 'POST',
        body: JSON.stringify({ utm_campaign: campaign.trim(), spent_on: day, amount_brl: value, note: note.trim() || undefined }),
      });
      setAmount(''); setNote(''); setRefresh((k) => k + 1); onChanged();
      setMsg('Gasto lançado.');
    } catch (e) {
      setMsg(`Erro: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (it: CampaignSpendItem) => {
    if (!window.confirm(`Remover o lançamento de ${brl(it.amount_brl)} em "${it.utm_campaign}"?`)) return;
    try { await call(`/campaign-spend/${it.id}`, { method: 'DELETE' }); setRefresh((k) => k + 1); onChanged(); }
    catch (e) { setMsg(`Erro: ${(e as Error).message}`); }
  };

  return (
    <Panel title="Lançar gasto de campanha" right={<span className="text-[11px] text-slate-400">custo = gasto ÷ downloads/cadastros da mesma campanha</span>}>
      <div className="flex flex-wrap items-end gap-1.5 text-[12px]">
        <label className="flex flex-col gap-0.5">Campanha (utm_campaign)
          <input list="campaign-names" value={campaign} onChange={(e) => setCampaign(e.target.value)}
            className="w-44 rounded-md border border-slate-200 px-2 py-1" />
        </label>
        <datalist id="campaign-names">{campaignNames.map((n) => <option key={n} value={n} />)}</datalist>
        <label className="flex flex-col gap-0.5">Dia do gasto
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="rounded-md border border-slate-200 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-0.5">Valor (R$)
          <input inputMode="decimal" placeholder="150,50" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-28 rounded-md border border-slate-200 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-0.5">Observação
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-40 rounded-md border border-slate-200 px-2 py-1" />
        </label>
        <button type="button" disabled={busy} onClick={submit}
          className="rounded-md bg-[#0056D2] px-3 py-1.5 font-bold text-white disabled:opacity-50">{busy ? 'Lançando…' : 'Lançar'}</button>
      </div>
      {msg && <p className="mt-2 text-[12px] text-slate-600">{msg}</p>}
      {list.data && list.data.items.length > 0 && (
        <ul className="mt-3 space-y-1 text-[12px] text-slate-600">
          {list.data.items.map((it) => (
            <li key={it.id} className="flex items-center gap-2">
              <span className="tabular-nums text-slate-400">{it.spent_on.split('-').reverse().join('/')}</span>
              <span className="font-medium">{it.utm_campaign}</span>
              <span className="tabular-nums">{brl(it.amount_brl)}</span>
              {it.note && <span className="text-slate-400">· {it.note}</span>}
              <button type="button" onClick={() => remove(it)} className="ml-auto text-rose-600 hover:underline">remover</button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CampaignGroupTable({ filter }: { filter: GlobalFilter }) {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useAsync<CampaignsResponse>(
    () => adminGet('/campaigns', { since: filter.since, until: filter.until, platform: filter.platform }),
    [filter.since, filter.until, filter.platform, refresh],
  );
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  const t = data.totals;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <StatCard label="Gasto lançado" value={brl(t.gasto_brl)} />
        <StatCard label="Custo por download" tone="good" value={brl(t.custo_por_download)}
          sub={t.gasto_brl ? `${numberFmt(t.downloads)} downloads` : 'lance um gasto pra ver'} />
        <StatCard label="Custo por cadastro" tone="good" value={brl(t.custo_por_cadastro)}
          sub={t.gasto_brl ? `${numberFmt(t.cadastros)} cadastros` : 'lance um gasto pra ver'} />
      </div>

      {!data.has_any_attribution && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
          Nenhum acesso/download com parâmetros de campanha (utm_source/utm_medium/utm_campaign) neste período —
          todo o tráfego está caindo em &quot;(direto/orgânico)&quot;. Confira se os links de divulgação estão saindo com UTM.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[11px] font-bold uppercase text-slate-500">
            <th className="py-1.5">Campanha</th>
            <th className="py-1.5">Origem</th>
            <th className="py-1.5 text-right">Acessos</th>
            <th className="py-1.5 text-right">Downloads</th>
            <th className="py-1.5 text-right">Cadastros</th>
            <th className="py-1.5 text-right">Gasto</th>
            <th className="py-1.5 text-right">Custo/download</th>
            <th className="py-1.5 text-right">Custo/cadastro</th>
          </tr></thead>
          <tbody>
            {data.campaigns.map((c) => (
              <tr key={c.utm_campaign} className="border-t border-slate-100">
                <td className="py-1.5 font-medium">{c.utm_campaign}</td>
                <td className="py-1.5 text-slate-500">{c.utm_source}{c.utm_medium !== '—' ? ` · ${c.utm_medium}` : ''}</td>
                <td className="py-1.5 text-right tabular-nums">{numberFmt(c.acessos)}</td>
                <td className="py-1.5 text-right tabular-nums">{numberFmt(c.downloads)}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">{numberFmt(c.cadastros)}</td>
                <td className="py-1.5 text-right tabular-nums">{c.gasto_brl ? brl(c.gasto_brl) : '—'}</td>
                <td className="py-1.5 text-right tabular-nums">{brl(c.custo_por_download)}</td>
                <td className="py-1.5 text-right tabular-nums">{brl(c.custo_por_cadastro)}</td>
              </tr>
            ))}
            {data.campaigns.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-400">Nada no período.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">{data.note}</p>

      <CampaignSpendPanel campaignNames={data.campaigns.map((c) => c.utm_campaign).filter((n) => !n.startsWith('('))}
        onChanged={() => setRefresh((k) => k + 1)} />
    </div>
  );
}

// ── Agrupamento por cidade/estado (padrão) ──────────────────────────────

function CityStateGroupTable({ filter, sortBy, onSortByChange, onFilterByCity }: {
  filter: GlobalFilter; sortBy: SortBy; onSortByChange?: (s: SortBy) => void;
  onFilterByCity?: (city: string) => void;
}) {
  const { data, error, loading } = useAsync<LocationsResponse>(
    () => adminGet('/locations', { since: filter.since, until: filter.until, sort_by: sortBy }),
    [filter.since, filter.until, sortBy],
  );
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  const sortHeader = (key: SortBy, label: string, align: 'right' = 'right') => (
    <th className={`py-1.5 text-${align}`}>
      {onSortByChange ? (
        <button type="button" onClick={() => onSortByChange(key)}
          className={`inline-flex items-center gap-1 hover:text-slate-800 ${sortBy === key ? 'text-[#0056D2]' : ''}`}>
          {label}{sortBy === key ? ' ▼' : ''}
        </button>
      ) : label}
    </th>
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <StatCard label="Downloads hoje" tone="good" value={numberFmt(data.downloads_today)} />
        <StatCard label="Acessos hoje" value={numberFmt(data.acessos_today)} />
        <StatCard label="Downloads (campanha)" tone="good" value={numberFmt(data.downloads_campaign)} />
        <StatCard label="Acessos (campanha)" value={numberFmt(data.acessos_campaign)} />
      </div>

      <Panel
        title="Por estado/cidade"
        right={<span className="text-[11px] text-slate-400">
          {data.places_total > data.places.length
            ? `mostrando ${data.places.length} de ${data.places_total}`
            : `${data.places_total} local(is)`}
          {onFilterByCity ? ' · clique filtra Tutores & Pets' : ''}
        </span>}
      >
        <p className="mb-2 text-[11px] font-semibold text-slate-500">{data.window_label}</p>
        {data.places.length === 0 ? (
          <p className="text-[13px] text-slate-400">Nenhum acesso/download registrado no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] font-bold uppercase text-slate-500">
                <th className="py-1.5">Local</th>
                {sortHeader('downloads', 'Downloads')}
                {sortHeader('acessos', 'Acessos')}
                {sortHeader('total', 'Total')}
                <th className="py-1.5 text-right">Cadastros</th>
              </tr></thead>
              <tbody>
                {data.places.map((p) => {
                  const clickable = Boolean(onFilterByCity && p.city && p.city !== '—');
                  return (
                    <tr key={placeLabel(p)}
                      onClick={clickable ? () => onFilterByCity?.(p.city) : undefined}
                      className={`border-t border-slate-100 ${clickable ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                      <td className="py-1.5 font-medium">{placeLabel(p)}</td>
                      <td className="py-1.5 text-right tabular-nums">{numberFmt(p.downloads)}</td>
                      <td className="py-1.5 text-right tabular-nums">{numberFmt(p.acessos)}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">{numberFmt(p.total)}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500" title="Cidade DECLARADA no cadastro — sinal diferente do IP do acesso/download, pode divergir">
                        {numberFmt(p.cadastros_declared_location)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-600">{data.note}</p>
    </div>
  );
}

// ── Drill-down: eventos recentes (linha a linha) ────────────────────────

const EVENT_TYPE_OPTIONS = [
  { value: '', label: 'Todos' }, { value: 'download', label: 'Download' }, { value: 'acesso', label: 'Acesso' },
];
const REGISTERED_OPTIONS = [
  { value: '', label: 'Todos' }, { value: 'true', label: 'Cadastrado' }, { value: 'false', label: 'Visitante' },
];

function LocationEventsDrilldown({ filter }: { filter: GlobalFilter }) {
  const [page, setPage] = useState(1);
  const [stateF, setStateF] = useState('');
  const [cityF, setCityF] = useState('');
  const [platformF, setPlatformF] = useState('');
  const [campaignF, setCampaignF] = useState('');
  const [eventTypeF, setEventTypeF] = useState('');
  const [registeredF, setRegisteredF] = useState('');
  const [nameSearch, setNameSearch] = useState('');

  const params = {
    since: filter.since, until: filter.until,
    state: stateF || undefined, city: cityF || undefined, platform: platformF || undefined,
    utm_campaign: campaignF || undefined, event_type: eventTypeF || undefined,
    registered_only: registeredF || undefined,
    page, page_size: 25,
  };
  const { data, error, loading } = useAsync<LocationEventsResponse>(
    () => adminGet('/location-events', params),
    [filter.since, filter.until, stateF, cityF, platformF, campaignF, eventTypeF, registeredF, page],
  );

  const hasFilters = stateF || cityF || platformF || campaignF || eventTypeF || registeredF;
  const clearFilters = () => {
    setStateF(''); setCityF(''); setPlatformF(''); setCampaignF(''); setEventTypeF(''); setRegisteredF(''); setPage(1);
  };

  const items = (data?.items || []).filter((it) =>
    !nameSearch || it.name.toLowerCase().includes(nameSearch.trim().toLowerCase()));

  return (
    <Panel title="Eventos recentes (mais novo primeiro)">
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px]">
        <input placeholder="UF" value={stateF} onChange={(e) => { setStateF(e.target.value); setPage(1); }}
          className="w-16 rounded-md border border-slate-200 px-2 py-1" />
        <input placeholder="cidade" value={cityF} onChange={(e) => { setCityF(e.target.value); setPage(1); }}
          className="w-32 rounded-md border border-slate-200 px-2 py-1" />
        <input placeholder="plataforma" value={platformF} onChange={(e) => { setPlatformF(e.target.value); setPage(1); }}
          className="w-24 rounded-md border border-slate-200 px-2 py-1" />
        <input placeholder="campanha (utm_campaign)" value={campaignF} onChange={(e) => { setCampaignF(e.target.value); setPage(1); }}
          className="w-40 rounded-md border border-slate-200 px-2 py-1" />
        <select value={eventTypeF} onChange={(e) => { setEventTypeF(e.target.value); setPage(1); }}
          className="rounded-md border border-slate-200 px-2 py-1">
          {EVENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={registeredF} onChange={(e) => { setRegisteredF(e.target.value); setPage(1); }}
          className="rounded-md border border-slate-200 px-2 py-1">
          {REGISTERED_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input placeholder="buscar por nome (nesta página)" value={nameSearch} onChange={(e) => setNameSearch(e.target.value)}
          className="w-48 rounded-md border border-slate-200 px-2 py-1" />
        {hasFilters && (
          <button type="button" onClick={clearFilters}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-500">limpar</button>
        )}
      </div>

      {loading ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] font-bold uppercase text-slate-500">
                <th className="py-1.5">Data/hora</th>
                <th className="py-1.5">Nome</th>
                <th className="py-1.5">Cidade/UF</th>
                <th className="py-1.5">Plataforma</th>
                <th className="py-1.5">Evento</th>
                <th className="py-1.5">Campanha</th>
              </tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={`${it.occurred_at}-${i}`} className="border-t border-slate-100">
                    <td className="py-1.5 tabular-nums text-slate-500">{fmtDateTimeFull(it.occurred_at)}</td>
                    <td className={`py-1.5 ${it.identified ? 'font-medium text-slate-900' : 'text-slate-400'}`}>{it.name}</td>
                    <td className="py-1.5 text-slate-600">{[it.city, it.state].filter(Boolean).join('/') || '—'}</td>
                    <td className="py-1.5 text-slate-600">{normalizedPlatform(it.platform)}</td>
                    <td className="py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${it.event === 'download' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {it.event === 'download' ? 'Download' : 'Acesso'}
                      </span>
                    </td>
                    <td className="py-1.5 text-slate-500">{it.utm_campaign}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-400">
                    {nameSearch ? 'Nenhum nome bate com a busca nesta página.' : 'Nenhum evento com esses filtros.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3"><Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} /></div>
          <p className="mt-2 text-[11px] text-slate-400">{data.note}</p>
        </>
      )}
    </Panel>
  );
}

// ── Componente principal ──────────────────────────────────────────────────

export function LocationsSection({ filter, sortBy = 'total', onSortByChange, onFilterByCity }: {
  filter: GlobalFilter;
  /** Qual coluna vem ordenada primeiro — muda quando o dono clica no card
   * Downloads/Acessos em Indicadores Executivos. */
  sortBy?: SortBy;
  onSortByChange?: (s: SortBy) => void;
  /** Clicar numa cidade filtra Tutores & Pets por ela — melhor esforço: o
   * local aqui vem de geo-IP, o cadastro do tutor é auto-declarado, então
   * nem sempre bate, mas quando bate poupa digitar o filtro à mão. */
  onFilterByCity?: (city: string) => void;
}) {
  // Padrão = campanha (a pergunta do dono é "qual campanha rende?"). Clicar
  // no card Downloads/Acessos (que pede uma ordenação por local) troca pra
  // Estado/Cidade — a tela que responde aquilo.
  const [groupBy, setGroupBy] = useState<GroupBy>('campaign');
  const firstSort = useRef(true);
  useEffect(() => {
    if (firstSort.current) { firstSort.current = false; return; }
    if (sortBy !== 'total') setGroupBy('city_state');
  }, [sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="font-bold uppercase tracking-wide text-slate-400">Agrupar por</span>
        {GROUP_BY_OPTIONS.map((o) => (
          <button key={o.key} type="button" onClick={() => setGroupBy(o.key)}
            className={`rounded-md px-2.5 py-1 font-semibold ${
              groupBy === o.key ? 'bg-[#0056D2] text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {o.label}
          </button>
        ))}
      </div>

      {groupBy === 'city_state' && (
        <CityStateGroupTable filter={filter} sortBy={sortBy} onSortByChange={onSortByChange} onFilterByCity={onFilterByCity} />
      )}
      {groupBy === 'campaign' && <CampaignGroupTable filter={filter} />}
      {groupBy === 'cadastros' && <GeoSection />}
      {groupBy === 'platform' && <PlatformGroupTable filter={filter} />}

      <LocationEventsDrilldown filter={filter} />

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-600">
        Local dos acessos/downloads = aproximado por IP. Cadastros = cidade declarada pelo tutor no cadastro (sinal
        diferente, pode divergir). Nenhum dos dois é a localização do pet. Filtros de nome/e-mail, &quot;tem pet&quot;,
        &quot;push habilitado&quot; e &quot;1ª visita vs retorno&quot; ainda não têm suporte aqui — ver limitações no PR.
      </p>
    </div>
  );
}

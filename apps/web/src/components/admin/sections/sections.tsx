'use client';

import { useEffect, useState } from 'react';
import {
  adminGet, filterParams, type GlobalFilter,
  type OverviewResponse, type FeatureMatrixResponse, type FeatureRow,
  type UsersListResponse, type DataQualityResponse,
} from '@/lib/admin/analyticsApi';
import { LineChart, BarRanking, StatCard, PercentBar } from '@/components/admin/charts/Charts';
import { DataTable, Pagination, StatePill, fmtDate, type Column } from '@/components/admin/DataTable';
import { UserDetailDrawer, PetDetailDrawer, PopulationDrawer } from './detail';

const numberFmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('pt-BR') : '—');

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    fn().then((d) => alive && setData(d)).catch((e) => alive && setError(String(e?.message || e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading };
}

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-slate-700">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════

export function OverviewSection({ filter }: { filter: GlobalFilter }) {
  const { data, error, loading } = useAsync<OverviewResponse>(
    () => adminGet('/overview', filterParams(filter)), [JSON.stringify(filter)],
  );
  const funnel = useAsync<{ steps: { key: string; label: string; users: number; pct_of_total: number; pct_from_previous: number | null }[]; note: string }>(
    () => adminGet('/activation-funnel', filterParams(filter)), [JSON.stringify(filter)],
  );

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Tutores" value={numberFmt(data.totals.users)}
          sub={`+${data.totals.new_users_today} hoje · +${data.totals.new_users_7d} 7d · +${data.totals.new_users_30d} 30d`}
          trend={data.series.new_users} />
        <StatCard label="Pets" value={numberFmt(data.totals.pets)}
          sub={`+${data.totals.new_pets_7d} 7d · ${data.tutors.avg_pets_per_tutor} por tutor`}
          trend={data.series.new_pets} />
        <StatCard label="Ativos 24h" value={numberFmt(data.engagement.active_users_24h)}
          sub={`WAU ${numberFmt(data.engagement.wau)} · MAU ${numberFmt(data.engagement.mau)}`}
          trend={data.series.active_users} />
        <StatCard label="DAU / MAU" value={data.engagement.dau_mau != null ? `${(data.engagement.dau_mau * 100).toFixed(0)}%` : '—'}
          sub={`${numberFmt(data.engagement.sessions_7d)} sessões 7d`} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Tutores sem pet" value={numberFmt(data.tutors.without_pet)} tone={data.tutors.without_pet > 0 ? 'warn' : 'default'} />
        <StatCard label="Tutores c/ alimentação" value={numberFmt(data.tutors.with_feeding_configured)}
          sub={`${numberFmt(data.tutors.pets_with_feeding_configured)} pets`} />
        <StatCard label="Pets c/ controle ativo" value={numberFmt(data.tutors.pets_with_active_control)} tone="good" />
        <StatCard label="Pets com alimentação" value={numberFmt(data.tutors.pets_with_feeding_configured)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Novos tutores / dia (30d)"><LineChart data={data.series.new_users} color="#0056D2" /></Panel>
        <Panel title="Usuários ativos / dia (30d)"><LineChart data={data.series.active_users} color="#10b981" /></Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Plataformas (usuários, 30d)">
          <BarRanking data={data.platforms.map((p) => ({ label: p.platform, value: p.users }))} />
        </Panel>
        <Panel title="Versões do app (usuários, 30d)">
          <BarRanking data={data.app_versions.map((p) => ({ label: p.version, value: p.users }))} color="#8b5cf6" />
        </Panel>
      </div>

      <Panel title="Funil de ativação — usuários únicos" right={<span className="text-[11px] text-slate-400">estado do banco, não soma de eventos</span>}>
        {funnel.data ? (
          <div className="space-y-2">
            {funnel.data.steps.map((s) => (
              <div key={s.key} className="flex items-center gap-3 text-[13px]">
                <div className="w-48 flex-shrink-0 text-slate-600">{s.label}</div>
                <div className="h-5 flex-1 rounded bg-slate-100">
                  <div className="flex h-full items-center rounded bg-[#0056D2] px-2 text-[11px] font-bold text-white"
                    style={{ width: `${Math.max(4, s.pct_of_total * 100)}%` }}>
                    {numberFmt(s.users)}
                  </div>
                </div>
                <div className="w-32 flex-shrink-0 text-right text-[12px] text-slate-500">
                  {(s.pct_of_total * 100).toFixed(1)}% do total
                  {s.pct_from_previous != null && <span className="text-slate-400"> · {(s.pct_from_previous * 100).toFixed(0)}% do anterior</span>}
                </div>
              </div>
            ))}
          </div>
        ) : <span className="text-[13px] text-slate-400">Carregando…</span>}
      </Panel>

      <Panel title="Top funcionalidades (adoção por pet)">
        <BarRanking data={data.top_features.map((f) => ({ label: f.label, value: Math.round(f.adoption_pct * 1000) / 10 }))}
          formatValue={(v) => `${v}%`} max={100} />
      </Panel>

      <Panel title="Qualidade dos dados — piores 5">
        <div className="space-y-1.5">
          {data.data_quality_headline.issues.map((i) => (
            <div key={i.key} className="flex items-center gap-3 text-[12px]">
              <span className="w-56 text-slate-600">{i.label}</span>
              <PercentBar pct={i.pct} tone={i.pct > 0.5 ? 'rose' : i.pct > 0.2 ? 'amber' : 'blue'} />
              <span className="text-slate-500">{numberFmt(i.count)} / {numberFmt(i.of)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <p className="text-[11px] text-slate-400">{data.engagement.note}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  USERS & PETS
// ═══════════════════════════════════════════════════════════════════════════

export function UsersSection({ filter }: { filter: GlobalFilter }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState('created_at');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [openPet, setOpenPet] = useState<string | null>(null);

  const filterKey = JSON.stringify(filter);
  useEffect(() => { const t = setTimeout(() => setDebounced(search), 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [debounced, sort, direction, filterKey]);

  const { data, error, loading } = useAsync<UsersListResponse>(
    () => adminGet('/users', {
      ...filterParams(filter), page, page_size: 50,
      search: debounced || undefined, sort, direction,
    }),
    [page, debounced, sort, direction, filterKey],
  );

  const onSort = (key: string) => {
    if (key === sort) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setDirection('desc'); }
  };

  const columns: Column<UsersListResponse['items'][number]>[] = [
    { key: 'email', header: 'Tutor', sortable: true, render: (r) => (
      <div><div className="font-semibold text-slate-900">{r.name || '(sem nome)'}</div>
        <div className="text-[11px] text-slate-500">{r.email}</div></div>
    ) },
    { key: 'created_at', header: 'Cadastro', sortable: true, render: (r) => fmtDate(r.created_at) },
    { key: 'last_activity', header: 'Última ativ.', render: (r) => (
      <div className="flex items-center gap-2"><span>{fmtDate(r.last_activity)}</span><StatePill state={r.activity_status} /></div>
    ) },
    { key: 'pets', header: 'Pets', align: 'right', render: (r) => r.pets },
    { key: 'feeding', header: 'Alim.', render: (r) => r.has_feeding ? '✓' : '—' },
    { key: 'controls', header: 'Ctrl ativos', align: 'right', render: (r) => r.active_control_pets },
    { key: 'platform', header: 'Plataforma', render: (r) => r.last_platform || '—' },
    { key: 'geo', header: 'Local', render: (r) => [r.city, r.state].filter(Boolean).join(' / ') || '—' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail…"
          className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-blue-400" />
        {data && <span className="text-[12px] text-slate-500">{numberFmt(data.total)} tutores</span>}
      </div>
      {error && <ErrorBox msg={error} />}
      {loading && !data ? <Loading /> : data && (
        <>
          <DataTable columns={columns} rows={data.items} rowKey={(r) => r.user_id}
            sort={sort} direction={direction} onSort={onSort} onRowClick={(r) => setOpenUser(r.user_id)} />
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </>
      )}
      <UserDetailDrawer userId={openUser} onClose={() => setOpenUser(null)}
        onOpenPet={(id) => { setOpenPet(id); }} />
      <PetDetailDrawer petId={openPet} onClose={() => setOpenPet(null)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  FEATURES
// ═══════════════════════════════════════════════════════════════════════════

export function FeaturesSection({ filter }: { filter: GlobalFilter }) {
  const { data, error, loading } = useAsync<FeatureMatrixResponse>(
    () => adminGet('/features', filterParams(filter)), [JSON.stringify(filter)],
  );
  const [pop, setPop] = useState<{ path: string; title: string } | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [openPet, setOpenPet] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  const cell = (fr: FeatureRow, state: string, n: number | null) => {
    if (n == null) return <span className="text-slate-300">—</span>;
    if (n === 0) return <span className="text-slate-400">0</span>;
    return (
      <button type="button"
        onClick={() => setPop({ path: `/features/${fr.key}/population?state=${state}`, title: `${fr.label} — ${state}` })}
        className="font-semibold text-blue-600 hover:underline">{numberFmt(n)}</button>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-slate-500">
        Clique em qualquer número para ver a população. Estado por pet derivado do banco:
        {' '}<b>ativo</b> {data.state_rules.active}; <b>defasado</b> {data.state_rules.stale}; <b>inativo</b> {data.state_rules.inactive}.
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2.5">Funcionalidade</th>
            <th className="px-3 py-2.5 text-right">Tutores</th>
            <th className="px-3 py-2.5 text-right">Pets</th>
            <th className="px-3 py-2.5 text-right">Ativos</th>
            <th className="px-3 py-2.5 text-right">Defasados</th>
            <th className="px-3 py-2.5 text-right">Inativos</th>
            <th className="px-3 py-2.5 text-right">Nunca</th>
            <th className="px-3 py-2.5">Adoção</th>
          </tr></thead>
          <tbody>
            {data.features.map((fr) => (
              <tr key={fr.key} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-slate-900">{fr.label}</div>
                  <div className="text-[11px] text-slate-400">{fr.kind === 'behavioral' ? 'comportamental' : 'operacional'}</div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <button type="button" disabled={fr.scope !== 'user' && fr.kind !== 'operational'}
                    onClick={() => setPop({ path: `/features/${fr.key}/population`, title: fr.label })}
                    className="font-semibold text-blue-600 hover:underline disabled:text-slate-700 disabled:no-underline">
                    {numberFmt(fr.users)}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{numberFmt(fr.pets)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{cell(fr, 'active', fr.active)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{cell(fr, 'stale', fr.stale)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{cell(fr, 'inactive', fr.inactive)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{cell(fr, 'never_configured', fr.never_configured)}</td>
                <td className="px-3 py-2.5"><PercentBar pct={fr.adoption_pct} tone={fr.adoption_pct > 0.5 ? 'emerald' : fr.adoption_pct > 0.2 ? 'blue' : 'amber'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PopulationDrawer path={pop?.path ?? null} title={pop?.title ?? ''} onClose={() => setPop(null)}
        onOpenUser={setOpenUser} onOpenPet={setOpenPet} />
      <UserDetailDrawer userId={openUser} onClose={() => setOpenUser(null)} onOpenPet={setOpenPet} />
      <PetDetailDrawer petId={openPet} onClose={() => setOpenPet(null)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  DATA QUALITY
// ═══════════════════════════════════════════════════════════════════════════

export function DataQualitySection() {
  const { data, error, loading } = useAsync<DataQualityResponse>(() => adminGet('/data-quality'), []);
  const [pop, setPop] = useState<{ path: string; title: string } | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [openPet, setOpenPet] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2.5">Problema</th>
            <th className="px-3 py-2.5 text-right">Qtd</th>
            <th className="px-3 py-2.5 text-right">De</th>
            <th className="px-3 py-2.5">%</th>
            <th className="px-3 py-2.5"></th>
          </tr></thead>
          <tbody>
            {data.issues.map((i) => (
              <tr key={i.key} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2.5 font-medium text-slate-800">{i.label}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{numberFmt(i.count)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{numberFmt(i.of)}</td>
                <td className="px-3 py-2.5"><PercentBar pct={i.pct} tone={i.pct > 0.5 ? 'rose' : i.pct > 0.2 ? 'amber' : 'blue'} /></td>
                <td className="px-3 py-2.5 text-right">
                  {i.drilldown && i.count > 0 && (
                    <button type="button"
                      onClick={() => setPop({ path: `/data-quality/${i.key}/population`, title: i.label })}
                      className="text-[12px] font-semibold text-blue-600 hover:underline">ver lista</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PopulationDrawer path={pop?.path ?? null} title={pop?.title ?? ''} onClose={() => setPop(null)}
        onOpenUser={setOpenUser} onOpenPet={setOpenPet} />
      <UserDetailDrawer userId={openUser} onClose={() => setOpenUser(null)} onOpenPet={setOpenPet} />
      <PetDetailDrawer petId={openPet} onClose={() => setOpenPet(null)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  RETENTION
// ═══════════════════════════════════════════════════════════════════════════

export function RetentionSection({ filter }: { filter: GlobalFilter }) {
  const { data, error, loading } = useAsync<{
    status: string; message?: string; users_with_history?: number;
    d1?: number | null; d7?: number | null; d30?: number | null; note?: string;
  }>(() => adminGet('/retention', filterParams(filter)), [JSON.stringify(filter)]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  if (data.status === 'insufficient_data') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-[13px] text-amber-800">
        <b>Dados insuficientes.</b> {data.message}
        <div className="mt-1 text-amber-700">Usuários com histórico analítico: {numberFmt(data.users_with_history)}</div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Retenção D1" value={data.d1 != null ? `${(data.d1 * 100).toFixed(1)}%` : 'insuf.'} />
        <StatCard label="Retenção D7" value={data.d7 != null ? `${(data.d7 * 100).toFixed(1)}%` : 'insuf.'} />
        <StatCard label="Retenção D30" value={data.d30 != null ? `${(data.d30 * 100).toFixed(1)}%` : 'insuf.'} />
      </div>
      <p className="text-[11px] text-slate-400">{data.note} · coorte com {numberFmt(data.users_with_history)} usuários.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  COMMERCE
// ═══════════════════════════════════════════════════════════════════════════

export function CommerceSection({ filter }: { filter: GlobalFilter }) {
  const { data, error, loading } = useAsync<{
    store_opened_users: number; offer_viewed: number; offer_viewed_users: number;
    commerce_click: number; commerce_click_users: number;
    ctr_by_exposure: number | null; ctr_by_user: number | null;
    by_merchant: { merchant: string; offer_viewed: number; commerce_click: number; ctr: number | null }[];
    sales_note: string;
  }>(() => adminGet('/commerce', filterParams(filter)), [JSON.stringify(filter)]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Abriram a Loja" value={numberFmt(data.store_opened_users)} sub="usuários únicos" />
        <StatCard label="Ofertas vistas" value={numberFmt(data.offer_viewed)} sub={`${numberFmt(data.offer_viewed_users)} usuários`} />
        <StatCard label="Cliques" value={numberFmt(data.commerce_click)} sub={`${numberFmt(data.commerce_click_users)} usuários`} />
        <StatCard label="CTR" value={data.ctr_by_exposure != null ? `${(data.ctr_by_exposure * 100).toFixed(1)}%` : '—'}
          sub={data.ctr_by_user != null ? `${(data.ctr_by_user * 100).toFixed(0)}% por usuário` : undefined} />
      </div>
      <Panel title="Por loja">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] font-bold uppercase text-slate-500">
              <th className="py-1.5">Loja</th><th className="py-1.5 text-right">Ofertas vistas</th>
              <th className="py-1.5 text-right">Cliques</th><th className="py-1.5 text-right">CTR</th>
            </tr></thead>
            <tbody>
              {data.by_merchant.map((m) => (
                <tr key={m.merchant} className="border-t border-slate-100">
                  <td className="py-1.5 font-medium">{m.merchant}</td>
                  <td className="py-1.5 text-right tabular-nums">{numberFmt(m.offer_viewed)}</td>
                  <td className="py-1.5 text-right tabular-nums">{numberFmt(m.commerce_click)}</td>
                  <td className="py-1.5 text-right tabular-nums">{m.ctr != null ? `${(m.ctr * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-600">{data.sales_note}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  GEO
// ═══════════════════════════════════════════════════════════════════════════

export function GeoSection() {
  const { data, error, loading } = useAsync<{
    source: string; coverage: { users_total: number; users_with_state: number; pct: number };
    by_state: { state: string; users: number }[];
    by_city: { city: string; state: string; users: number }[];
    map_note: string; appstore_note: string;
  }>(() => adminGet('/geo'), []);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-600">
        Fonte: {data.source}. Cobertura: {(data.coverage.pct * 100).toFixed(0)}% dos tutores têm UF ({numberFmt(data.coverage.users_with_state)}/{numberFmt(data.coverage.users_total)}).
        {' '}{data.map_note}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Tutores por UF"><BarRanking data={data.by_state.map((s) => ({ label: s.state, value: s.users }))} /></Panel>
        <Panel title="Tutores por cidade (top 50)">
          <BarRanking data={data.by_city.slice(0, 15).map((c) => ({ label: `${c.city}/${c.state || '?'}`, value: c.users }))} color="#10b981" />
        </Panel>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
        {data.appstore_note}
      </div>
    </div>
  );
}

// ── shared ────────────────────────────────────────────────────────────────

function Loading() {
  return <div className="py-16 text-center text-[13px] text-slate-400">Carregando…</div>;
}
function ErrorBox({ msg }: { msg: string | null }) {
  return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-700">{msg || 'Erro ao carregar.'}</div>;
}

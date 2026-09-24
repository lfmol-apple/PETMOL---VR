'use client';

import { useEffect, useRef, useState } from 'react';
import {
  adminGet, filterParams, type GlobalFilter,
  type FeatureMatrixResponse, type FeatureRow,
  type UsersListResponse, type DataQualityResponse,
  type DeviceType, type PetThumbnail, DEVICE_TYPE_LABEL,
  type PermissionsSummary, type PushPlatform,
} from '@/lib/admin/analyticsApi';
import { BarRanking, StatCard, PercentBar } from '@/components/admin/charts/Charts';
import { DataTable, Pagination, StatePill, fmtDateTime, type Column } from '@/components/admin/DataTable';
import { PetPhotoThumb } from '@/components/admin/PhotoLightbox';
import { UserDetailDrawer, PetDetailDrawer, PopulationDrawer } from './detail';

export const numberFmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('pt-BR') : '—');

/** Cadência do polling "ao vivo" — mesma que a aba Operação já usava sozinha
 * (OperationsSection, 20s) antes disto virar o padrão de todo painel. */
const LIVE_POLL_MS = 20000;

/**
 * `live` (padrão true) liga o polling silencioso: a cada LIVE_POLL_MS refaz
 * a busca em segundo plano — sem `loading`/flicker, sem apagar o dado
 * anterior em caso de falha transitória — e pausa quando a aba não está
 * visível (não desperdiça request com o painel em background). Passe
 * `{ live: false }` pra uma seção que não deve se atualizar sozinha (ex.:
 * algo com estado local incompatível com re-render silencioso).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts?: { live?: boolean; intervalMs?: number }) {
  const live = opts?.live ?? true;
  const intervalMs = opts?.intervalMs ?? LIVE_POLL_MS;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });

  useEffect(() => {
    let alive = true;
    const load = (silent: boolean) => {
      if (!silent) { setLoading(true); setError(null); }
      return fnRef.current()
        .then((d) => { if (!alive) return; setData(d); setUpdatedAt(Date.now()); if (silent) setError(null); })
        .catch((e) => { if (!alive) return; if (!silent) setError(String(e?.message || e)); })
        .finally(() => { if (!alive) return; if (!silent) setLoading(false); });
    };
    load(false);
    let id: ReturnType<typeof setInterval> | undefined;
    if (live) {
      id = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        load(true);
      }, intervalMs);
    }
    return () => { alive = false; if (id) clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, updatedAt };
}

export function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
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
//  USERS & PETS
// ═══════════════════════════════════════════════════════════════════════════

/** Miniaturas dos pets (32px, arredondadas) — identifica os pets do tutor sem
 * abrir o cadastro. Sem foto: ícone discreto no lugar, mesmo tamanho. */
export function PetAvatarStack({ pets, size = 32 }: { pets: PetThumbnail[]; size?: number }) {
  if (pets.length === 0) return <span className="text-[11px] text-slate-300">—</span>;
  return (
    <div className="flex items-center -space-x-2">
      {pets.map((p) => (
        <PetPhotoThumb key={p.pet_id} src={p.photo_url} alt={p.name} size={size}
          className="border-2 border-white shadow-sm" />
      ))}
    </div>
  );
}

const DEVICE_TYPE_OPTIONS: DeviceType[] = ['iphone', 'ipad', 'android', 'desktop', 'outros'];

const PUSH_PLATFORM_LABEL: Record<PushPlatform, string> = { ios: 'iPhone', android: 'Android', web: 'Navegador' };
const LOCATION_SOURCE_LABEL: Record<string, string> = { gps: 'GPS', city: 'Só a cidade', ip: 'IP aproximado' };

function PermChip({ tone, children }: { tone: 'good' | 'warn' | 'muted'; children: React.ReactNode }) {
  const cls = tone === 'good' ? 'bg-emerald-100 text-emerald-800' : tone === 'warn' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500';
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

const pctOf = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '—');

type UserFilters = {
  push: '' | 'active' | 'none'; pushPlatform: '' | PushPlatform; location: '' | 'gps' | 'city' | 'ip' | 'none';
  activity: '' | 'active' | 'recent' | 'cooling' | 'dormant' | 'no_analytics';
  hasPet: '' | 'yes' | 'no'; hasFeeding: '' | 'yes' | 'no'; emailVerified: '' | 'yes' | 'no';
};
const NO_FILTERS: UserFilters = { push: '', pushPlatform: '', location: '', activity: '', hasPet: '', hasFeeding: '', emailVerified: '' };

export function UsersSection({ filter }: { filter: GlobalFilter }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [deviceType, setDeviceType] = useState<DeviceType | ''>('');
  const [uf, setUf] = useState<UserFilters>(NO_FILTERS);
  const [sort, setSort] = useState('created_at');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [openPet, setOpenPet] = useState<string | null>(null);

  const filterKey = JSON.stringify(filter);
  const ufKey = JSON.stringify(uf);
  useEffect(() => { const t = setTimeout(() => setDebounced(search), 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [debounced, deviceType, sort, direction, filterKey, ufKey]);

  const summary = useAsync<PermissionsSummary>(() => adminGet('/permissions/summary'), []);
  const { data, error, loading } = useAsync<UsersListResponse>(
    () => adminGet('/users', {
      ...filterParams(filter), page, page_size: 50,
      search: debounced || undefined, device_type: deviceType || undefined, sort, direction,
      push: uf.push || undefined, push_platform: uf.pushPlatform || undefined, location: uf.location || undefined,
      activity: uf.activity || undefined, has_pet: uf.hasPet || undefined, has_feeding: uf.hasFeeding || undefined,
      email_verified: uf.emailVerified || undefined,
    }),
    [page, debounced, deviceType, sort, direction, filterKey, ufKey],
  );

  const setF = <K extends keyof UserFilters>(k: K, v: UserFilters[K]) => setUf((cur) => ({ ...cur, [k]: v }));
  const activeFilters = Object.values(uf).filter(Boolean).length + (deviceType ? 1 : 0) + (debounced ? 1 : 0);
  const clearAll = () => { setUf(NO_FILTERS); setDeviceType(''); setSearch(''); };
  const preset = (p: Partial<UserFilters>) => setUf({ ...NO_FILTERS, ...p });

  const onSort = (key: string) => {
    if (key === sort) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setDirection('desc'); }
  };

  const columns: Column<UsersListResponse['items'][number]>[] = [
    { key: 'email', header: 'Tutor', sortable: true, render: (r) => (
      <div><div className="font-semibold text-slate-900">{r.name || '(sem nome)'}</div>
        <div className="text-[11px] text-slate-500">{r.email}</div></div>
    ) },
    { key: 'created_at', header: 'Cadastro', sortable: true, render: (r) => fmtDateTime(r.created_at) },
    { key: 'last_activity', header: 'Última ativ.', render: (r) => (
      <div className="flex items-center gap-2"><span>{fmtDateTime(r.last_activity)}</span><StatePill state={r.activity_status} /></div>
    ) },
    { key: 'push', header: 'Notificação', render: (r) => r.push_active ? (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1"><PermChip tone="good">Ativa</PermChip>
          {r.push_platforms.map((p) => <PermChip key={p} tone="muted">{PUSH_PLATFORM_LABEL[p]}</PermChip>)}</div>
        <div className="text-[11px] text-slate-400">visto em {fmtDateTime(r.push_last_seen_at)}</div>
      </div>
    ) : <PermChip tone="warn">Sem notificação</PermChip> },
    { key: 'location', header: 'Localização', render: (r) => r.location_shared ? (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1"><PermChip tone="good">Compartilha (GPS)</PermChip>{!r.location_fresh && <PermChip tone="warn">antiga</PermChip>}</div>
        <div className="text-[11px] text-slate-400">em {fmtDateTime(r.location_updated_at)}</div>
      </div>
    ) : (
      <div className="space-y-1"><PermChip tone="warn">Não compartilha</PermChip>
        {r.location_source && <div className="text-[11px] text-slate-400">{LOCATION_SOURCE_LABEL[r.location_source] || r.location_source}</div>}</div>
    ) },
    { key: 'pets', header: 'Pets', render: (r) => (
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-slate-700">{r.pets}</span>
        <PetAvatarStack pets={r.pet_thumbnails} />
      </div>
    ) },
    { key: 'feeding', header: 'Alim.', render: (r) => r.has_feeding ? '✓' : '—' },
    { key: 'controls', header: 'Ctrl ativos', align: 'right', render: (r) => r.active_control_pets },
    { key: 'device', header: 'Dispositivo', render: (r) => (
      <div>
        <div className="font-medium text-slate-700">{r.device_type ? DEVICE_TYPE_LABEL[r.device_type] : 'Não identificado'}</div>
        <div className="text-[11px] text-slate-400">{r.app_version_label}</div>
      </div>
    ) },
    { key: 'geo', header: 'Local', render: (r) => [r.city, r.state].filter(Boolean).join(' / ') || '—' },
  ];

  const sel = 'rounded-lg border border-slate-300 px-2.5 py-2 text-[13px] text-slate-600 outline-none focus:border-blue-400';
  const s = summary.data;

  return (
    <div className="space-y-3">
      {s && (
        <div className="grid grid-cols-2 gap-2 sm:[grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          <StatCard label="Notificação ativa" tone="good" value={numberFmt(s.push.active)}
            sub={`${pctOf(s.push.active, s.total_users)} · ${numberFmt(s.push.ios)} iPhone · ${numberFmt(s.push.android)} Android · ${numberFmt(s.push.web)} web`}
            onClick={() => preset({ push: 'active' })} />
          <StatCard label="Sem notificação" tone="warn" value={numberFmt(s.push.none)} sub={pctOf(s.push.none, s.total_users)}
            onClick={() => preset({ push: 'none' })} />
          <StatCard label="Compartilham localização" tone="good" value={numberFmt(s.location.gps)}
            sub={`${numberFmt(s.location.gps_fresh)} nos últimos ${s.location.fresh_days} dias`} onClick={() => preset({ location: 'gps' })} />
          <StatCard label="Nenhum dos dois" tone="bad" value={numberFmt(s.combined.neither)}
            sub={`${pctOf(s.combined.neither, s.total_users)} · sem alerta de pet sumido`} onClick={() => preset({ push: 'none', location: 'none' })} />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail…"
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-blue-400" />
          <select aria-label="Notificação" value={uf.push} onChange={(e) => setF('push', e.target.value as UserFilters['push'])} className={sel}>
            <option value="">Notificação: todas</option><option value="active">Com notificação</option><option value="none">Sem notificação</option>
          </select>
          <select aria-label="Aparelho com aviso" value={uf.pushPlatform} onChange={(e) => setF('pushPlatform', e.target.value as UserFilters['pushPlatform'])} className={sel}>
            <option value="">Aviso em: qualquer aparelho</option><option value="ios">iPhone</option><option value="android">Android</option><option value="web">Navegador</option>
          </select>
          <select aria-label="Localização" value={uf.location} onChange={(e) => setF('location', e.target.value as UserFilters['location'])} className={sel}>
            <option value="">Localização: todas</option><option value="gps">Compartilha (GPS)</option><option value="none">Não compartilha (nada)</option>
            <option value="city">Só a cidade</option><option value="ip">IP aproximado</option>
          </select>
          <select aria-label="Atividade" value={uf.activity} onChange={(e) => setF('activity', e.target.value as UserFilters['activity'])} className={sel}>
            <option value="">Atividade: todas</option><option value="active">Ativo (até 2 dias)</option><option value="recent">Recente (até 14 dias)</option>
            <option value="cooling">Esfriando (até 45 dias)</option><option value="dormant">Adormecido</option><option value="no_analytics">Sem registro de uso</option>
          </select>
          <select aria-label="Pets" value={uf.hasPet} onChange={(e) => setF('hasPet', e.target.value as UserFilters['hasPet'])} className={sel}>
            <option value="">Pets: todos</option><option value="yes">Com pet</option><option value="no">Sem pet</option>
          </select>
          <select aria-label="Alimentação" value={uf.hasFeeding} onChange={(e) => setF('hasFeeding', e.target.value as UserFilters['hasFeeding'])} className={sel}>
            <option value="">Alimentação: todas</option><option value="yes">Com controle de ração</option><option value="no">Sem controle de ração</option>
          </select>
          <select aria-label="E-mail" value={uf.emailVerified} onChange={(e) => setF('emailVerified', e.target.value as UserFilters['emailVerified'])} className={sel}>
            <option value="">E-mail: todos</option><option value="yes">Verificado</option><option value="no">Não verificado</option>
          </select>
          <select aria-label="Dispositivo de uso" value={deviceType} onChange={(e) => setDeviceType(e.target.value as DeviceType | '')} className={sel}>
            <option value="">Todos os dispositivos</option>
            {DEVICE_TYPE_OPTIONS.map((d) => <option key={d} value={d}>{DEVICE_TYPE_LABEL[d]}</option>)}
          </select>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[12px] text-slate-500">
          {data && <span><strong className="text-slate-700">{numberFmt(data.total)}</strong> tutores</span>}
          {activeFilters > 0 && (
            <>
              <span>{activeFilters} filtro{activeFilters > 1 ? 's' : ''} ativo{activeFilters > 1 ? 's' : ''}</span>
              <button type="button" onClick={clearAll} className="font-semibold text-blue-700 underline">limpar filtros</button>
            </>
          )}
        </div>
      </div>

      {error && <ErrorBox msg={error} />}
      {loading && !data ? <Loading /> : data && (
        <>
          <DataTable columns={columns} rows={data.items} rowKey={(r) => r.user_id}
            sort={sort} direction={direction} onSort={onSort} onRowClick={(r) => setOpenUser(r.user_id)}
            empty="Nenhum tutor com esses filtros." />
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </>
      )}
      <p className="rounded-lg bg-slate-100 px-3 py-2 text-[12px] leading-relaxed text-slate-600">
        <strong>Como ler as permissões:</strong> &quot;Sem notificação&quot; junta quem nunca foi perguntado, quem negou e quem desligou depois — o servidor
        só vê que não há aparelho ativo (ele desativa sozinho o aparelho que rejeita o aviso). &quot;Compartilha&quot; é a última localização por GPS
        que o tutor enviou; se ele revogou depois, a posição antiga continua gravada (etiqueta &quot;antiga&quot;). Localização de cidade ou IP vem do
        cadastro/rede e não conta como compartilhada.
      </p>
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

export function RetentionSection({ filter, onOpenTutors }: { filter: GlobalFilter; onOpenTutors?: () => void }) {
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
      <div className="grid grid-cols-3 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <StatCard label="Retenção D1" value={data.d1 != null ? `${(data.d1 * 100).toFixed(1)}%` : 'insuf.'} onClick={onOpenTutors} />
        <StatCard label="Retenção D7" value={data.d7 != null ? `${(data.d7 * 100).toFixed(1)}%` : 'insuf.'} onClick={onOpenTutors} />
        <StatCard label="Retenção D30" value={data.d30 != null ? `${(data.d30 * 100).toFixed(1)}%` : 'insuf.'} onClick={onOpenTutors} />
      </div>
      <p className="text-[11px] text-slate-400">{data.note} · coorte com {numberFmt(data.users_with_history)} usuários.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  COMMERCE
// ═══════════════════════════════════════════════════════════════════════════

export function CommerceSection({ filter, onOpenTutors }: { filter: GlobalFilter; onOpenTutors?: () => void }) {
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
      <div className="grid grid-cols-2 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <StatCard label="Abriram a Loja" value={numberFmt(data.store_opened_users)} sub="usuários únicos" onClick={onOpenTutors} />
        <StatCard label="Ofertas vistas" value={numberFmt(data.offer_viewed)} sub={`${numberFmt(data.offer_viewed_users)} usuários`} onClick={onOpenTutors} />
        <StatCard label="Cliques" value={numberFmt(data.commerce_click)} sub={`${numberFmt(data.commerce_click_users)} usuários`} onClick={onOpenTutors} />
        <StatCard label="CTR" value={data.ctr_by_exposure != null ? `${(data.ctr_by_exposure * 100).toFixed(1)}%` : '—'}
          sub={data.ctr_by_user != null ? `${(data.ctr_by_user * 100).toFixed(0)}% por usuário` : undefined} onClick={onOpenTutors} />
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

export function Loading() {
  return <div className="py-16 text-center text-[13px] text-slate-400">Carregando…</div>;
}
export function ErrorBox({ msg }: { msg: string | null }) {
  return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-700">{msg || 'Erro ao carregar.'}</div>;
}

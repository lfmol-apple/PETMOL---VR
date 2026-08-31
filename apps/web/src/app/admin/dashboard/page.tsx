'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PremiumScreenShell } from '@/components/premium';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/hooks/useAdmin';

interface MissionControl {
  api: {
    requests: number;
    errors_5xx: number;
    p95_ms: number | null;
    status: 'normal' | 'attention' | 'critical' | 'unknown';
  };
  growth: {
    total_users: number;
    total_pets: number;
    new_users_today: number;
    new_users_7d: number;
    new_pets_today: number;
    new_pets_7d: number;
    active_users_24h: number;
    active_users_7d: number;
    active_users_30d: number;
    active_users_partial: boolean;
  };
  funnel: {
    steps: Array<{ event_name: string; label: string; count: number; pct_from_previous: number | null }>;
    biggest_drop: { from: string; to: string; drop_count: number } | null;
  };
  commerce: {
    store_opened: number;
    offer_viewed: number;
    commerce_click: number;
    ctr: number | null;
    by_merchant: Record<string, { offer_viewed: number; commerce_click: number }>;
    sales_confirmed_note: string;
    cobasi: { availability: string; latency_ms: number | null };
    shopee: { active_offers: number; stale_offers: number; stale_click_events: number; stale_after_hours: number };
  };
  platforms: {
    platforms: Array<{ platform: string; events: number }>;
    versions: Array<{ version: string; events: number }>;
  };
  instrumentation: {
    events_total: number;
    anonymous_id_storage: string;
    session_rule: string;
    gps_analytics: boolean;
    ip_geo_phase_1: boolean;
  };
  attention: {
    state: 'normal' | 'attention' | 'critical';
    alerts: Array<{ severity: 'normal' | 'attention' | 'critical'; message: string }>;
  };
}

interface ShopeeSyncProgress {
  running: boolean;
  total: number;
  processed: number;
  matched: number;
  percent: number;
  remaining: number;
  match_rate: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

function fmt(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toLocaleString('pt-BR') : 'Indisponível';
}

function pct(value: number | null | undefined): string {
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'Indisponível';
}

function statusLabel(value: string): string {
  if (value === 'critical') return 'Crítico';
  if (value === 'attention') return 'Atenção';
  if (value === 'normal') return 'Normal';
  return 'Indisponível';
}

function statusClass(value: string): string {
  if (value === 'critical') return 'border-red-200 bg-red-50 text-red-700';
  if (value === 'attention') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value === 'normal') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-50 text-slate-500';
}

function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[12px] font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
      {note && <div className="mt-1 text-[11px] font-medium text-slate-400">{note}</div>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const { isAdmin, adminData, isLoading: adminLoading } = useAdmin();
  const [mission, setMission] = useState<MissionControl | null>(null);
  const [missionLoading, setMissionLoading] = useState(true);
  const [shopeeProgress, setShopeeProgress] = useState<ShopeeSyncProgress | null>(null);
  const [shopeeProgressLoading, setShopeeProgressLoading] = useState(true);

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) {
      router.push('/home');
      return;
    }
    void loadMissionControl();
    void loadShopeeProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminLoading, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setInterval(() => {
      void loadMissionControl();
      void loadShopeeProgress();
    }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, token]);

  const loadMissionControl = async () => {
    try {
      if (!token) return;
      const response = await fetch('/api/v1/admin/mission-control', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (response.ok) setMission(await response.json());
    } catch (error) {
      console.error('Failed to load Mission Control:', error);
    } finally {
      setMissionLoading(false);
    }
  };

  const loadShopeeProgress = async () => {
    try {
      if (!token) return;
      setShopeeProgressLoading((prev) => prev && !shopeeProgress);
      const response = await fetch('/handoff/shopee-sync-progress', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (response.ok) setShopeeProgress(await response.json());
    } catch (error) {
      console.error('Failed to load Shopee sync progress:', error);
    } finally {
      setShopeeProgressLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/home');
  };

  const progressPercent = Math.min(Math.max(shopeeProgress?.percent ?? 0, 0), 100);
  const merchants = mission ? Object.entries(mission.commerce.by_merchant) : [];

  if (adminLoading || !isAdmin || !adminData) {
    return (
      <PremiumScreenShell title="PETMOL Admin" hideBack>
        <p className="py-16 text-center text-slate-500">Verificando autenticação...</p>
      </PremiumScreenShell>
    );
  }

  return (
    <PremiumScreenShell
      title="Mission Control"
      subtitle={`${adminData.email} • ${adminData.role}`}
      hideBack
      rightAction={
        <button
          onClick={handleLogout}
          className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-200"
        >
          Sair
        </button>
      }
    >
      <div className="space-y-5 px-4 py-4">
        {missionLoading && !mission ? (
          <div className="py-12 text-center text-slate-500">Carregando Mission Control...</div>
        ) : mission ? (
          <>
            <div className={`rounded-lg border px-4 py-3 ${statusClass(mission.attention.state)}`}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-black">{statusLabel(mission.attention.state)}</div>
                <button
                  type="button"
                  onClick={() => {
                    void loadMissionControl();
                    void loadShopeeProgress();
                  }}
                  className="w-fit rounded-md border border-current/20 px-3 py-1 text-xs font-bold"
                >
                  Atualizar
                </button>
              </div>
              <div className="mt-1 text-xs font-medium">
                {mission.attention.alerts[0]?.message ?? 'Nenhum alerta crítico na janela atual.'}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <MetricCard label="API" value={statusLabel(mission.api.status)} note={`5xx: ${fmt(mission.api.errors_5xx)} · p95: ${mission.api.p95_ms ? `${mission.api.p95_ms}ms` : 'indisponível'}`} />
              <MetricCard label="Usuários cadastrados" value={fmt(mission.growth.total_users)} />
              <MetricCard label="Pets cadastrados" value={fmt(mission.growth.total_pets)} />
              <MetricCard label="Eventos v2" value={fmt(mission.instrumentation.events_total)} note="coleta incremental" />
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <MetricCard label="Novos usuários hoje" value={fmt(mission.growth.new_users_today)} />
              <MetricCard label="Novos usuários 7d" value={fmt(mission.growth.new_users_7d)} />
              <MetricCard label="Novos pets hoje" value={fmt(mission.growth.new_pets_today)} />
              <MetricCard label="Novos pets 7d" value={fmt(mission.growth.new_pets_7d)} />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard label="Ativos 24h" value={fmt(mission.growth.active_users_24h)} note={mission.growth.active_users_partial ? 'parcial' : undefined} />
              <MetricCard label="Ativos 7d" value={fmt(mission.growth.active_users_7d)} note={mission.growth.active_users_partial ? 'parcial' : undefined} />
              <MetricCard label="Ativos 30d" value={fmt(mission.growth.active_users_30d)} note={mission.growth.active_users_partial ? 'parcial' : undefined} />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-black text-slate-900">Funil 7d</h2>
                <span className="text-xs font-semibold text-slate-400">
                  maior queda: {mission.funnel.biggest_drop ? `${mission.funnel.biggest_drop.from} -> ${mission.funnel.biggest_drop.to}` : 'indisponível'}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-7">
                {mission.funnel.steps.map((step) => (
                  <div key={step.event_name} className="rounded-lg bg-slate-50 p-3">
                    <div className="text-[11px] font-bold text-slate-500">{step.label}</div>
                    <div className="mt-1 text-xl font-black text-slate-900">{fmt(step.count)}</div>
                    <div className="text-[11px] font-semibold text-slate-400">{pct(step.pct_from_previous)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-base font-black text-slate-900">Commerce 7d</h2>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <MetricCard label="Loja aberta" value={fmt(mission.commerce.store_opened)} />
                  <MetricCard label="Ofertas vistas" value={fmt(mission.commerce.offer_viewed)} />
                  <MetricCard label="Comprar clicado" value={fmt(mission.commerce.commerce_click)} note="não é venda" />
                  <MetricCard label="CTR" value={pct(mission.commerce.ctr)} />
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs font-medium text-slate-500">
                  {mission.commerce.sales_confirmed_note}
                </div>
                <div className="mt-3 grid gap-2">
                  {merchants.length === 0 ? (
                    <div className="text-sm text-slate-400">Sem eventos por loja ainda.</div>
                  ) : merchants.map(([merchant, data]) => (
                    <div key={merchant} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                      <span className="font-bold capitalize text-slate-700">{merchant}</span>
                      <span className="text-slate-500">vistas {fmt(data.offer_viewed)} · cliques {fmt(data.commerce_click)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-base font-black text-slate-900">Lojas e Sync</h2>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <MetricCard label="Cobasi" value={mission.commerce.cobasi.availability === 'not_instrumented' ? 'Parcial' : 'Normal'} note="latência não instrumentada" />
                  <MetricCard label="Shopee ofertas" value={fmt(mission.commerce.shopee.active_offers)} note={`${fmt(mission.commerce.shopee.stale_offers)} stale`} />
                  <MetricCard label="Sync Shopee" value={shopeeProgressLoading ? 'Carregando' : shopeeProgress?.running ? 'Rodando' : shopeeProgress?.error ? 'Erro' : 'Parado'} note={`${progressPercent.toFixed(1)}% · ${fmt(shopeeProgress?.matched)} casados`} />
                  <MetricCard label="Índice Shopee" value={shopeeProgress?.match_rate !== undefined ? `${shopeeProgress.match_rate.toFixed(1)}%` : 'Indisponível'} />
                </div>
                {shopeeProgress?.error && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                    {shopeeProgress.error}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-base font-black text-slate-900">Plataformas 7d</h2>
                <div className="mt-3 grid gap-2">
                  {mission.platforms.platforms.length === 0 ? (
                    <div className="text-sm text-slate-400">Sem eventos de plataforma ainda.</div>
                  ) : mission.platforms.platforms.map((row) => (
                    <div key={row.platform} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-bold text-slate-700">{row.platform}</span>
                      <span className="text-slate-500">{fmt(row.events)} eventos</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-base font-black text-slate-900">Versões 7d</h2>
                <div className="mt-3 grid gap-2">
                  {mission.platforms.versions.length === 0 ? (
                    <div className="text-sm text-slate-400">Sem versão coletada ainda.</div>
                  ) : mission.platforms.versions.map((row) => (
                    <div key={row.version} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-bold text-slate-700">{row.version}</span>
                      <span className="text-slate-500">{fmt(row.events)} eventos</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs font-medium text-slate-500 shadow-sm">
              Ativos: usuários autenticados distintos com eventos v2 na janela. Sessão: {mission.instrumentation.session_rule}. Anonymous ID: {mission.instrumentation.anonymous_id_storage}. GPS analytics: desligado. IP geo Fase 1: desligado.
            </div>
          </>
        ) : (
          <div className="py-12 text-center text-slate-500">Erro ao carregar Mission Control</div>
        )}
      </div>
    </PremiumScreenShell>
  );
}

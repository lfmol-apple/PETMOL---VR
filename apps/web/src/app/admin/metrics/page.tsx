'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { PremiumScreenShell } from '@/components/premium';

interface FoodMetricsResponse {
  period: { start_date: string; end_date: string; days: number };
  totals: { alerts_sent: number; openings: number; clicks: number; purchases: number };
  by_day: Array<{ date: string; alerts_sent: number; openings: number; clicks: number; purchases: number }>;
  cycle_distribution: Array<{ bucket: 'D-3' | 'D-1' | 'D' | 'D+1+'; count: number }>;
  by_store: Array<{ store: string; count: number }>;
  by_channel: Array<{ channel: string; count: number }>;
}

function prettyStore(value: string): string {
  const map: Record<string, string> = {
    petz: 'Petz',
    cobasi: 'Cobasi',
    amazon: 'Amazon',
    petlove: 'Petlove',
    loja_fisica: 'Loja física',
    outro: 'Outro',
  };
  return map[value] ?? value;
}

function prettyChannel(value: string): string {
  if (value === 'physical') return 'Físico';
  if (value === 'online') return 'Online';
  return value;
}

export default function AdminFoodMetricsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FoodMetricsResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const adminToken = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
        const res = await fetch(`${API_BASE_URL}/metrics/food`, {
          headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as FoodMetricsResponse;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar métricas');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const conversionRate = useMemo(() => {
    if (!data) return 0;
    if (data.totals.clicks <= 0) return 0;
    return Math.round((data.totals.purchases / data.totals.clicks) * 100);
  }, [data]);

  return (
    <PremiumScreenShell title="Métricas de Ração" subtitle="Últimos 7 dias" hideBack={false}>
      <div className="px-4 py-4 space-y-5">
        {loading && <p className="text-sm text-slate-500">Carregando métricas...</p>}
        {error && <p className="text-sm text-red-600">Falha ao carregar métricas: {error}</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Alertas</p>
                <p className="text-2xl font-black text-slate-900">{data.totals.alerts_sent}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Aberturas</p>
                <p className="text-2xl font-black text-slate-900">{data.totals.openings}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Cliques</p>
                <p className="text-2xl font-black text-slate-900">{data.totals.clicks}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Compras</p>
                <p className="text-2xl font-black text-slate-900">{data.totals.purchases}</p>
                <p className="text-xs text-slate-500 mt-1">Conv. {conversionRate}%</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-900">Por dia</h2>
                <p className="text-xs text-slate-500">{data.period.start_date} até {data.period.end_date}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-4 py-2.5">Data</th>
                      <th className="text-left px-4 py-2.5">Alertas</th>
                      <th className="text-left px-4 py-2.5">Aberturas</th>
                      <th className="text-left px-4 py-2.5">Cliques</th>
                      <th className="text-left px-4 py-2.5">Compras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_day.map((row) => (
                      <tr key={row.date} className="border-t border-slate-100">
                        <td className="px-4 py-2.5">{row.date}</td>
                        <td className="px-4 py-2.5">{row.alerts_sent}</td>
                        <td className="px-4 py-2.5">{row.openings}</td>
                        <td className="px-4 py-2.5">{row.clicks}</td>
                        <td className="px-4 py-2.5">{row.purchases}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-900">Momento do ciclo</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {data.cycle_distribution.map((row) => (
                    <div key={row.bucket} className="px-4 py-2.5 flex items-center justify-between text-sm">
                      <span className="text-slate-600">{row.bucket}</span>
                      <span className="font-bold text-slate-900">{row.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-900">Por loja</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {(data.by_store.length > 0 ? data.by_store : [{ store: 'sem_dados', count: 0 }]).map((row) => (
                    <div key={row.store} className="px-4 py-2.5 flex items-center justify-between text-sm">
                      <span className="text-slate-600">{prettyStore(row.store)}</span>
                      <span className="font-bold text-slate-900">{row.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-900">Canal</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {(data.by_channel.length > 0 ? data.by_channel : [{ channel: 'online', count: 0 }]).map((row) => (
                    <div key={row.channel} className="px-4 py-2.5 flex items-center justify-between text-sm">
                      <span className="text-slate-600">{prettyChannel(row.channel)}</span>
                      <span className="font-bold text-slate-900">{row.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </PremiumScreenShell>
  );
}

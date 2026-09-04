'use client';

import { useEffect, useState } from 'react';
import { getToken } from '@/lib/auth-token';
import { StatCard } from '@/components/admin/charts/Charts';

interface MC {
  api: { requests: number; errors_5xx: number; p95_ms: number | null; status: string };
  growth: { total_users: number; total_pets: number };
  commerce: {
    cobasi: { availability: string };
    shopee: { active_offers: number; stale_offers: number };
  };
  instrumentation: { events_total: number };
  attention: { state: string; alerts: { severity: string; message: string }[] };
}
interface ShopeeProgress {
  running: boolean; percent: number; matched: number; match_rate: number; error: string | null;
}

const numberFmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('pt-BR') : '—');

/** Operação — saúde da API + sync Shopee. Atualiza a cada 20s (só esta aba). */
export function OperationsSection() {
  const [mc, setMc] = useState<MC | null>(null);
  const [sp, setSp] = useState<ShopeeProgress | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const load = async () => {
      try {
        const [a, b] = await Promise.all([
          fetch('/api/v1/admin/mission-control', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
          fetch('/handoff/shopee-sync-progress', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
        ]);
        if (a.ok) setMc(await a.json());
        if (b.ok) setSp(await b.json());
        setErr(null);
      } catch (e) {
        setErr(String(e));
      }
    };
    void load();
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, []);

  if (err) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-700">{err}</div>;
  if (!mc) return <div className="py-16 text-center text-[13px] text-slate-400">Carregando…</div>;

  const tone = mc.attention.state === 'critical' ? 'bad' : mc.attention.state === 'attention' ? 'warn' : 'good';

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-3 text-[13px] ${
        tone === 'bad' ? 'border-rose-200 bg-rose-50 text-rose-700'
          : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
        <b>{mc.attention.state === 'critical' ? 'Crítico' : mc.attention.state === 'attention' ? 'Atenção' : 'Normal'}</b>
        {' — '}{mc.attention.alerts[0]?.message ?? 'Nenhum alerta na janela.'}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="API (60min)" value={mc.api.status === 'normal' ? 'Normal' : mc.api.status === 'attention' ? 'Atenção' : 'Sem dados'}
          sub={`${numberFmt(mc.api.requests)} req · ${mc.api.errors_5xx} 5xx · p95 ${mc.api.p95_ms ? `${mc.api.p95_ms}ms` : '—'}`} />
        <StatCard label="Eventos v2 (total)" value={numberFmt(mc.instrumentation.events_total)} />
        <StatCard label="Shopee — ofertas ativas" value={numberFmt(mc.commerce.shopee.active_offers)}
          sub={`${numberFmt(mc.commerce.shopee.stale_offers)} defasadas`} />
        <StatCard label="Sync Shopee" value={sp ? (sp.running ? `${sp.percent.toFixed(0)}%` : sp.error ? 'Erro' : 'Parado') : '—'}
          sub={sp ? `${numberFmt(sp.matched)} casados · índice ${sp.match_rate?.toFixed(1) ?? '—'}%` : undefined}
          tone={sp?.error ? 'bad' : 'default'} />
      </div>
      {sp?.error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{sp.error}</div>}
      <a href="/admin/shopee-coverage" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:border-blue-300">
        📋 Cobertura Shopee × Cobasi — produtos sem oferta Shopee, motivo e normalização manual →
      </a>
      <p className="text-[11px] text-slate-400">
        Esta aba atualiza a cada 20s. As demais abas (BI histórico) só recarregam quando você troca o filtro.
      </p>
    </div>
  );
}

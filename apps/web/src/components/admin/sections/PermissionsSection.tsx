'use client';

/**
 * Permissões — tela dedicada a "quantos tutores têm push ativo e
 * compartilham localização", no mesmo molde da aba Downloads (cards grandes
 * de hoje + evolução no tempo). Consome os mesmos endpoints que já existiam
 * espalhados em Tutores e Pets (/permissions/summary ao vivo e
 * /permissions/history, com fotografias diárias desde 24/09/2026) — só
 * reorganiza num painel próprio, mais visível.
 */
import { adminGet, type PermissionsSummary } from '@/lib/admin/analyticsApi';
import { useAsync, Loading, ErrorBox, numberFmt } from './sections';
import { PermissionsHistory } from './PermissionsHistory';

export function PermissionsSection() {
  const { data, error, loading } = useAsync<PermissionsSummary>(() => adminGet('/permissions/summary'), []);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox msg={error} />;

  const pct = (n: number) => data.total_users ? `${Math.round((n / data.total_users) * 100)}%` : '—';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tutores cadastrados</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-800 tabular-nums">{numberFmt(data.total_users)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Com push ativo</p>
          <p className="mt-1 text-3xl font-extrabold text-emerald-600 tabular-nums">
            {numberFmt(data.push.active)} <span className="text-base font-bold text-slate-400">({pct(data.push.active)})</span>
          </p>
          <div className="mt-2 flex gap-4 text-[12px] text-slate-500">
            <span>🍎 iPhone: <b className="text-slate-700">{numberFmt(data.push.ios)}</b></span>
            <span>🤖 Android: <b className="text-slate-700">{numberFmt(data.push.android)}</b></span>
            <span>🌐 Web: <b className="text-slate-700">{numberFmt(data.push.web)}</b></span>
          </div>
          <p className="mt-2 text-[12px] font-semibold text-rose-600">{numberFmt(data.push.none)} sem nenhum push ({pct(data.push.none)})</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Compartilham localização</p>
          <p className="mt-1 text-3xl font-extrabold text-[#0056D2] tabular-nums">
            {numberFmt(data.location.gps)} <span className="text-base font-bold text-slate-400">({pct(data.location.gps)})</span>
          </p>
          <p className="mt-2 text-[12px] text-slate-500">{numberFmt(data.location.gps_fresh)} atualizadas nos últimos {data.location.fresh_days} dias</p>
          <p className="mt-2 text-[12px] font-semibold text-rose-600">{numberFmt(data.location.none)} sem compartilhar ({pct(data.location.none)})</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-center">
          <p className="text-[11px] font-bold uppercase text-emerald-700">Os dois</p>
          <p className="text-xl font-extrabold text-emerald-700 tabular-nums">{numberFmt(data.combined.both)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
          <p className="text-[11px] font-bold uppercase text-slate-500">Só push</p>
          <p className="text-xl font-extrabold text-slate-700 tabular-nums">{numberFmt(data.combined.only_push)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
          <p className="text-[11px] font-bold uppercase text-slate-500">Só localização</p>
          <p className="text-xl font-extrabold text-slate-700 tabular-nums">{numberFmt(data.combined.only_location)}</p>
        </div>
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-center">
          <p className="text-[11px] font-bold uppercase text-rose-700">Nenhum dos dois</p>
          <p className="text-xl font-extrabold text-rose-700 tabular-nums">{numberFmt(data.combined.neither)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Possíveis desinstalações (proxy aproximado)</p>
        <div className="mt-1 flex items-baseline gap-6">
          <span className="text-2xl font-extrabold text-amber-800 tabular-nums">{numberFmt(data.uninstalls_proxy.today)} <span className="text-[13px] font-bold text-amber-600">hoje</span></span>
          <span className="text-2xl font-extrabold text-amber-800 tabular-nums">{numberFmt(data.uninstalls_proxy.since_tracking)} <span className="text-[13px] font-bold text-amber-600">desde que começamos a medir</span></span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-amber-800/80">{data.uninstalls_proxy.note}</p>
      </div>

      <PermissionsHistory />

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-600">
        Fotografias diárias desde 24/09/2026 (1ª vez que esse controle foi ligado) — não é um robô que roda
        sozinho todo dia, grava quando alguém abre este painel depois de 20h da última foto, ou ao clicar em
        &quot;Gravar agora&quot;. Pode haver dias sem foto se o painel não foi aberto naquele dia.
      </p>
    </div>
  );
}

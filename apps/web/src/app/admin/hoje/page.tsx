'use client';

/**
 * Hoje — a tela simples. Três perguntas, uma resposta cada:
 *   1. Como estamos na meta?   2. O que aconteceu hoje?   3. O que eu faço agora?
 * Tudo em linguagem comum, sem filtros. Os painéis completos continuam um toque abaixo.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PremiumScreenShell } from '@/components/premium';
import { useAdmin } from '@/hooks/useAdmin';
import { adminGet } from '@/lib/admin/analyticsApi';
import { getToken } from '@/lib/auth-token';
import type { CampaignsPanelSummary, GrowthResponse } from '@/lib/admin/growthApi';
import { pct, type GrowthPlatformRow } from '@/lib/admin/growthApi';
import { useAsync, Loading, ErrorBox, numberFmt } from '@/components/admin/sections/sections';
import { spStartOfToday, spYesterdayRange } from '@/lib/analytics/spTime';

interface Insights {
  goal: { total: number; complete: number; pct: number | null };
  recommendations: { title: string; evidence: string; action: string; confidence: string }[];
}

const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';

export default function HojePage() {
  const router = useRouter();
  const { isAdmin, adminData, isLoading } = useAdmin();
  useEffect(() => { if (!isLoading && !isAdmin) router.push('/home'); }, [isLoading, isAdmin, router]);

  const week = useAsync<GrowthResponse>(() => adminGet('/growth', { period_days: 7 }), [], { intervalMs: 60000 });
  const today = useAsync<GrowthResponse>(
    () => adminGet('/growth', { since: spStartOfToday(new Date()).toISOString() }), [], { intervalMs: 60000 });
  // Ontem, o dia INTEIRO (pedido do dono): hoje ainda está em andamento, ontem já fechou.
  const yesterday = useAsync<GrowthResponse>(() => {
    const { start, end } = spYesterdayRange(new Date());
    return adminGet('/growth', { since: start.toISOString(), until: end.toISOString() });
  }, [], { intervalMs: 300000 });
  const insights = useAsync<Insights>(() => adminGet('/insights'), [], { intervalMs: 300000 });
  const campaigns = useAsync<CampaignsPanelSummary>(async () => {
    const res = await fetch('/api/v1/admin/campaigns/panel/summary', {
      headers: { Authorization: `Bearer ${getToken()}` }, cache: 'no-store' });
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    return res.json();
  }, [], { intervalMs: 30000 });

  if (isLoading || !isAdmin || !adminData) {
    return <PremiumScreenShell title="Hoje" hideBack wide><p className="py-16 text-center text-slate-500">Verificando…</p></PremiumScreenShell>;
  }

  const a = week.data?.activation;
  const step = (g: GrowthResponse | null, key: string) => g?.steps.find((s) => s.key === key)?.n ?? 0;
  const todayData = today.data;
  const yesterdayData = yesterday.data;

  return (
    <PremiumScreenShell title="Hoje" subtitle="O essencial, sem filtros" hideBack wide
      rightAction={<Link href="/admin/dashboard2" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600">Painel completo</Link>}>
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">

        {/* 1 — Como estamos */}
        <section className={card}>
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#0056D2]">1 · Como estamos</p>
          {week.loading && !a ? <Loading /> : week.error || !a ? <ErrorBox msg={week.error} /> : (
            <>
              <p className="mt-2 text-[44px] font-extrabold leading-none text-slate-900">{pct(a.complete_pct)}</p>
              <p className="mt-2 text-[15px] text-slate-700">
                das pessoas que se cadastraram nos últimos 7 dias já têm <strong>pet, ração, notificação e localização</strong>.
                São {numberFmt(a.complete)} de {numberFmt(a.total)}.
              </p>
              <ul className="mt-4 space-y-2">
                {a.items.map((i) => (
                  <li key={i.key} className="flex items-center gap-3 text-[14px]">
                    <span className="w-44 shrink-0 text-slate-700">{i.label}</span>
                    <span className="h-3 flex-1 rounded-full bg-slate-100">
                      <span className={`block h-3 rounded-full ${i.key === a.weakest ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min((i.pct ?? 0) * 100, 100)}%` }} />
                    </span>
                    <span className="w-12 shrink-0 text-right font-bold text-slate-900">{pct(i.pct)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] text-slate-500">A barra laranja é a que mais precisa de atenção.</p>
            </>
          )}
        </section>

        {/* 2 — Hoje */}
        <section className={card}>
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#0056D2]">2 · O que aconteceu hoje</p>
          {today.loading && !todayData ? <Loading /> : today.error || !todayData ? <ErrorBox msg={today.error} /> : (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[['1ª abertura do app', 'downloads'], ['Se cadastraram', 'cadastros'],
                ['Cadastraram o pet', 'pet'], ['Cadastraram a ração', 'feeding']].map(([label, key]) => {
                const now = step(todayData, key);
                const before = yesterdayData ? step(yesterdayData, key) : null;
                return (
                  <div key={key} className="rounded-xl bg-slate-50 p-3 text-center">
                    <p className="text-[26px] font-extrabold text-slate-900">{numberFmt(now)}</p>
                    <p className="text-[12px] text-slate-500">{label}</p>
                    <Compare now={now} before={before} />
                  </div>
                );
              })}
            </div>
          )}
          {todayData && <DeviceBreakdown rows={todayData.platforms} before={yesterdayData?.platforms ?? null} />}
          <p className="mt-3 text-[11px] text-slate-400">Ontem é o dia inteiro; hoje ainda está em andamento, então o número de hoje continua subindo.</p>
        </section>

        {/* 3 — O que fazer */}
        <section className={card}>
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#0056D2]">3 · O que fazer agora</p>
          {insights.loading && !insights.data ? <Loading /> : insights.error || !insights.data ? <ErrorBox msg={insights.error} /> : (
            <ol className="mt-3 space-y-4">
              {insights.data.recommendations.slice(0, 3).map((r, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0056D2] text-[13px] font-extrabold text-white">{i + 1}</span>
                  <div>
                    <p className="text-[15px] font-bold text-slate-900">{r.title}</p>
                    <p className="text-[13px] text-slate-600">{r.evidence}</p>
                    <p className="mt-1 text-[13px] font-semibold text-[#0056D2]">→ {r.action}</p>
                  </div>
                </li>
              ))}
              {insights.data.recommendations.length === 0 && <li className="text-[14px] text-slate-500">Nada urgente hoje.</li>}
            </ol>
          )}
        </section>

        {/* 4 — Mensagens */}
        <section className={card}>
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#0056D2]">4 · Mensagens aos tutores</p>
          {campaigns.loading && !campaigns.data ? <Loading /> : campaigns.error || !campaigns.data ? <ErrorBox msg={campaigns.error} /> : (
            <>
              <p className="mt-2 text-[15px] text-slate-700">
                <strong>{numberFmt(campaigns.data.food.eligible)}</strong> pessoas ainda não cadastraram a ração e podem receber o lembrete.
                {' '}O piloto automático está <strong>{campaigns.data.autopilot.enabled ? 'ligado' : 'desligado'}</strong>
                {' '}(no máximo 1 mensagem por pessoa por semana).
              </p>
              <p className="mt-1 text-[13px] text-slate-500">
                Enviadas nas últimas 24h: {numberFmt(Object.values(campaigns.data.autopilot.last24h).reduce((x, y) => x + y, 0))}.
              </p>
              <Link href="/admin/dashboard2#campanhas" className="mt-3 inline-block rounded-lg bg-[#0056D2] px-4 py-2 text-[13px] font-bold text-white">
                Ver e enviar
              </Link>
            </>
          )}
        </section>

        <p className="px-1 text-center text-[11px] text-slate-400">
          Atualiza sozinha. Quer mais detalhe? <Link href="/admin/dashboard2" className="underline">Painel completo</Link> ·{' '}
          <Link href="/admin/dashboard" className="underline">Mission Control</Link>
        </p>
      </div>
    </PremiumScreenShell>
  );
}

/** Hoje, por aparelho: iPhone, Android e "Outros" (app instalado pela tela de início e navegador). */
function DeviceBreakdown({ rows, before }: { rows: GrowthPlatformRow[]; before: GrowthPlatformRow[] | null }) {
  const pick = (list: GrowthPlatformRow[] | null, keys: GrowthPlatformRow['platform'][], field: 'downloads' | 'cadastros') =>
    list ? keys.reduce((total, k) => total + (list.find((r) => r.platform === k)?.[field] ?? 0), 0) : null;
  const lines: { label: string; keys: GrowthPlatformRow['platform'][] }[] = [
    { label: 'iPhone', keys: ['ios'] },
    { label: 'Android', keys: ['android'] },
    { label: 'Outros (navegador e app da tela de início)', keys: ['pwa', 'web'] },
  ];
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <p className="mb-2 text-[12px] font-bold text-slate-500">Por aparelho · hoje (ontem, dia inteiro, entre parênteses)</p>
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
            <th className="py-1 font-semibold">Aparelho</th>
            <th className="py-1 text-right font-semibold">1ª abertura</th>
            <th className="py-1 text-right font-semibold">Se cadastraram</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className="border-t border-slate-100">
              <td className="py-1.5 text-slate-700">{l.label}</td>
              {(['downloads', 'cadastros'] as const).map((f) => {
                const prev = pick(before, l.keys, f);
                return (
                  <td key={f} className="py-1.5 text-right">
                    <span className="font-bold text-slate-900">{numberFmt(pick(rows, l.keys, f) ?? 0)}</span>
                    {prev != null && <span className="ml-1 text-[12px] text-slate-400">({numberFmt(prev)})</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Hoje contra o dia inteiro de ontem: seta e diferença, verde quando sobe, vermelho quando cai. */
function Compare({ now, before }: { now: number; before: number | null }) {
  if (before == null) return <p className="mt-1 text-[11px] text-slate-300">comparando…</p>;
  const diff = now - before;
  const tone = diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-400';
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '=';
  return (
    <p className={`mt-1 text-[12px] font-semibold ${tone}`}>
      {arrow} {diff === 0 ? 'igual a ontem' : `${diff > 0 ? '+' : ''}${diff} vs ontem`}
      <span className="font-normal text-slate-400"> (ontem {numberFmt(before)})</span>
    </p>
  );
}

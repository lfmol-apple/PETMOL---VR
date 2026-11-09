'use client';

/** Campanhas automáticas e acompanhamento (vindos do Dashboard 2): piloto automático e "Ração: funcionou?". */
import { useState } from 'react';
import { getToken } from '@/lib/auth-token';
import { Card, panelFetch } from '@/components/admin/AdminUi';
import { pct, type CampaignsPanelSummary, type CampaignState, type FoodCampaignResults } from '@/lib/admin/growthApi';
import { useAsync, Loading, ErrorBox, numberFmt } from '@/components/admin/sections/sections';

export function CampaignsPanel() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useAsync<CampaignsPanelSummary>(
    () => panelFetch('/summary'), [refresh], { intervalMs: 8000 });
  const [confirm, setConfirm] = useState<'food' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setMsg(null);
    try { await fn(); setRefresh((n) => n + 1); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Não foi possível.'); }
    finally { setBusy(false); setConfirm(null); }
  };
  const run = (which: 'food', dry: boolean) =>
    act(() => panelFetch(`/${which}/run`, { method: 'POST', body: JSON.stringify({ dry_run: dry }) }));
  const toggle = (enabled: boolean) =>
    act(() => panelFetch('/autopilot', { method: 'POST', body: JSON.stringify({ enabled }) }));

  const stateLine = (st: CampaignState) => {
    if (st.phase === 'running') {
      const prog = st.result && typeof st.result.progress === 'string' ? ` (${st.result.progress})` : '';
      return <span className="font-semibold text-amber-700">Enviando{prog}…</span>;
    }
    if (st.phase === 'error') return <span className="font-semibold text-rose-600">Erro: {st.error}</span>;
    if (st.phase === 'done' && st.result) {
      const r = st.result;
      return <span className="text-slate-600">
        {r.dry_run ? 'Ensaio (nada enviado): ' : 'Concluído: '}
        {typeof r.total === 'number' ? `${numberFmt(r.total)} pessoas` : ''}
        {typeof r.sent_push === 'number' ? ` · ${numberFmt(r.sent_push)} push` : ''}
      </span>;
    }
    return <span className="text-slate-400">Parada</span>;
  };

  const rows: { key: 'food'; title: string; what: string; n: number; detail: string; st: CampaignState }[] = data ? [
    { key: 'food', title: 'Ração', what: 'Tem pet, não cadastrou a ração e tem aviso (push) ativo. Só push.',
      n: data.food.eligible, detail: `${numberFmt(data.food.skipped_recent)} já receberam há menos de 7 dias`, st: data.food.state },
  ] : [];

  return (
    <div id="campanhas"><Card title="Campanhas de ativação"
      subtitle="Disparar e acompanhar com o seu login. Cada pessoa recebe no máximo 1 mensagem por semana e quem pediu para parar nunca entra.">
      {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
            <div>
              <p className="text-[13px] font-bold text-slate-800">
                Piloto automático: {data.autopilot.enabled ? <span className="text-emerald-600">ligado</span> : <span className="text-rose-600">desligado</span>}
              </p>
              <p className="text-[12px] text-slate-500">
                Todo dia às 11h (10h–19h), até {data.autopilot.daily_cap} push por dia.
                Últimas 24h: {numberFmt(Object.values(data.autopilot.last24h).reduce((a, b) => a + b, 0))} enviadas · {numberFmt(data.autopilot.opted_out)} pediram para parar.
              </p>
            </div>
            <button type="button" disabled={busy} onClick={() => toggle(!data.autopilot.enabled)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${data.autopilot.enabled ? 'border border-rose-300 text-rose-700' : 'bg-emerald-600 text-white'}`}>
              {data.autopilot.enabled ? 'Pausar' : 'Ligar'}
            </button>
          </div>

          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.key} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-xl">
                    <p className="text-[14px] font-extrabold text-slate-800">{r.title} <span className="font-medium text-slate-500">— {numberFmt(r.n)} receberiam agora</span></p>
                    <p className="text-[12px] text-slate-500">{r.what}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{r.detail}</p>
                    <p className="mt-1 text-[12px]">{stateLine(r.st)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={busy || r.st.phase === 'running'} onClick={() => run(r.key, true)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Ensaio</button>
                    <button type="button" disabled={busy || r.st.phase === 'running' || r.n === 0} onClick={() => setConfirm(r.key)}
                      className="rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">Enviar agora</button>
                  </div>
                </div>
                {confirm === r.key && (
                  <div className="mt-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">
                    <p><strong>Enviar para {numberFmt(r.n)} pessoas agora?</strong> O push sai na hora. Não dá para desfazer.</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" disabled={busy} onClick={() => run(r.key, false)} className="rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12px] font-bold text-white">Sim, enviar</button>
                      <button type="button" onClick={() => setConfirm(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600">Cancelar</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {msg && <p className="mt-3 text-[12px] font-semibold text-rose-600">{msg}</p>}
        </>
      )}
    </Card></div>
  );
}

export function FoodCampaignCard() {
  const { data, error, loading } = useAsync<FoodCampaignResults>(async () => {
    const res = await fetch('/api/v1/admin/campaigns/food-activation/results', {
      headers: { Authorization: `Bearer ${getToken()}` }, cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    return res.json();
  }, [], { intervalMs: 60000 });

  const max = Math.max(1, ...(data?.series.map((p) => p.first_feeding) ?? [1]));
  const sendDay = data?.first_sent_at?.slice(0, 10);
  return (
    <Card title="Campanha de ração: funcionou?"
      subtitle="De quem recebeu o push de Alimentação, quantos cadastraram a ração depois.">
      {loading && !data ? <Loading /> : error || !data ? <ErrorBox msg={error} /> : !data.first_sent_at ? (
        <p className="text-[13px] text-slate-500">Nenhum envio registrado ainda. Os números aparecem depois do primeiro disparo.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Receberam</p>
              <p className="text-[24px] font-extrabold text-slate-900">{numberFmt(data.contacted.total)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Cadastraram em {data.window_days} dias</p>
              <p className="text-[24px] font-extrabold text-slate-900">
                {numberFmt(data.contacted.converted_window)} <span className="text-[14px] font-semibold text-slate-400">({pct(data.contacted.rate_window)})</span>
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Têm ração hoje</p>
              <p className="text-[24px] font-extrabold text-slate-900">{numberFmt(data.contacted.converted_total)}</p>
            </div>
          </div>

          {data.holdout.total > 0 && (
            <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-[13px] text-blue-900">
              <strong>Contra quem não recebeu</strong> ({numberFmt(data.holdout.total)} pessoas de controle): {pct(data.contacted.rate_window)} contra{' '}
              {pct(data.holdout.rate_window)}. Diferença: {data.lift_vs_holdout == null ? '—' : `${data.lift_vs_holdout > 0 ? '+' : ''}${(data.lift_vs_holdout * 100).toFixed(1)} pontos`}.
            </p>
          )}

          <p className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Primeira ração cadastrada por dia — média {data.daily_avg_before ?? '—'} antes do envio, {data.daily_avg_after ?? '—'} depois
          </p>
          <div className="flex h-24 items-end gap-px" role="img" aria-label="Primeira ração cadastrada por dia">
            {data.series.map((p) => (
              <div key={p.date} title={`${p.date}: ${p.first_feeding}`} className="flex-1 rounded-t-sm"
                style={{ height: `${(p.first_feeding / max) * 100}%`, minHeight: p.first_feeding ? 2 : 0,
                  background: sendDay && p.date >= sendDay ? '#059669' : '#94A3B8' }} />
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Cinza: antes do envio. Verde: depois.</p>
          <ul className="mt-3 space-y-1 text-[11px] text-slate-500">{data.notes.map((n) => <li key={n}>• {n}</li>)}</ul>
        </>
      )}
    </Card>
  );
}

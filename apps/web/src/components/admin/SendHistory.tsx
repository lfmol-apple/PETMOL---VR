'use client';

/**
 * "Envios e resultado (24h depois de cada envio)". Os 5 envios mais recentes ficam abertos; os demais ficam recolhidos (um toque abre).
 * Para limpar a lista depois de vários testes: OCULTAR por data do calendário (reversível, nada é apagado, cota semanal e métricas intactas)
 * ou EXCLUIR só testes avulsos antigos (nunca envio real nem lote de campanha), sempre com contagem prévia e confirmação.
 */
import { useState } from 'react';
import { getToken } from '@/lib/auth-token';
import { DateField } from '@/components/ui/DateField';
import { useAsync, Loading, ErrorBox, numberFmt } from '@/components/admin/sections/sections';

const API = '/api/v1/admin/broadcast';
export const OPEN_FIRST = 5;

interface Metrics { delivered: number; tapped: number; opened: number; acted: number; goal_hit: number | null; goal_label: string | null; window_closed: boolean }
export interface HistoryItem {
  id: string; created_at: string; message: string; segment: string; audience_kind: 'all' | 'count' | 'test';
  audience_requested: number | null; goal: string | null; recipients_total: number; delivered_total: number;
  phase: 'sending' | 'done' | 'error'; metrics: Metrics; product?: { title: string; url: string } | null; hidden?: boolean; campaign_id?: string | null;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Erro ${res.status}`);
  return data as T;
}

const pctOf = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '–');
const audienceLabel = (h: HistoryItem) =>
  h.audience_kind === 'test' ? 'teste (contas de admin)' : h.audience_kind === 'count' ? `${numberFmt(h.audience_requested ?? 0)} sorteadas` : 'todos';
const statusText = (h: HistoryItem) => (h.phase === 'sending' ? 'enviando…' : h.phase === 'error' ? 'erro no envio' : `${numberFmt(h.delivered_total)} de ${numberFmt(h.recipients_total)} entregues`);
const todayBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

function Details({ h, onToggleHidden, busy }: { h: HistoryItem; onToggleHidden: (h: HistoryItem) => void; busy: boolean }) {
  const m = h.metrics;
  const rows: [string, number][] = [['Receberam', m.delivered], ['Tocaram na notificação', m.tapped], ['Abriram o app', m.opened], ['Fizeram algo no app', m.acted]];
  return (
    <>
      <p className="text-[11px] text-slate-500">
        {new Date(h.created_at).toLocaleString('pt-BR')} · {audienceLabel(h)} · {statusText(h)}
        {m.goal_label ? ` · meta: ${m.goal_label}` : ''}{!m.window_closed ? ' · ainda contando' : ''}
      </p>
      {h.product && <p className="text-[12px] text-slate-600">Produto: {h.product.title}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {rows.map(([t, n]) => (
          <div key={t} className="rounded-lg bg-slate-50 p-2 text-center">
            <p className="text-[18px] font-extrabold text-slate-900">{numberFmt(n)}</p>
            <p className="text-[10px] text-slate-500">{t}{t !== 'Receberam' ? ` · ${pctOf(n, m.delivered)}` : ''}</p>
          </div>
        ))}
        {m.goal_label && m.goal_hit !== null && (
          <div className="rounded-lg bg-emerald-50 p-2 text-center">
            <p className="text-[18px] font-extrabold text-emerald-700">{numberFmt(m.goal_hit)}</p>
            <p className="text-[10px] text-emerald-700">Meta atingida · {pctOf(m.goal_hit, m.delivered)}</p>
          </div>
        )}
      </div>
      {h.phase !== 'sending' && (
        <button type="button" disabled={busy} onClick={() => onToggleHidden(h)} className="mt-2 text-[12px] font-semibold text-slate-600 underline disabled:opacity-40">
          {h.hidden ? 'Reexibir este envio' : 'Ocultar este envio'}
        </button>
      )}
    </>
  );
}

type Plan = { kind: 'hide' | 'delete'; before: string; onlyTests: boolean; count: number } | null;

export function SendHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const [showHidden, setShowHidden] = useState(false);
  const [bump, setBump] = useState(0);
  const history = useAsync<{ items: HistoryItem[]; hidden_count?: number }>(() => call(`/history?limit=200&include_hidden=${showHidden}`), [refreshKey, bump, showHidden], { intervalMs: 20000 });
  const [date, setDate] = useState('');
  const [onlyTests, setOnlyTests] = useState(false);
  const [delDate, setDelDate] = useState('');
  const [plan, setPlan] = useState<Plan>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const toggleOne = (h: HistoryItem) => run(async () => {
    await call(`/history/${h.id}/${h.hidden ? 'unhide' : 'hide'}`, {});
    setBump((x) => x + 1);
  });
  const preview = (kind: 'hide' | 'delete') => run(async () => {
    const before = kind === 'hide' ? date : delDate;
    if (!before) throw new Error('Escolha a data no calendário.');
    const r = kind === 'hide'
      ? await call<{ would_hide: number }>('/history/hide', { before, only_tests: onlyTests })
      : await call<{ would_delete: number }>('/history/delete-tests', { before });
    setPlan({ kind, before, onlyTests: kind === 'hide' && onlyTests, count: 'would_hide' in r ? r.would_hide : r.would_delete }); setTyped('');
  });
  const confirm = () => run(async () => {
    if (!plan) return;
    if (plan.kind === 'hide') {
      await call('/history/hide', { before: plan.before, only_tests: plan.onlyTests, confirm_count: plan.count });
      setMsg(`${plan.count} envio(s) ocultado(s). Nada foi apagado: dá para reexibir.`);
    } else {
      await call('/history/delete-tests', { before: plan.before, confirm_count: plan.count });
      setMsg(`${plan.count} teste(s) excluído(s) definitivamente.`);
    }
    setPlan(null); setBump((x) => x + 1);
  });
  const unhideAll = () => run(async () => { const r = await call<{ unhidden: number }>('/history/unhide-all', {}); setMsg(`${r.unhidden} envio(s) reexibido(s).`); setBump((x) => x + 1); });

  const items = history.data?.items ?? [];
  const hiddenCount = history.data?.hidden_count ?? 0;
  const first = items.slice(0, OPEN_FIRST);
  const rest = items.slice(OPEN_FIRST);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Envios e resultado (24h depois de cada envio)</p>
        {hiddenCount > 0 && (
          <button type="button" aria-pressed={showHidden} onClick={() => setShowHidden((v) => !v)} className="text-[12px] font-semibold text-slate-600 underline">
            {showHidden ? 'Esconder os ocultos' : `Mostrar ocultos (${hiddenCount})`}
          </button>
        )}
      </div>

      <details className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-[13px] font-bold text-slate-800">Organizar a lista (ocultar ou excluir testes antigos)</summary>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-[12.5px] font-bold text-slate-800">Ocultar por data <span className="font-normal text-slate-500">(reversível: nada é apagado)</span></p>
            <div className="mt-1.5 flex flex-wrap items-end gap-2">
              <div className="text-[12px] text-slate-600">
                <label htmlFor="hist-ocultar-data" className="mr-1.5">Ocultar envios anteriores a</label>
                <DateField id="hist-ocultar-data" className="inline-block w-44" inputClassName="w-full rounded-lg border border-slate-300 bg-white py-1 pl-2 pr-8 text-[13px]" max={todayBR()} value={date} onChange={(v) => { setDate(v); setPlan(null); }} />
              </div>
              <label className="flex items-center gap-1.5 text-[12px] text-slate-600"><input type="checkbox" checked={onlyTests} onChange={(e) => { setOnlyTests(e.target.checked); setPlan(null); }} /> só testes (“só eu”)</label>
              <button type="button" disabled={busy || !date} onClick={() => preview('hide')} className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-800 disabled:opacity-40">Ver quantos</button>
              {hiddenCount > 0 && <button type="button" disabled={busy} onClick={unhideAll} className="rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-slate-600 underline">Reexibir todos</button>}
            </div>
            {plan?.kind === 'hide' && (
              <div role="alertdialog" aria-label="Confirmar ocultar envios" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[12.5px] text-amber-900">
                {plan.count === 0 ? 'Nenhum envio encontrado antes dessa data.' : <>Isso vai ocultar <strong>{plan.count}</strong> envio(s) criados antes de {plan.before.split('-').reverse().join('/')}{plan.onlyTests ? ' (só testes)' : ''}. Nada é apagado; envios em andamento nunca são ocultados.</>}
                <div className="mt-2 flex gap-2">
                  {plan.count > 0 && <button type="button" disabled={busy} onClick={confirm} className="rounded-lg bg-slate-800 px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-40">Confirmar e ocultar {plan.count}</button>}
                  <button type="button" onClick={() => setPlan(null)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 underline">Cancelar</button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-3">
            <p className="text-[12.5px] font-bold text-rose-800">Excluir testes antigos <span className="font-normal text-slate-500">(definitivo; só testes “só eu” avulsos — nunca envio real nem lote de campanha)</span></p>
            <div className="mt-1.5 flex flex-wrap items-end gap-2">
              <div className="text-[12px] text-slate-600">
                <label htmlFor="hist-excluir-data" className="mr-1.5">Testes anteriores a</label>
                <DateField id="hist-excluir-data" className="inline-block w-44" inputClassName="w-full rounded-lg border border-slate-300 bg-white py-1 pl-2 pr-8 text-[13px]" max={todayBR()} value={delDate} onChange={(v) => { setDelDate(v); setPlan(null); }} />
              </div>
              <button type="button" disabled={busy || !delDate} onClick={() => preview('delete')} className="rounded-lg border border-rose-400 bg-white px-3 py-1.5 text-[12.5px] font-bold text-rose-800 disabled:opacity-40">Ver quantos testes</button>
            </div>
            {plan?.kind === 'delete' && (
              <div role="alertdialog" aria-label="Confirmar excluir testes" className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-[12.5px] text-rose-900">
                {plan.count === 0 ? 'Nenhum teste avulso encontrado antes dessa data.' : (
                  <>
                    <strong>{plan.count}</strong> teste(s) serão <strong>excluídos para sempre</strong> (com a lista de quem recebeu). Envios reais, lotes de campanha e a cota semanal não são tocados.
                    <label className="mt-2 block">Para confirmar, digite {plan.count}:
                      <input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={`Digite ${plan.count} para confirmar a exclusão`} className="ml-1.5 w-20 rounded-lg border border-rose-300 bg-white px-2 py-1 text-[13px]" />
                    </label>
                  </>
                )}
                <div className="mt-2 flex gap-2">
                  {plan.count > 0 && <button type="button" disabled={busy || typed.trim() !== String(plan.count)} onClick={confirm} className="rounded-lg bg-rose-700 px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-40">Excluir {plan.count} teste(s)</button>}
                  <button type="button" onClick={() => setPlan(null)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 underline">Cancelar</button>
                </div>
              </div>
            )}
          </div>
          {msg && <p role="status" className="text-[12.5px] font-semibold text-emerald-800">{msg}</p>}
          {err && <p role="alert" className="text-[12.5px] text-rose-800">{err}</p>}
        </div>
      </details>

      {history.loading && !history.data ? <Loading /> : history.error || !history.data ? <ErrorBox msg={history.error} /> : (
        items.length === 0 ? <p className="text-[13px] text-slate-500">{hiddenCount > 0 ? `Nenhum envio à vista (${hiddenCount} oculto${hiddenCount === 1 ? '' : 's'}).` : 'Nenhum envio ainda.'}</p> : (
          <>
            <ul className="space-y-3" aria-label="Envios mais recentes">
              {first.map((h) => (
                <li key={h.id} className={`rounded-xl border p-3 ${h.hidden ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200'}`}>
                  <p className="text-[13px] font-bold text-slate-900">{h.message}{h.hidden && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">oculto</span>}</p>
                  <Details h={h} onToggleHidden={toggleOne} busy={busy} />
                </li>
              ))}
            </ul>
            {rest.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[12px] font-semibold text-slate-500">Anteriores ({rest.length}) — toque para abrir</p>
                <ul className="space-y-1.5" aria-label="Envios anteriores">
                  {rest.map((h) => (
                    <li key={h.id}>
                      <details className={`rounded-xl border px-3 py-2 ${h.hidden ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200'}`}>
                        <summary className="cursor-pointer text-[12.5px] text-slate-800">
                          <span className="font-semibold">{h.message.length > 70 ? `${h.message.slice(0, 70)}…` : h.message}</span>
                          <span className="ml-2 text-[11px] text-slate-500">{new Date(h.created_at).toLocaleDateString('pt-BR')} · {numberFmt(h.metrics.delivered)} receberam · {numberFmt(h.metrics.tapped)} tocaram{h.hidden ? ' · oculto' : ''}</span>
                        </summary>
                        <div className="mt-2"><Details h={h} onToggleHidden={toggleOne} busy={busy} /></div>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

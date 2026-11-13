'use client';

/**
 * Passos 4–7 — contagem dinâmica, tamanho do lote, prévia e confirmação.
 * A contagem aqui é só orientação: quem decide é o backend (que recalcula tudo na prévia e na reserva).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, call, explainError, newIdempotencyKey, type AudienceCount, type BatchPreview, type Campaign, type ReserveResult } from './api';
import { numberFmt } from '@/components/admin/sections/sections';
import { exampleOf, hasVariables } from './filters';

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-900';

function Stat({ label, value, hint, tone = 'slate' }: { label: string; value: React.ReactNode; hint?: string; tone?: 'slate' | 'sky' | 'emerald' }) {
  const tones = { slate: 'bg-slate-50 text-slate-900', sky: 'bg-sky-50 text-sky-900', emerald: 'bg-emerald-50 text-emerald-900' };
  return (
    <div className={`rounded-xl p-3 ${tones[tone]}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-[22px] font-extrabold leading-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] opacity-70">{hint}</p>}
    </div>
  );
}

export function BatchComposer({ campaign, filter, ready, summary, onReserved, busyBatch, maxBatch }: {
  campaign: Campaign; maxBatch?: number | null; filter: unknown; ready: boolean; summary: string[]; onReserved: (r: ReserveResult) => void; busyBatch: boolean;
}) {
  const closed = campaign.status === 'closed';
  const [mode, setMode] = useState<'n' | 'all'>('n');
  const [n, setN] = useState('');
  const requested = mode === 'n' && /^\d+$/.test(n) && Number(n) >= 1 ? Number(n) : null;
  const sizeOk = mode === 'all' || requested !== null;

  // O que mexe na contagem: filtros, tamanho, campanha E o estado dos lotes (reservou, concluiu, recuperou, devolveu).
  // A contagem SEMPRE vem do servidor: nada de somar/subtrair localmente.
  const batchState = campaign.batches.map((b) => `${b.id}:${b.phase}:${Object.values(b.counts).join(',')}`).join('|');
  const sig = useMemo(() => JSON.stringify({ filter, mode, requested, c: campaign.id, st: campaign.status, bs: batchState }), [filter, mode, requested, campaign.id, campaign.status, batchState]);

  // ── contagem dinâmica (com espera, ignorando respostas antigas) ──
  const [count, setCount] = useState<{ data: AudienceCount | null; sig: string | null; loading: boolean; error: string | null }>({ data: null, sig: null, loading: false, error: null });
  const reqSeq = useRef(0);
  useEffect(() => {
    const thisSig = sig;
    const mine = ++reqSeq.current;                       // qualquer resposta de uma consulta anterior passa a ser ignorada
    if (!ready || closed) { setCount({ data: null, sig: null, loading: false, error: null }); return; }
    setCount((c) => ({ ...c, loading: true, error: null }));
    const t = setTimeout(async () => {
      try {
        const data = await call<AudienceCount>('/audience/count', { filter, campaign_id: campaign.id, batch_size: mode === 'n' ? requested : null, all_available: mode === 'all' });
        if (mine === reqSeq.current) setCount({ data, sig: thisSig, loading: false, error: null });
      } catch (e) { if (mine === reqSeq.current) setCount({ data: null, sig: null, loading: false, error: explainError(e).text }); }
    }, 450);
    return () => clearTimeout(t);
  }, [sig, ready, closed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── prévia ──
  const [preview, setPreview] = useState<{ p: BatchPreview; key: string; sig: string } | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<null | 'preview' | 'send'>(null);
  const inFlight = useRef(false);
  const [err, setErr] = useState<{ text: string; retry: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Qualquer mudança em filtros / quantidade / campanha invalida a prévia (o token é preso a eles).
  useEffect(() => { setPreview((p) => (p && p.sig !== sig ? null : p)); setTyped(''); }, [sig]);
  useEffect(() => {
    if (!preview) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [preview]);

  const expiresMs = preview?.p.expires_at ? Date.parse(preview.p.expires_at) - now : null;
  const expired = expiresMs !== null && expiresMs <= 0;
  const fresh = !!count.data && count.sig === sig && !count.loading;     // número antigo nunca aparece como se fosse atual
  const available = fresh ? count.data!.available : null;
  const noOne = available === 0;

  const doPreview = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy('preview'); setErr(null); setNotice(null);
    try {
      const p = await call<BatchPreview>(`/campaigns/${campaign.id}/batches/preview`, { filter, batch_size: mode === 'n' ? requested : null, all_available: mode === 'all' });
      setNow(Date.now());
      setPreview({ p, key: newIdempotencyKey(), sig }); setTyped('');
    } catch (e) { setPreview(null); setErr({ text: explainError(e).text, retry: false }); }
    finally { inFlight.current = false; setBusy(null); }
  };

  const doSend = async () => {
    if (!preview || inFlight.current) return;      // clique duplicado: só um pedido por vez
    const p = preview.p;
    inFlight.current = true; setBusy('send'); setErr(null);
    try {
      const r = await call<ReserveResult>(`/campaigns/${campaign.id}/batches`, {
        filter, batch_size: mode === 'n' ? requested : null, all_available: mode === 'all',
        preview_token: p.token, confirm_count: p.will_reserve, idempotency_key: preview.key,
      });
      setPreview(null); setTyped('');
      setNotice(r.idempotent_replay
        ? `Esta confirmação já tinha sido processada: lote ${r.batch.batch_no} (nada foi reservado de novo).`
        : `Lote ${r.batch.batch_no} reservado para ${numberFmt(r.batch.reserved)} tutores e envio iniciado. “Aceito” significa que o provedor recebeu o envio; não é confirmação de entrega.`);
      onReserved(r);
    } catch (e) {
      const x = explainError(e);
      if (x.needsNewPreview) setPreview(null);
      setErr({ text: x.text, retry: x.retrySameKey && e instanceof ApiError });   // rede: pode repetir com a MESMA chave
    } finally { inFlight.current = false; setBusy(null); }
  };

  const p = preview?.p ?? null;
  const confirmOk = !!p && !expired && p.will_reserve > 0 && typed.trim() === String(p.will_reserve);
  // Teto por lote (definido no servidor): a tela avisa e bloqueia, mas quem decide é o servidor (prévia e reserva conferem de novo).
  const limit = maxBatch ?? p?.max_batch ?? null;
  const overLimit = limit !== null && mode === 'n' && requested !== null && requested > limit;
  const allOver = limit !== null && mode === 'all' && available !== null && available > limit;
  const canPreview = ready && sizeOk && !closed && !busyBatch && !noOne && !overLimit && !allOver && busy === null;

  if (closed) return <p className="rounded-lg bg-slate-100 p-3 text-[13px] text-slate-700">Campanha encerrada: não aceita novos lotes. O histórico continua disponível abaixo.</p>;

  return (
    <div className="space-y-4">
      {/* Contagem */}
      <div aria-live="polite" aria-busy={count.loading}>
        {!ready ? <p className="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">Complete os filtros marcados com “Falta” para ver a contagem.</p>
          : count.error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-[13px] text-rose-800">{count.error}</p>
          : !fresh ? (
            <div role="status">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {['Atendem aos filtros', 'Alcançáveis por push', 'Já usados na campanha', 'Ainda disponíveis', 'Próximo lote'].map((l) => <Stat key={l} label={l} value="…" />)}
              </div>
              <p className="mt-2 text-[12px] text-slate-500">Atualizando a contagem no servidor…</p>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <Stat label="Atendem aos filtros" value={numberFmt(count.data!.matches)} />
                <Stat label="Alcançáveis por push" value={numberFmt(count.data!.reachable)} hint={`sem push ${numberFmt(count.data!.not_reachable.no_push)} · desligaram ${numberFmt(count.data!.not_reachable.opt_out)}`} />
                <Stat label="Já usados na campanha" value={numberFmt(count.data!.used_in_campaign_total)}
                  hint={count.data!.used_in_campaign_total === count.data!.used ? 'todos atendem aos filtros atuais' : `${numberFmt(count.data!.used)} deles atendem aos filtros atuais`} />
                <Stat label="Ainda disponíveis" value={numberFmt(count.data!.available)} hint="alcançáveis que atendem aos filtros e ainda não foram usados" tone="emerald" />
                <Stat label="Próximo lote" value={mode === 'all' ? numberFmt(count.data!.available) : requested ? numberFmt(Math.min(requested, count.data!.available)) : '—'} tone="sky" />
              </div>
              <p className="mt-2 text-[11.5px] text-slate-500">iPhone {numberFmt(count.data!.by_platform.ios)} · Android {numberFmt(count.data!.by_platform.android)} · web {numberFmt(count.data!.by_platform.web)}. Esta contagem vem do servidor e orienta; o servidor refaz o cálculo na prévia e na confirmação.</p>
              {count.data!.warnings.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {count.data!.warnings.map((w, i) => (
                    <li key={`${w.code}-${i}`} className={`rounded-lg p-2.5 text-[12.5px] leading-snug ${w.level === 'attention' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700'}`}>{w.text}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
      </div>

      {/* Tamanho */}
      <fieldset className="rounded-xl border border-slate-200 p-3">
        <legend className="px-1 text-[13px] font-bold text-slate-800">Tamanho do lote</legend>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px]"><input type="radio" name="batch-mode" checked={mode === 'n'} onChange={() => setMode('n')} /> Quantidade</label>
          <input aria-label="Quantidade de tutores no lote" inputMode="numeric" disabled={mode !== 'n'} className={`${input} !w-32`} value={n} placeholder="Ex.: 50"
            onChange={(e) => setN(e.target.value.replace(/\D/g, '').slice(0, 7))} />
          <label className="flex items-center gap-2 text-[13px]"><input type="radio" name="batch-mode" checked={mode === 'all'} onChange={() => setMode('all')} /> Todos os disponíveis{available !== null && ` (${numberFmt(available)})`}</label>
        </div>
        {limit !== null && (
          <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[12px] leading-snug text-slate-700" data-testid="limite-por-lote">
            Limite por lote: <strong>{numberFmt(limit)} tutor{limit === 1 ? '' : 'es'}</strong> (definido no servidor, vale também para “todos os disponíveis”). Pedidos acima do limite são recusados: o sistema não divide o pedido em vários lotes nem o reduz sozinho.
          </p>
        )}
        {overLimit && <p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2.5 text-[12.5px] leading-snug text-rose-900">Você pediu {numberFmt(requested)}, acima do limite de {numberFmt(limit)} por lote. Reduza a quantidade para até {numberFmt(limit)}.</p>}
        {allOver && <p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2.5 text-[12.5px] leading-snug text-rose-900">Há {numberFmt(available)} disponíveis, acima do limite de {numberFmt(limit)} por lote. Escolha “Quantidade” e informe até {numberFmt(limit)}.</p>}
        <p className="mt-2 text-[11.5px] text-slate-500">Os tutores são sorteados entre os disponíveis. Quem já foi usado nesta campanha nunca é escolhido de novo, mesmo mudando os filtros.</p>
      </fieldset>

      {busyBatch && <p role="status" className="rounded-lg bg-amber-50 p-3 text-[13px] leading-snug text-amber-900">Há um lote em andamento ou interrompido. Conclua-o abaixo antes de reservar o próximo. Enquanto ele durar, o <strong>envio avulso</strong> também precisa aguardar: o sistema só permite um envio por vez, para ninguém receber duas coisas ao mesmo tempo.</p>}
      {noOne && ready && <p role="status" className="rounded-lg bg-slate-100 p-3 text-[13px] text-slate-700">Nenhum destinatário disponível com estes filtros. Ajuste os filtros ou encerre a campanha.</p>}

      <button type="button" onClick={doPreview} disabled={!canPreview} className="rounded-lg bg-sky-700 px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-40">
        {busy === 'preview' ? 'Gerando prévia…' : p ? 'Gerar nova prévia' : 'Conferir prévia'}
      </button>

      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-[13px] leading-snug text-emerald-900">{notice}</p>}
      {err && (
        <div role="alert" className="rounded-lg bg-rose-50 p-3 text-[13px] leading-snug text-rose-900">
          <p>{err.text}</p>
          {err.retry && preview && <button type="button" className="mt-2 rounded-lg bg-rose-700 px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-40" disabled={busy !== null} onClick={doSend}>Tentar de novo (mesma confirmação, sem risco de duplicar)</button>}
        </div>
      )}

      {/* Prévia */}
      {p && (
        <section aria-label="Prévia do lote" className="space-y-3 rounded-xl border-2 border-sky-300 bg-white p-4">
          <h4 className="text-[15px] font-extrabold text-slate-900">Prévia do lote {p.next_batch_no}</h4>
          <div className="rounded-lg bg-slate-50 p-3 text-[13px]">
            <p className="text-[11px] font-bold uppercase text-slate-500">Como aparece no celular (exemplo)</p>
            <p className="font-bold text-slate-900">{exampleOf(p.content.title || '{tutor}, uma novidade para {pets}')}</p>
            <p className="mt-0.5 text-slate-700">{exampleOf(p.content.message)}</p>
            {(hasVariables(p.content.title) || hasVariables(p.content.message) || !p.content.title) && <p className="mt-1 text-[11.5px] text-slate-500">No envio, <strong>{'{tutor}'}</strong> vira o nome de cada tutor e <strong>{'{pets}'}</strong> o nome dos pets dele (aqui: “Ana” e “Thor”).</p>}
            {p.content.product_url && <p className="mt-1 break-all text-[12px] text-slate-500">Produto: {String(p.content.product_title)} · {p.content.product_url}</p>}
          </div>
          <div>
            <p className="text-[12px] font-bold text-slate-600">Filtros</p>
            {summary.length ? <ul className="list-disc pl-5 text-[13px] text-slate-800">{summary.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="text-[13px] text-slate-800">Sem filtros: todos os alcançáveis por push.</p>}
          </div>
          <p className="text-[14px] text-slate-900">
            Disponíveis agora: <strong>{numberFmt(p.available)}</strong> · Pedido: <strong>{mode === 'all' ? 'todos os disponíveis' : numberFmt(requested)}</strong> · Será reservado: <strong>{numberFmt(p.will_reserve)}</strong>
          </p>
          {p.smaller_than_requested && (
            <p role="alert" className="rounded-lg bg-amber-100 p-3 text-[13px] font-semibold leading-snug text-amber-950">
              Atenção: você pediu {numberFmt(requested)}, mas só há {numberFmt(p.available)} disponíveis. O lote será de {numberFmt(p.will_reserve)}. Se estiver de acordo, confirme digitando esse número abaixo.
            </p>
          )}
          {!p.can_reserve && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-[13px] text-rose-900">{p.blocking_batch ? `O lote ${p.blocking_batch.batch_no} ainda está em andamento ou interrompido.` : 'Não há destinatários para reservar.'}</p>}
          {p.can_reserve && (
            <>
              <p className="text-[12.5px] text-slate-600" aria-live="off">
                {expired ? <strong className="text-rose-700">Prévia expirada. Gere uma nova.</strong> : <>Esta prévia vale por mais {Math.max(0, Math.floor((expiresMs ?? 0) / 60000))}min {String(Math.max(0, Math.floor(((expiresMs ?? 0) % 60000) / 1000))).padStart(2, '0')}s.</>}
              </p>
              <div>
                <label htmlFor="confirm-count" className="mb-1 block text-[12px] font-bold text-slate-600">Para confirmar, digite {p.will_reserve}</label>
                <input id="confirm-count" inputMode="numeric" autoComplete="off" className={`${input} !w-40`} value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} />
              </div>
              <button type="button" disabled={!confirmOk || busy !== null} onClick={doSend} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-40">
                {busy === 'send' ? 'Reservando…' : `Confirmar e enviar para ${numberFmt(p.will_reserve)} tutor${p.will_reserve === 1 ? '' : 'es'}`}
              </button>
              <p className="text-[11.5px] text-slate-500">Ao confirmar, os destinatários são reservados no servidor e o envio começa. Cliques repetidos não duplicam nada.</p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

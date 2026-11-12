'use client';

/**
 * "Enviar notificação": o dono escolhe o que a mensagem vai incentivar o tutor a fazer, escreve a mensagem
 * principal (o PETMOL acrescenta sozinho o nome do tutor e dos pets), escolhe quem recebe (todos / uma
 * quantidade / só ele) e acompanha o êxito = o tutor FAZER ALGO NO APP depois do envio.
 * Usado em /admin/hoje e /admin/dashboard2 (mesmo componente nas duas telas).
 */
import { useEffect, useState } from 'react';
import { getToken } from '@/lib/auth-token';
import { useAsync, Loading, ErrorBox, numberFmt } from '@/components/admin/sections/sections';

const API = '/api/v1/admin/broadcast';

interface Goal { key: string; group: string; label: string; segment: string; title: string; open: string; message: string; why: string; success: string; eligible: number }
interface SegmentInfo { label: string; eligible: number; skipped: { opt_out: number; weekly_cap: number; segment: number } }
interface Audience { total: number; web: number; ios: number; android: number; opted_out: number; reachable: number }
interface SegmentsResponse { segments: Record<string, SegmentInfo>; goals: Goal[]; destinations: Record<string, string>; weekly_cap_days: number; audience?: Audience }
interface Preview {
  destination_label?: string; will_send: number; skipped: { opt_out: number; weekly_cap: number; segment: number }; sample: { title: string; body: string } | null;
  test_accounts?: { name: string; has_push: boolean }[]; product?: { title: string; url: string };
}
/** Resposta da conferência do link de produto: loja, nome lido do próprio link (quando a loja deixa) e imagem. */
interface LinkInfo { url: string; store: string; host: string; final_host: string | null; title: string | null; image: string | null; readable: boolean; reason: string | null }
interface Metrics { delivered: number; tapped: number; opened: number; acted: number; goal_hit: number | null; goal_label: string | null; window_closed: boolean }
interface HistoryItem {
  id: string; created_at: string; message: string; segment: string; audience_kind: 'all' | 'count' | 'test';
  audience_requested: number | null; goal: string | null; recipients_total: number; delivered_total: number;
  phase: 'sending' | 'done' | 'error'; metrics: Metrics; product?: { title: string; url: string } | null;
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

/** Preenchimento vindo do Radar de promoções: o dono revisa e envia (começa em "Teste" para conferir). */
export interface BroadcastPrefill { key: string; goal: string; title: string; message: string; destination: string; note: string }

export function BroadcastPanel({ prefill }: { prefill?: BroadcastPrefill | null }) {
  const segs = useAsync<SegmentsResponse>(() => call('/segments'), [], { live: false });
  const [tick, setTick] = useState(0);
  const history = useAsync<{ items: HistoryItem[] }>(() => call('/history'), [tick], { intervalMs: 20000 });

  const [goalKey, setGoalKey] = useState('');
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('home');
  const [message, setMessage] = useState('');
  const [segment, setSegment] = useState('todos');
  const [kind, setKind] = useState<'all' | 'count' | 'test'>('test');
  const [count, setCount] = useState('');
  // Link de produto (opcional): o dono cola, o painel confere o nome e o toque abre o produto direto na loja.
  const [productUrl, setProductUrl] = useState('');
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [productTitle, setProductTitle] = useState('');
  const [checking, setChecking] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  // Decisão do dono (09/11/2026): o push alcança SEMPRE todos com notificação ativa. Sem limite semanal.
  const ignoreCap = true;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  useEffect(() => {
    if (!prefill) return;
    setGoalKey(prefill.goal); setTitle(prefill.title); setMessage(prefill.message);
    setDestination(prefill.destination); setSegment('todos'); setKind('test');
    setPreview(null); setTyped(''); setOkMsg(null); setErr(null);
    setPrefillNote(prefill.note);
  }, [prefill?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const goals = segs.data?.goals ?? [];
  const goal = goals.find((g) => g.key === goalKey) ?? null;
  const groups = Array.from(new Set(goals.map((g) => g.group)));

  const body = () => ({
    message, title: title.trim() || null, destination: linkInfo ? 'produto' : destination, segment, goal: goalKey || null, ignore_weekly_cap: ignoreCap,
    ...(linkInfo ? { product_url: linkInfo.url, product_title: productTitle.trim() } : {}),
    audience: { kind, count: kind === 'count' ? Number(count) || undefined : undefined },
  });
  const invalidate = () => { setPreview(null); setTyped(''); setOkMsg(null); setErr(null); };

  const clearLink = () => { setProductUrl(''); setLinkInfo(null); setProductTitle(''); setLinkErr(null); invalidate(); };
  const checkLink = async () => {
    setChecking(true); setLinkErr(null); setLinkInfo(null); invalidate();
    try {
      const info = await call<LinkInfo>('/link-preview', { url: productUrl.trim() });
      setLinkInfo(info);
      setProductTitle(info.title ?? '');
      // Já deixa a ação e o texto prontos (sem apagar o que o dono já escreveu).
      const g = goals.find((x) => x.key === 'link_produto');
      if (!goalKey) { setGoalKey('link_produto'); setSegment(g?.segment ?? 'todos'); }
      if (!title.trim() && g) setTitle(g.title);
      if (!message.trim()) setMessage((info.title ?? g?.message ?? '').slice(0, 240));
      setDestination('produto');
    } catch (e) { setLinkErr((e as Error).message); }
    finally { setChecking(false); }
  };

  const pickGoal = (key: string) => {
    setGoalKey(key);
    const g = goals.find((x) => x.key === key);
    if (g) { setTitle(g.title); setMessage(g.message); setSegment(g.segment); setDestination(g.open || 'home'); }
    invalidate();
  };

  const doPreview = async () => {
    setBusy(true); setErr(null); setOkMsg(null);
    try { setPreview(await call<Preview>('/preview', body())); setTyped(''); }
    catch (e) { setErr((e as Error).message); setPreview(null); }
    finally { setBusy(false); }
  };

  const doSend = async () => {
    if (!preview) return;
    setBusy(true); setErr(null);
    try {
      const r = await call<{ will_send: number }>('/send', { ...body(), confirm_count: preview.will_send });
      setOkMsg(`Enviando para ${numberFmt(r.will_send)} pessoa${r.will_send === 1 ? '' : 's'}. Acompanhe o resultado abaixo.`);
      setPreview(null); setTyped('');
      setTick((t) => t + 1);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const needsTyping = preview && kind !== 'test';
  const canSend = !!preview && preview.will_send > 0 && (!needsTyping || typed.trim() === String(preview.will_send));
  const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-900';
  const label = 'mb-1 block text-[12px] font-bold text-slate-600';

  return (
    <div className="space-y-4">
      {segs.loading && !segs.data ? <Loading /> : segs.error || !segs.data ? <ErrorBox msg={segs.error} /> : (
        <>
          {prefillNote && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12.5px] leading-snug text-amber-900">
              {prefillNote} Revise o texto, faça o <strong>teste</strong> (dono, Henrique e VEP) e só então escolha quem recebe.
            </p>
          )}
          <div>
            <label className={label} htmlFor="bc-goal">Esta notificação vai incentivar o usuário a:</label>
            <select id="bc-goal" className={input} value={goalKey} onChange={(e) => pickGoal(e.target.value)}>
              <option value="">Escolher… (ou escreva livremente)</option>
              {groups.map((grp) => (
                <optgroup key={grp} label={grp}>
                  {goals.filter((g) => g.group === grp).map((g) => (
                    <option key={g.key} value={g.key}>{g.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {goal && (
              <div className="mt-2 rounded-lg bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-600">
                <p><strong>Por que:</strong> {goal.why}</p>
                <p className="mt-1"><strong>Como medimos o êxito:</strong> {goal.success}</p>
              </div>
            )}
          </div>

          <div>
            <label className={label} htmlFor="bc-title">Título (o que aparece primeiro na tela do celular)</label>
            <input id="bc-title" maxLength={80} className={input} value={title}
              onChange={(e) => { setTitle(e.target.value); invalidate(); }}
              placeholder="{tutor}, uma novidade para {pets}" />
            <p className="mt-1 text-[11px] text-slate-500">
              Coloque aqui a informação mais importante. <code>{'{tutor}'}</code> vira o nome do tutor e <code>{'{pets}'}</code> o(s) nome(s) do(s) pet(s). Vazio = “{'{tutor}'}, uma novidade para {'{pets}'}”.
            </p>
          </div>

          <div>
            <label className={label} htmlFor="bc-msg">Mensagem principal</label>
            <textarea id="bc-msg" rows={3} maxLength={240} className={input} value={message}
              onChange={(e) => { setMessage(e.target.value); invalidate(); }}
              placeholder="Ex.: aproveite 10% de desconto na Petz usando o cupom petmol." />
            <p className="mt-1 text-[11px] text-slate-500">
              O texto vem logo abaixo do título. Para pôr nomes aqui também, use <code>{'{tutor}'}</code> e <code>{'{pets}'}</code> na mensagem.
              {' '}{message.length}/240
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <label className={label} htmlFor="bc-link">Link de produto (opcional): o toque abre o produto direto na loja</label>
            <div className="flex gap-2">
              <input id="bc-link" className={input} value={productUrl} inputMode="url" autoComplete="off"
                placeholder="Cole o link (Amazon, Cobasi, Shopee, Mercado Livre…)"
                onChange={(e) => { setProductUrl(e.target.value); setLinkInfo(null); setProductTitle(''); setLinkErr(null); invalidate(); }} />
              <button type="button" onClick={checkLink} disabled={checking || productUrl.trim().length < 12}
                className="shrink-0 rounded-lg border border-[#0056D2] px-3 py-2 text-[13px] font-bold text-[#0056D2] disabled:opacity-40">
                {checking ? 'Conferindo…' : 'Conferir link'}
              </button>
            </div>
            {linkErr && <p className="mt-2 rounded-lg bg-rose-50 p-2 text-[12.5px] text-rose-700">{linkErr}</p>}
            {linkInfo && (
              <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
                <div className="flex items-start gap-3">
                  {linkInfo.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={linkInfo.image} alt="" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-lg bg-white object-contain" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{linkInfo.store || 'Loja'} · {linkInfo.final_host || linkInfo.host}</p>
                    {linkInfo.readable
                      ? <p className="text-[13px] font-bold text-slate-900">Nome lido do link: {linkInfo.title}</p>
                      : <p className="text-[12.5px] text-amber-800">{linkInfo.reason || 'Não consegui ler o nome do produto. Digite abaixo.'}</p>}
                  </div>
                </div>
                <div>
                  <label className={label} htmlFor="bc-ptitle">Nome do produto (confira; é o que fica registrado no histórico)</label>
                  <input id="bc-ptitle" maxLength={160} className={input} value={productTitle}
                    onChange={(e) => { setProductTitle(e.target.value); invalidate(); }} />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[12px]">
                  <a href={linkInfo.url} target="_blank" rel="noopener noreferrer" className="font-bold text-[#0056D2] underline">Abrir o link para testar</a>
                  <button type="button" onClick={clearLink} className="text-slate-500 underline">Remover link</button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={label} htmlFor="bc-dest">Ao tocar na notificação, abrir</label>
            <select id="bc-dest" className={input} value={linkInfo ? 'produto' : destination} disabled={!!linkInfo} onChange={(e) => { setDestination(e.target.value); invalidate(); }}>
              {Object.entries(segs.data.destinations).filter(([k]) => k !== 'produto' || !!linkInfo).map(([k, t]) => (<option key={k} value={k}>{t}</option>))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="bc-seg">Para quem</label>
            <select id="bc-seg" className={input} value={segment} onChange={(e) => { setSegment(e.target.value); invalidate(); }}>
              {Object.entries(segs.data.segments).map(([k, s]) => (
                <option key={k} value={k}>{s.label} — {numberFmt(s.eligible)} pessoas</option>
              ))}
            </select>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-700">
              {([['test', 'Teste (dono, Henrique e VEP)'], ['count', 'Uma quantidade'], ['all', 'Todos']] as const).map(([k, t]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="radio" name="bc-kind" checked={kind === k} onChange={() => { setKind(k); invalidate(); }} /> {t}
                </label>
              ))}
              {kind === 'count' && (
                <input inputMode="numeric" className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-[13px]" placeholder="quantas"
                  value={count} onChange={(e) => { setCount(e.target.value.replace(/\D/g, '')); invalidate(); }} />
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {segs.data.audience
                ? <>Com notificação ativa: <strong>{numberFmt(segs.data.audience.total)}</strong> pessoas (navegador {numberFmt(segs.data.audience.web)} · iPhone {numberFmt(segs.data.audience.ios)} · Android {numberFmt(segs.data.audience.android)}). {numberFmt(segs.data.audience.opted_out)} pediram para parar e ficam de fora; <strong>{numberFmt(segs.data.audience.reachable)}</strong> recebem em “Todos”.</>
                : 'Recebe quem tem notificação ativa, menos quem pediu para parar.'}
              {' '}Sem limite por pessoa: quem já recebeu algo esta semana também recebe.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={doPreview} disabled={busy || message.trim().length < 3 || (kind === 'count' && !Number(count)) || (!!linkInfo && productTitle.trim().length < 2)}
              className="rounded-lg border border-[#0056D2] px-4 py-2 text-[13px] font-bold text-[#0056D2] disabled:opacity-40">
              Ver prévia e quantas pessoas
            </button>
          </div>

          {err && <p className="rounded-lg bg-rose-50 p-3 text-[13px] text-rose-700">{err}</p>}
          {okMsg && <p className="rounded-lg bg-emerald-50 p-3 text-[13px] text-emerald-700">{okMsg}</p>}

          {preview && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {preview.sample ? (
                <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Como chega (exemplo com nomes reais)</p>
                  <p className="mt-1 text-[14px] font-extrabold text-slate-900">{preview.sample.title}</p>
                  <p className="text-[13px] text-slate-700">{preview.sample.body}</p>
                  {preview.destination_label && <p className="mt-1 text-[11px] text-slate-400">Ao tocar abre: {preview.destination_label}</p>}
                  {preview.product && <p className="mt-1 text-[12px] font-semibold text-slate-700">Produto: {preview.product.title}</p>}
                </div>
              ) : <p className="text-[13px] text-slate-500">Ninguém receberia esta mensagem agora.</p>}
              <p className="text-[14px] text-slate-800">
                Vão receber: <strong>{numberFmt(preview.will_send)}</strong> pessoa{preview.will_send === 1 ? '' : 's'}.
                {kind !== 'test' && (
                  <span className="text-[12px] text-slate-500">
                    {' '}Ficam de fora: {numberFmt(preview.skipped.opt_out)} pediram para parar{preview.skipped.segment ? `, ${numberFmt(preview.skipped.segment)} fora do público escolhido` : ''}.
                  </span>
                )}
              </p>
              {kind === 'test' && preview.test_accounts && (
                <div className="rounded-lg bg-white p-3 text-[12.5px] ring-1 ring-black/5">
                  <p className="font-bold text-slate-700">O teste vai para estas contas:</p>
                  <ul className="mt-1 space-y-0.5">
                    {preview.test_accounts.map((a) => (
                      <li key={a.name} className={a.has_push ? 'text-slate-700' : 'text-amber-800'}>
                        {a.has_push ? '✓' : '⚠'} {a.name}{a.has_push ? '' : ' — sem notificação ativa: não vai receber'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {needsTyping && (
                <div>
                  <label className={label} htmlFor="bc-confirm">Para confirmar, digite {preview.will_send}</label>
                  <input id="bc-confirm" inputMode="numeric" className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-[14px]"
                    value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} />
                </div>
              )}
              <button type="button" onClick={doSend} disabled={busy || !canSend}
                className="rounded-lg bg-[#0056D2] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40">
                {kind === 'test' ? `Enviar teste (${preview.will_send} ${preview.will_send === 1 ? 'conta' : 'contas'})` : `Enviar para ${numberFmt(preview.will_send)} pessoa${preview.will_send === 1 ? '' : 's'}`}
              </button>
              <p className="text-[11px] text-slate-500">Depois de enviada, uma notificação não pode ser desfeita.</p>
            </div>
          )}
        </>
      )}

      <div>
        <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">Envios e resultado (24h depois de cada envio)</p>
        {history.loading && !history.data ? <Loading /> : history.error || !history.data ? <ErrorBox msg={history.error} /> : (
          history.data.items.length === 0 ? <p className="text-[13px] text-slate-500">Nenhum envio ainda.</p> : (
            <ul className="space-y-3">
              {history.data.items.map((h) => {
                const m = h.metrics;
                const rows: [string, number][] = [['Receberam', m.delivered], ['Tocaram na notificação', m.tapped], ['Abriram o app', m.opened], ['Fizeram algo no app', m.acted]];
                return (
                  <li key={h.id} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-[13px] font-bold text-slate-900">{h.message}</p>
                    {h.product && <p className="text-[12px] text-slate-600">Produto: {h.product.title}</p>}
                    <p className="text-[11px] text-slate-500">
                      {new Date(h.created_at).toLocaleString('pt-BR')} · {audienceLabel(h)} · {h.phase === 'sending' ? 'enviando…' : h.phase === 'error' ? 'erro no envio' : `${numberFmt(h.delivered_total)} de ${numberFmt(h.recipients_total)} entregues`}
                      {m.goal_label ? ` · meta: ${m.goal_label}` : ''}{!m.window_closed ? ' · ainda contando' : ''}
                    </p>
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
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>
    </div>
  );
}

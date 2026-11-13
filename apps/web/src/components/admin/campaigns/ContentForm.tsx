'use client';

/** Passo 2 — conteúdo comercial. Depois do 1º lote ele fica TRAVADO (o backend recusa mudanças): aqui só se exibe. */
import { useState } from 'react';
import { call, type Campaign, type CampaignContent } from './api';

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-900';
const label = 'mb-1 block text-[12px] font-bold text-slate-600';

export interface Goal { key: string; group: string; label: string; title: string; open: string; message: string }
interface LinkInfo { url: string; store: string; title: string | null; readable: boolean; reason: string | null }

export interface Draft { name: string; goal: string; title: string; message: string; destination: string; productUrl: string; productTitle: string }
export const emptyDraft = (): Draft => ({ name: '', goal: '', title: '', message: '', destination: 'home', productUrl: '', productTitle: '' });
export const draftFrom = (c: Campaign): Draft => ({
  name: `${c.name} (cópia)`, goal: c.content.goal ?? '', title: c.content.title ?? '', message: c.content.message,
  destination: c.content.destination ?? 'home', productUrl: c.content.product_url ?? '', productTitle: c.content.product_title ?? '',
});

export function ContentReadOnly({ content, locked }: { content: CampaignContent; locked: boolean }) {
  return (
    <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
      <div><dt className="text-[11px] font-bold uppercase text-slate-500">Título</dt><dd className="text-slate-900">{content.title || '(padrão: “{tutor}, uma novidade para {pets}”)'}</dd></div>
      <div><dt className="text-[11px] font-bold uppercase text-slate-500">Destino ao tocar</dt><dd className="text-slate-900">{content.destination}</dd></div>
      <div className="sm:col-span-2"><dt className="text-[11px] font-bold uppercase text-slate-500">Mensagem</dt><dd className="whitespace-pre-wrap text-slate-900">{content.message}</dd></div>
      {content.product_url && (
        <div className="sm:col-span-2"><dt className="text-[11px] font-bold uppercase text-slate-500">Produto e link monetizado (guardado exatamente como foi colado)</dt>
          <dd className="break-all text-slate-900">{content.product_title} — <span className="text-slate-600">{content.product_url}</span></dd></div>
      )}
      <p className="text-[12px] text-slate-600 sm:col-span-2">
        {locked ? '🔒 Conteúdo travado: já existe lote desta campanha. Para mudar o texto ou o link, crie uma nova campanha (os filtros e quantidades continuam ajustáveis).'
          : 'O conteúdo fica travado assim que o primeiro lote for reservado. Para mudar antes disso, crie uma cópia editável.'}
      </p>
    </dl>
  );
}

export function ContentForm({ goals, destinations, initial, onCreated }: {
  goals: Goal[]; destinations: Record<string, string>; initial: Draft; onCreated: (c: Campaign) => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const groups = Array.from(new Set(goals.map((g) => g.group)));

  const pickGoal = (key: string) => {
    const g = goals.find((x) => x.key === key);
    set(g ? { goal: key, title: g.title, message: g.message, destination: g.open || 'home' } : { goal: '' });
  };
  const checkLink = async () => {
    setChecking(true); setLinkErr(null); setLink(null);
    try {
      const info = await call<LinkInfo>('/link-preview', { url: d.productUrl.trim() }, { base: '/api/v1/admin/broadcast' });
      setLink(info);
      set({ productTitle: info.title ?? d.productTitle, destination: 'produto', message: d.message || (info.title ?? '').slice(0, 240) });
    } catch (e) { setLinkErr((e as Error).message); } finally { setChecking(false); }
  };

  const hasLink = d.productUrl.trim() !== '';
  const missing = d.name.trim().length < 3 ? 'Dê um nome à campanha (mínimo 3 letras).'
    : !d.message.trim() ? 'Escreva a mensagem principal.'
    : hasLink && !link && !initial.productUrl ? 'Confira o link do produto antes de continuar.'
    : hasLink && d.productTitle.trim().length < 2 ? 'Informe o nome do produto.' : null;

  const save = async () => {
    if (busy) return;                       // clique duplicado: um pedido por vez
    setBusy(true); setErr(null);
    try {
      const c = await call<Campaign>('/campaigns', {
        name: d.name.trim(), message: d.message.trim(), title: d.title.trim() || null, goal: d.goal || null,
        destination: hasLink ? 'produto' : d.destination || null,
        product_url: hasLink ? d.productUrl.trim() : null, product_title: hasLink ? d.productTitle.trim() : null,
      });
      onCreated(c);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!missing) void save(); }}>
      <div>
        <label className={label} htmlFor="cp-name">Nome da campanha (só para você identificar)</label>
        <input id="cp-name" className={input} maxLength={120} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Ração para gatos — fevereiro" />
      </div>
      <div>
        <label className={label} htmlFor="cp-goal">Esta campanha vai incentivar o tutor a: (opcional, preenche um texto sugerido)</label>
        <select id="cp-goal" className={input} value={d.goal} onChange={(e) => pickGoal(e.target.value)}>
          <option value="">Escrever livremente</option>
          {groups.map((g) => <optgroup key={g} label={g}>{goals.filter((x) => x.group === g).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="cp-title">Título</label>
        <input id="cp-title" className={input} maxLength={80} value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="{tutor}, uma novidade para {pets}" />
      </div>
      <div>
        <label className={label} htmlFor="cp-msg">Mensagem principal</label>
        <textarea id="cp-msg" rows={3} maxLength={240} className={input} value={d.message} onChange={(e) => set({ message: e.target.value })} />
        <p className="mt-1 text-[11px] text-slate-500">{d.message.length}/240 · <code>{'{tutor}'}</code> e <code>{'{pets}'}</code> viram os nomes.</p>
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <label className={label} htmlFor="cp-link">Link do produto (opcional): você cola o link monetizado, o PETMOL não altera nada nele</label>
        <div className="flex gap-2">
          <input id="cp-link" className={input} inputMode="url" autoComplete="off" value={d.productUrl} placeholder="Cole o link (Amazon, Cobasi, Shopee, Mercado Livre…)"
            onChange={(e) => { set({ productUrl: e.target.value }); setLink(null); setLinkErr(null); }} />
          <button type="button" disabled={checking || !hasLink} onClick={checkLink} className="shrink-0 rounded-lg bg-slate-800 px-3 text-[13px] font-bold text-white disabled:opacity-40">{checking ? 'Conferindo…' : 'Conferir'}</button>
        </div>
        {linkErr && <p role="alert" className="mt-2 text-[12.5px] text-rose-700">{linkErr}</p>}
        {link && <p className="mt-2 text-[12.5px] text-emerald-800">Loja reconhecida: <strong>{link.store}</strong>.{link.reason ? ` ${link.reason}` : ''}</p>}
        {hasLink && (
          <div className="mt-2">
            <label className={label} htmlFor="cp-ptitle">Nome do produto</label>
            <input id="cp-ptitle" className={input} maxLength={160} value={d.productTitle} onChange={(e) => set({ productTitle: e.target.value })} />
          </div>
        )}
      </div>
      {!hasLink && (
        <div>
          <label className={label} htmlFor="cp-dest">Ao tocar, abrir:</label>
          <select id="cp-dest" className={input} value={d.destination} onChange={(e) => set({ destination: e.target.value })}>
            {Object.entries(destinations).filter(([k]) => k !== 'produto').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      )}
      {err && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-[13px] text-rose-800">{err}</p>}
      {missing && <p className="text-[12.5px] text-amber-800">{missing}</p>}
      <button type="submit" disabled={busy || !!missing} className="rounded-lg bg-sky-700 px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-40">{busy ? 'Salvando…' : 'Salvar campanha e continuar'}</button>
      <p className="text-[11.5px] text-slate-500">Salvar não envia nada. O envio só acontece depois da prévia e da confirmação, lote a lote.</p>
    </form>
  );
}

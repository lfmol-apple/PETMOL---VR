'use client';

/** Passo 2 — conteúdo comercial. Depois do 1º lote ele fica TRAVADO (o backend recusa mudanças): aqui só se exibe. */
import { useState } from 'react';
import { call, type Campaign, type CampaignContent } from './api';
import { destinationLabel, exampleOf, hasVariables } from './filters';

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-900';
const label = 'mb-1 block text-[12px] font-bold text-slate-600';

export interface Goal { key: string; group: string; label: string; title: string; open: string; message: string }
interface LinkInfo { url: string; store: string; title: string | null; image?: string | null; readable: boolean; reason: string | null }

export interface Draft { name: string; goal: string; title: string; message: string; destination: string; productUrl: string; productTitle: string }
export const emptyDraft = (): Draft => ({ name: '', goal: '', title: '', message: '', destination: 'home', productUrl: '', productTitle: '' });
export const draftFrom = (c: Campaign): Draft => ({
  name: `${c.name} (cópia)`, goal: c.content.goal ?? '', title: c.content.title ?? '', message: c.content.message,
  destination: c.content.destination ?? 'home', productUrl: c.content.product_url ?? '', productTitle: c.content.product_title ?? '',
});

export function ContentReadOnly({ content, locked, destinations }: { content: CampaignContent; locked: boolean; destinations: Record<string, string> }) {
  const openUrl = content.open_url || content.product_url || null;
  return (
    <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
      <div><dt className="text-[11px] font-bold uppercase text-slate-500">Título</dt><dd className="text-slate-900">{content.title || '{tutor}, uma novidade para {pets}'}</dd></div>
      <div><dt className="text-[11px] font-bold uppercase text-slate-500">Ao tocar, abre</dt><dd className="text-slate-900">{destinationLabel(content.destination, destinations)}</dd></div>
      <div className="sm:col-span-2 rounded-lg bg-slate-50 p-2.5">
        <dt className="text-[11px] font-bold uppercase text-slate-500">Como aparece no celular (exemplo){openUrl ? ' — toque para abrir o destino' : ''}</dt>
        <dd className="text-slate-900">
          {openUrl ? (
            <a href={openUrl} target="_blank" rel="noopener noreferrer" data-testid="push-preview-link" className="block rounded-lg border border-slate-200 bg-white p-2 shadow-sm active:scale-[0.99]">
              <strong>{exampleOf(content.title || '{tutor}, uma novidade para {pets}')}</strong><br />{exampleOf(content.message)}
            </a>
          ) : (<><strong>{exampleOf(content.title || '{tutor}, uma novidade para {pets}')}</strong><br />{exampleOf(content.message)}</>)}
        </dd>
        <dd className="mt-1 text-[11.5px] text-slate-500">No envio, <strong>{'{tutor}'}</strong> vira o nome de cada tutor e <strong>{'{pets}'}</strong> o nome dos pets dele (aqui: “Ana” e “Thor”).</dd>
      </div>
      <div className="sm:col-span-2"><dt className="text-[11px] font-bold uppercase text-slate-500">Mensagem</dt><dd className="whitespace-pre-wrap text-slate-900">{content.message}</dd></div>
      {content.product_url && (
        <div className="sm:col-span-2"><dt className="text-[11px] font-bold uppercase text-slate-500">Produto e link monetizado (guardado exatamente como foi colado)</dt>
          <dd className="break-all text-slate-900">{content.product_title} — <a href={content.product_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0056D2] underline">{content.product_url}</a></dd></div>
      )}
      <p className="text-[12px] text-slate-600 sm:col-span-2">
        {locked ? '🔒 Conteúdo travado: já existe lote desta campanha. Para mudar o texto ou o link, crie uma nova campanha (os filtros e quantidades continuam ajustáveis).'
          : 'O conteúdo fica travado assim que o primeiro lote for reservado. Para mudar antes disso, crie uma cópia editável.'}
      </p>
    </dl>
  );
}

const LINK_GOAL = 'link_produto';
const LINK_TITLE = '{tutor}, olha este produto para {pets}';

/** Campanha SÓ de link (decisão do dono, 16/11/2026): o link do produto é obrigatório e o toque abre sempre o produto na loja. */
export function ContentForm({ initial, onCreated }: {
  goals?: Goal[]; destinations?: Record<string, string>; initial: Draft; onCreated: (c: Campaign) => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const checkLink = async (urlArg?: string) => {
    const url = (urlArg ?? d.productUrl).trim();
    if (!url) return;
    setChecking(true); setLinkErr(null); setLink(null);
    try {
      const info = await call<LinkInfo>('/link-preview', { url }, { base: '/api/v1/admin/broadcast' });
      setLink(info);
      // Aproveita a oferta: só preenche o que ainda está vazio; nada digitado por você é sobrescrito.
      setD((x) => {
        const name = (info.title ?? x.productTitle).trim();
        return {
          ...x,
          productTitle: info.title ?? x.productTitle,
          title: x.title.trim() ? x.title : LINK_TITLE,
          message: x.message.trim() ? x.message : (name ? `${name.slice(0, 200)} — toque para ver.` : x.message),
          name: x.name.trim() ? x.name : name.slice(0, 120),
        };
      });
    } catch (e) { setLinkErr((e as Error).message); } finally { setChecking(false); }
  };

  const hasLink = d.productUrl.trim() !== '';
  const missing = !hasLink ? 'Cole o link do produto (com o seu afiliado).'
    : !link && !initial.productUrl ? 'Confira o link do produto antes de continuar.'
    : d.productTitle.trim().length < 2 ? 'Informe o nome do produto.'
    : d.name.trim().length < 3 ? 'Dê um nome à campanha (mínimo 3 letras).'
    : !d.message.trim() ? 'Escreva a mensagem principal.' : null;

  const save = async () => {
    if (busy) return;                       // clique duplicado: um pedido por vez
    setBusy(true); setErr(null);
    try {
      const c = await call<Campaign>('/campaigns', {
        name: d.name.trim(), message: d.message.trim(), title: d.title.trim() || null, goal: LINK_GOAL, destination: 'produto',
        product_url: d.productUrl.trim(), product_title: d.productTitle.trim(),
      });
      onCreated(c);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!missing) void save(); }}>
      <div className="rounded-xl border border-slate-200 p-3">
        <label className={label} htmlFor="cp-link">Link do produto: cole o link com o seu afiliado, o PETMOL não altera nada nele</label>
        <div className="flex gap-2">
          <input id="cp-link" className={input} inputMode="url" autoComplete="off" value={d.productUrl} placeholder="Cole o link (Amazon, Cobasi, Shopee, Mercado Livre…)"
            onPaste={(e) => { const t = e.clipboardData?.getData('text')?.trim(); if (t && /^https:\/\//i.test(t)) setTimeout(() => void checkLink(t), 0); }}
            onChange={(e) => { set({ productUrl: e.target.value }); setLink(null); setLinkErr(null); }} />
          <button type="button" disabled={checking || !hasLink} onClick={() => void checkLink()} className="shrink-0 rounded-lg bg-slate-800 px-3 text-[13px] font-bold text-white disabled:opacity-40">{checking ? 'Conferindo…' : 'Conferir'}</button>
        </div>
        {linkErr && <p role="alert" className="mt-2 text-[12.5px] text-rose-700">{linkErr}</p>}
        {link?.image && /^https:\/\//i.test(link.image) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={link.image} alt="" className="mt-2 h-20 w-20 rounded-lg border border-slate-200 object-contain" />
        )}
        {link && (
          <p className={`mt-2 text-[12.5px] leading-snug ${link.readable ? 'text-emerald-800' : 'text-amber-900'}`}>
            Loja reconhecida: <strong>{link.store}</strong>.{' '}
            {link.readable ? 'O nome do produto foi lido do link.'
              : 'Não foi possível ler o nome do produto agora. Isso não é um erro do link: ele continua exatamente como você colou. Digite o nome do produto abaixo.'}
          </p>
        )}
        {hasLink && (
          <div className="mt-2">
            <label className={label} htmlFor="cp-ptitle">Nome do produto</label>
            <input id="cp-ptitle" className={input} maxLength={160} value={d.productTitle} onChange={(e) => set({ productTitle: e.target.value })} />
          </div>
        )}
      </div>
      <div>
        <label className={label} htmlFor="cp-name">Nome da campanha (só para você identificar)</label>
        <input id="cp-name" className={input} maxLength={120} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Preenchido pelo nome do produto" />
      </div>
      <div>
        <label className={label} htmlFor="cp-title">Título</label>
        <input id="cp-title" className={input} maxLength={80} value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder={LINK_TITLE} />
      </div>
      <div>
        <label className={label} htmlFor="cp-msg">Mensagem principal</label>
        <textarea id="cp-msg" rows={3} maxLength={240} className={input} value={d.message} onChange={(e) => set({ message: e.target.value })} />
        <p className="mt-1 text-[11px] text-slate-500">{d.message.length}/240 · <code>{'{tutor}'}</code> e <code>{'{pets}'}</code> são trocados no envio pelo nome do tutor e dos pets dele.</p>
      </div>
      {(d.title.trim() || d.message.trim()) && (
        <div className="rounded-xl bg-slate-50 p-3" aria-label="Prévia do texto">
          <p className="text-[11px] font-bold uppercase text-slate-500">Como vai aparecer no celular (exemplo com “Ana” e o pet “Thor”)</p>
          <p className="text-[14px] font-bold text-slate-900">{exampleOf(d.title.trim() || LINK_TITLE)}</p>
          <p className="text-[13px] text-slate-700">{exampleOf(d.message)}</p>
          {(hasVariables(d.title) || hasVariables(d.message) || !d.title.trim()) && <p className="mt-1 text-[11.5px] text-slate-500">Cada tutor recebe com o próprio nome e os nomes dos pets dele.</p>}
        </div>
      )}
      <p data-testid="ao-tocar" className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-[13px] leading-snug text-emerald-900">
        Ao tocar na notificação, abre <strong>o produto direto na loja</strong>{link ? <> ({link.store})</> : null}, com o link exatamente como você colou.
      </p>
      {err && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-[13px] text-rose-800">{err}</p>}
      {missing && <p className="text-[12.5px] text-amber-800">{missing}</p>}
      <button type="submit" disabled={busy || !!missing} className="rounded-lg bg-sky-700 px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-40">{busy ? 'Salvando…' : 'Salvar campanha e continuar'}</button>
      <p className="text-[11.5px] text-slate-500">Salvar não envia nada. O envio só acontece depois da prévia e da confirmação, lote a lote.</p>
    </form>
  );
}

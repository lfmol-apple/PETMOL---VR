'use client';

/**
 * Radar de promoções (/admin/hoje): o PETMOL vigia as campanhas das lojas e AVISA O DONO (push, véspera e dia); aqui o dono
 * vê a lista, cadastra uma promoção que descobriu (sem deploy) e toca em "Preparar aviso" para preencher o envio.
 * Regra: só promoção verificada (a fonte fica registrada). Nada sai para os tutores sem o dono confirmar.
 */
import { useState } from 'react';
import { DateField } from '@/components/ui/DateField';
import { getToken } from '@/lib/auth-token';
import { localTodayISO } from '@/lib/localDate';
import { useAsync, Loading, ErrorBox } from '@/components/admin/sections/sections';

const API = '/api/v1/admin/store-promos';
const STORES: Array<{ id: string; name: string }> = [
  { id: 'petz', name: 'Petz' }, { id: 'mercadolivre', name: 'Mercado Livre' }, { id: 'cobasi', name: 'Cobasi' },
  { id: 'amazon', name: 'Amazon' }, { id: 'shopee', name: 'Shopee' },
];

interface PromoItem {
  id: string; name: string; merchants: string[]; merchantsLabel: string; detail: string;
  startsOn: string; endsOn: string; source: string;
}

async function call<T>(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data?.detail;
    throw new Error(typeof d === 'string' ? d : Array.isArray(d) && d[0]?.msg ? String(d[0].msg) : `Erro ${res.status}`);
  }
  return data as T;
}

const br = (iso: string) => iso.split('-').reverse().join('/');

export function phaseOf(p: Pick<PromoItem, 'startsOn' | 'endsOn'>, today: string): 'live' | 'soon' | 'later' | 'past' {
  if (today > p.endsOn) return 'past';
  if (today >= p.startsOn) return 'live';
  const days = Math.round((Date.parse(p.startsOn) - Date.parse(today)) / 86_400_000);
  return days <= 7 ? 'soon' : 'later';
}

const PHASE_LABEL = { live: 'No ar', soon: 'Em breve', later: 'Agendada', past: 'Encerrada' } as const;
const PHASE_CLS = {
  live: 'bg-emerald-100 text-emerald-800', soon: 'bg-amber-100 text-amber-800',
  later: 'bg-slate-100 text-slate-600', past: 'bg-slate-100 text-slate-400',
} as const;

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-900';
const label = 'mb-1 block text-[12px] font-bold text-slate-600';

export function PromoRadarPanel({ onPrepare }: { onPrepare: (promoId: string) => void }) {
  const [tick, setTick] = useState(0);
  const list = useAsync<{ promos: PromoItem[] }>(() => call('' ), [tick], { live: false });
  const today = localTodayISO();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [merchants, setMerchants] = useState<string[]>([]);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [detail, setDetail] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const canSave = name.trim().length >= 2 && merchants.length > 0 && !!startsOn && !!endsOn;

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await call('', 'POST', { name: name.trim(), merchants, detail: detail.trim(), starts_on: startsOn, ends_on: endsOn, source: source.trim() || null });
      setName(''); setMerchants([]); setStartsOn(''); setEndsOn(''); setDetail(''); setSource(''); setAdding(false);
      setTick((t) => t + 1);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true); setErr(null);
    try { await call(`/${id}`, 'DELETE'); setConfirmDel(null); setTick((t) => t + 1); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  if (list.loading && !list.data) return <Loading />;
  if (list.error || !list.data) return <ErrorBox msg={list.error} />;
  const promos = [...list.data.promos].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const open = promos.filter((p) => phaseOf(p, today) !== 'past');
  const past = promos.filter((p) => phaseOf(p, today) === 'past');

  return (
    <div className="space-y-3">
      {open.length === 0 && <p className="text-[13px] text-slate-500">Nenhuma campanha ativa ou agendada. Cadastre a próxima abaixo.</p>}
      <ul className="space-y-2">
        {open.map((p) => {
          const ph = phaseOf(p, today);
          return (
            <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-black text-slate-900">{p.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${PHASE_CLS[ph]}`}>{PHASE_LABEL[ph]}</span>
              </div>
              <p className="mt-0.5 text-[12px] text-slate-600">
                {p.merchantsLabel} · {p.startsOn === p.endsOn ? br(p.startsOn) : `${br(p.startsOn)} a ${br(p.endsOn)}`}
              </p>
              {p.detail && <p className="mt-0.5 text-[12px] text-slate-500">{p.detail}</p>}
              {p.source && <a href={p.source} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-[11px] text-[#0056D2] underline">fonte</a>}
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => onPrepare(p.id)}
                  className="rounded-lg bg-[#0056D2] px-3 py-1.5 text-[12.5px] font-bold text-white">Preparar aviso aos tutores</button>
                {confirmDel === p.id ? (
                  <button type="button" onClick={() => remove(p.id)} disabled={busy}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">Confirmar exclusão</button>
                ) : (
                  <button type="button" onClick={() => setConfirmDel(p.id)}
                    className="rounded-lg bg-rose-50 px-3 py-1.5 text-[12.5px] font-bold text-rose-600">Excluir</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {past.length > 0 && <p className="text-[11.5px] text-slate-400">{past.length} campanha{past.length === 1 ? '' : 's'} encerrada{past.length === 1 ? '' : 's'} (não aparecem para os tutores).</p>}

      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="rounded-lg border border-[#0056D2] px-3 py-2 text-[13px] font-bold text-[#0056D2]">
          + Cadastrar promoção
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div>
            <label className={label} htmlFor="pr-name">Nome da campanha (aparece no card)</label>
            <input id="pr-name" className={input} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Semana do Pet" />
          </div>
          <div>
            <p className={label}>Em quais lojas?</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-slate-700">
              {STORES.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={merchants.includes(s.id)}
                    onChange={(e) => setMerchants(e.target.checked ? [...merchants, s.id] : merchants.filter((m) => m !== s.id))} /> {s.name}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className={label} htmlFor="pr-start">Começa em</label><DateField id="pr-start" value={startsOn} onChange={setStartsOn} inputClassName={input} /></div>
            <div><label className={label} htmlFor="pr-end">Termina em</label><DateField id="pr-end" value={endsOn} min={startsOn} onChange={setEndsOn} inputClassName={input} /></div>
          </div>
          <div>
            <label className={label} htmlFor="pr-detail">Descrição curta (opcional)</label>
            <input id="pr-detail" className={input} maxLength={240} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Ex.: 10% em ração na Cobasi" />
          </div>
          <div>
            <label className={label} htmlFor="pr-source">Onde você viu (link, opcional)</label>
            <input id="pr-source" className={input} maxLength={300} value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://…" />
            <p className="mt-1 text-[11px] text-slate-500">Cadastre só promoção que você confirmou na loja: o chip aparece para todos os tutores.</p>
          </div>
          {err && <p className="rounded-lg bg-rose-50 p-2.5 text-[12.5px] text-rose-700">{err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy || !canSave}
              className="rounded-lg bg-[#0056D2] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40">Salvar promoção</button>
            <button type="button" onClick={() => { setAdding(false); setErr(null); }} className="rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-500">Cancelar</button>
          </div>
        </div>
      )}
      {!adding && err && <p className="rounded-lg bg-rose-50 p-2.5 text-[12.5px] text-rose-700">{err}</p>}
    </div>
  );
}

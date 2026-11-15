'use client';

/**
 * Produtos (internamente "cabinet") — lista livre, sem seções por categoria (o servidor classifica sozinho, nos bastidores); os produtos que o tutor usa no pet, de qualquer tipo, num só lugar.
 *  - Um único mecanismo (sem tela por categoria): busca no catálogo, código de barras ou nome livre.
 *  - A categoria é inferida do nome pelo servidor; o tutor não escolhe nada.
 *  - "Dura cerca de" é opcional; com ele o app mostra "Acaba em X dias" e destaca o "Ver onde comprar".
 *  - "Ver onde comprar" reaproveita a busca da Loja (catálogo e regras de loja existentes); nada de link montado aqui.
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScanBarcode, Search, Trash2 } from 'lucide-react';

import { SheetAvatar, SheetHeader, SheetSectionLabel, SheetShell, SHEET_Z } from '@/components/ui/sheet';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import { AffiliateCatalogSearch } from '@/features/commerce/AffiliateCatalogSearch';
import { searchAwinCatalog, type AwinSearchResult } from '@/features/commerce/productPricing';
import { identifyProductByBarcode } from '@/lib/productScanner';
import {
  addCabinetItem, deleteCabinetItem, fetchCabinet, updateCabinetItem,
  type CabinetItem, type CabinetItemInput,
} from '@/lib/cabinetApi';
import {
  CABINET_DURATIONS, cabinetStatusText, cabinetUrgency, sortCabinet,
} from '@/lib/cabinet';
import { petSpeciesEmoji } from '@/lib/petTaxonomy';

const StoreBarcodeScanner = dynamic(
  () => import('@/features/commerce/StoreBarcodeScanner').then((m) => ({ default: m.StoreBarcodeScanner })),
  { ssr: false },
);

interface Props {
  open: boolean;
  onClose: () => void;
  petId: string;
  petName: string;
  species: string;
  photoSrc?: string | null;
  /** Itens fixos da espécie (ex.: areia para gatos): aparecem sempre; ao escolher o prazo, viram um item normal com contagem. */
  staples?: { key: string; name: string; query: string }[];
}

interface Draft extends CabinetItemInput { name: string }

const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[14px] text-slate-900';

export function CabinetSheet({ open, onClose, petId, petName, species, photoSrc, staples = [] }: Props) {
  const [items, setItems] = useState<CabinetItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AwinSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [scanner, setScanner] = useState(false);
  const [buyFor, setBuyFor] = useState<{ name: string; query: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetchCabinet(petId).then((list) => { if (alive) setItems(list ?? []); });
    return () => { alive = false; };
  }, [open, petId]);

  // Sugestões do catálogo enquanto digita (só a partir de 3 letras; sem código de barras digitado).
  useEffect(() => {
    const q = query.trim();
    if (!adding || draft || q.length < 3 || /^\d{8,14}$/.test(q)) { setSuggestions([]); setSearching(false); return; }
    const mine = ++seq.current;
    setSearching(true);
    const t = setTimeout(() => {
      void searchAwinCatalog(q).then((r) => {
        if (mine !== seq.current) return;
        setSuggestions(r.slice(0, 6));
        setSearching(false);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [query, adding, draft]);

  const resetAdd = useCallback(() => {
    setAdding(false); setQuery(''); setSuggestions([]); setDraft(null); setDuration(null); setError(null);
  }, []);

  const pickSuggestion = (r: AwinSearchResult) => {
    setDraft({ name: r.title || query.trim(), brand: r.brand ?? null, gtin: /^\d{8,14}$/.test(r.gtin) ? r.gtin : null, image_url: r.image_url ?? null });
    setSuggestions([]);
  };

  const keepTyped = () => {
    const q = query.trim();
    if (q.length < 2) return;
    setDraft({ name: q });
    setSuggestions([]);
  };

  const onScanned = async (code: string) => {
    setScanner(false);
    setSearching(true);
    const p = await identifyProductByBarcode(code);
    setSearching(false);
    if (p.found && p.name) {
      setDraft({ name: p.name, brand: p.brand ?? null, gtin: /^\d{8,14}$/.test(code) ? code : null });
    } else {
      setQuery('');
      setError('Não achei esse código no catálogo. Digite o nome do produto.');
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true); setError(null);
    const r = await addCabinetItem(petId, { ...draft, duration_days: duration });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setItems((cur) => [r.data, ...(cur ?? []).filter((i) => i.id !== r.data.id)]);
    showAppToast(`${r.data.name} guardado em Produtos de ${petName}.`, { tone: 'success' });
    resetAdd();
  };

  const patch = async (item: CabinetItem, p: Parameters<typeof updateCabinetItem>[2], done?: string) => {
    setBusy(true);
    const r = await updateCabinetItem(petId, item.id, p);
    setBusy(false);
    if (!r.ok) { showAppToast(r.message, { tone: 'warning' }); return; }
    setItems((cur) => (cur ?? []).map((i) => (i.id === r.data.id ? r.data : i)));
    if (done) showAppToast(done, { tone: 'success' });
  };

  const saveStaple = async (st: { name: string }, days: number) => {
    setBusy(true);
    const r = await addCabinetItem(petId, { name: st.name, duration_days: days });
    setBusy(false);
    if (!r.ok) { showAppToast(r.message, { tone: 'warning' }); return; }
    setItems((cur) => [r.data, ...(cur ?? []).filter((i) => i.id !== r.data.id)]);
    showAppToast(`${st.name}: o app avisa quando estiver acabando.`, { tone: 'success' });
  };

  const remove = async (item: CabinetItem) => {
    setBusy(true);
    const r = await deleteCabinetItem(petId, item.id);
    setBusy(false);
    if (!r.ok) { showAppToast(r.message, { tone: 'warning' }); return; }
    setItems((cur) => (cur ?? []).filter((i) => i.id !== item.id));
  };

  const groups = useMemo(() => {
    const stapleNames = new Set(staples.map((x) => x.name.toLowerCase()));
    const stapleItems = (items ?? []).filter((i) => stapleNames.has(i.name.toLowerCase()));
    const sorted = sortCabinet((items ?? []).filter((i) => !stapleNames.has(i.name.toLowerCase())));
    const attention = sorted.filter((i) => ['soon', 'out'].includes(cabinetUrgency(i)));
    const rest = sorted.filter((i) => !attention.includes(i));
    return { attention, rest, stapleItems };
  }, [items, staples]);

  if (!open) return null;
  const empty = items !== null && items.length === 0;

  return (
    <>
      <SheetShell open onClose={onClose} hideHandle tone="grey" z={SHEET_Z.base}>
        <SheetHeader
          tone="petmol"
          withHandle
          title="Produtos"
          subtitle={petName}
          media={<SheetAvatar src={photoSrc} alt={petName} fallback={petSpeciesEmoji(species)} />}
          onClose={onClose}
        />
        <SheetShell.Body className="space-y-4">
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full rounded-2xl bg-[#0056D2] px-4 py-3 text-[15px] font-bold text-white shadow-md active:scale-[0.98]"
            >
              Guardar um produto
            </button>
          ) : (
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm" aria-label="Guardar produto">
              {!draft ? (
                <>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') keepTyped(); }}
                        placeholder="Nome do produto (ex.: gel dental)"
                        aria-label="Nome do produto"
                        className={`${inputCls} pl-9`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setScanner(true)}
                      aria-label="Ler código de barras"
                      className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 active:scale-95"
                    >
                      <ScanBarcode className="h-5 w-5" />
                    </button>
                  </div>
                  {searching && <p className="text-[12px] text-slate-500">Procurando…</p>}
                  {suggestions.length > 0 && (
                    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                      {suggestions.map((r) => (
                        <li key={`${r.gtin}-${r.merchant}`}>
                          <button type="button" onClick={() => pickSuggestion(r)} className="flex w-full items-center gap-3 bg-white px-3 py-2 text-left active:bg-slate-50">
                            {r.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.image_url} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-contain" loading="lazy" />
                            ) : <span className="h-10 w-10 flex-shrink-0 rounded-lg bg-slate-100" />}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-bold text-slate-900">{r.title}</span>
                              {r.brand && <span className="block truncate text-[11px] text-slate-500">{r.brand}</span>}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {query.trim().length >= 2 && (
                    <button type="button" onClick={keepTyped} className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-left text-[13px] font-semibold text-slate-700 active:bg-slate-50">
                      Guardar “{query.trim()}”
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <p className="text-[15px] font-bold text-slate-900">{draft.name}</p>
                    {draft.brand && <p className="text-[12px] text-slate-500">{draft.brand}</p>}
                  </div>
                  <div>
                    <p className="mb-1.5 text-[12px] font-bold text-slate-500">Dura cerca de (opcional)</p>
                    <DurationPicker value={duration} onPick={setDuration} toggle />
                    <p className="mt-1.5 text-[11px] text-slate-500">Com o prazo, o app avisa quando estiver acabando.</p>
                  </div>
                </>
              )}
              {error && <p role="alert" className="text-[12px] font-semibold text-rose-600">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={resetAdd} className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[14px] font-semibold text-slate-700 active:scale-[0.98]">Cancelar</button>
                {draft && (
                  <button type="button" disabled={busy} onClick={save} className="flex-1 rounded-xl bg-[#0056D2] px-3 py-2.5 text-[14px] font-bold text-white disabled:opacity-60 active:scale-[0.98]">
                    Guardar
                  </button>
                )}
              </div>
            </section>
          )}

          {items === null && <p className="py-6 text-center text-[13px] text-slate-500">Carregando…</p>}

          {empty && !adding && (
            <p className="rounded-2xl bg-white px-4 py-6 text-center text-[13px] text-slate-500">
              Guarde aqui o que {petName} usa: shampoo, gel dental, hidratante de patinhas, brinquedos…
            </p>
          )}

          {groups.attention.length > 0 && (
            <div className="space-y-2">
              <SheetSectionLabel>Acabando</SheetSectionLabel>
              {groups.attention.map((i) => (
                <CabinetRow key={i.id} item={i} busy={busy} onBuy={() => setBuyFor({ name: i.name, query: i.gtin || i.name })} onPatch={patch} onRemove={remove} />
              ))}
            </div>
          )}
          {staples.length > 0 && items !== null && (
            <div className="space-y-2">
              <SheetSectionLabel>Essenciais</SheetSectionLabel>
              {staples.map((st) => {
                const it = groups.stapleItems.find((i) => i.name.toLowerCase() === st.name.toLowerCase());
                if (it) return <CabinetRow key={st.key} item={it} busy={busy} onBuy={() => setBuyFor({ name: it.name, query: st.query })} onPatch={patch} onRemove={remove} />;
                return (
                  <article key={st.key} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="essencial-vazio">
                    <p className="text-[14px] font-bold text-slate-900">{st.name}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">Diga quanto dura e o app avisa quando estiver acabando.</p>
                    <div className="mt-2"><DurationPicker value={null} disabled={busy} onPick={(d) => { if (d) void saveStaple(st, d); }} /></div>
                    <button type="button" onClick={() => setBuyFor({ name: st.name, query: st.query })} className="mt-2.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13px] font-bold text-slate-700 active:scale-95">
                      Ver onde comprar
                    </button>
                  </article>
                );
              })}
            </div>
          )}
          {groups.rest.length > 0 && (
            <div className="space-y-2">
              {(groups.attention.length > 0 || staples.length > 0) && <SheetSectionLabel>Seus produtos</SheetSectionLabel>}
              {groups.rest.map((i) => (
                <CabinetRow key={i.id} item={i} busy={busy} onBuy={() => setBuyFor({ name: i.name, query: i.gtin || i.name })} onPatch={patch} onRemove={remove} />
              ))}
            </div>
          )}
        </SheetShell.Body>
      </SheetShell>

      {scanner && <StoreBarcodeScanner onClose={() => setScanner(false)} onDetected={(c) => void onScanned(c)} />}

      {buyFor && (
        <SheetShell open onClose={() => setBuyFor(null)} hideHandle tone="grey" z={SHEET_Z.nested}>
          <SheetHeader tone="petmol" withHandle title="Ver onde comprar" subtitle={buyFor.name} onClose={() => setBuyFor(null)} />
          <SheetShell.Body>
            <AffiliateCatalogSearch petId={petId} initialQuery={buyFor.query} />
          </SheetShell.Body>
        </SheetShell>
      )}
    </>
  );
}

function CabinetRow({
  item, busy, onBuy, onPatch, onRemove,
}: {
  item: CabinetItem;
  busy: boolean;
  onBuy: () => void;
  onPatch: (item: CabinetItem, p: Parameters<typeof updateCabinetItem>[2], done?: string) => void;
  onRemove: (item: CabinetItem) => void;
}) {
  const [more, setMore] = useState(false);
  const urgency = cabinetUrgency(item);
  const status = cabinetStatusText(item);
  const pill = urgency === 'out' ? 'bg-rose-100 text-rose-700' : urgency === 'soon' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
  const highlight = urgency === 'out' || urgency === 'soon';
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="cabinet-item">
      <div className="flex items-start gap-3">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt="" className="h-12 w-12 flex-shrink-0 rounded-lg object-contain" loading="lazy" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-snug text-slate-900">{item.name}</p>
          {item.brand && <p className="text-[12px] text-slate-500">{item.brand}</p>}
          {status && <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${pill}`}>{status}</span>}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onBuy}
          className={`rounded-xl px-3 py-2 text-[13px] font-bold active:scale-95 ${highlight ? 'bg-[#0056D2] text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
        >
          Ver onde comprar
        </button>
        {item.duration_days ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onPatch(item, { restarted_today: true }, 'Contagem reiniciada.')}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 active:scale-95"
          >
            Troquei por uma nova
          </button>
        ) : null}
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="rounded-xl px-2.5 py-2 text-[13px] font-semibold text-slate-500 active:scale-95">
          {more ? 'Fechar' : 'Mais'}
        </button>
      </div>
      {more && (
        <div className="mt-2.5 space-y-2.5 border-t border-slate-100 pt-2.5">
          <div>
            <p className="mb-1.5 text-[12px] font-bold text-slate-500">Dura cerca de</p>
            <DurationPicker
              value={item.duration_days ?? null}
              disabled={busy}
              onPick={(d) => { if (d) onPatch(item, { duration_days: d, restarted_today: !item.started_on }, 'Prazo salvo.'); }}
            />
            {item.duration_days ? (
              <button type="button" disabled={busy} onClick={() => onPatch(item, { clear_duration: true }, 'Prazo removido.')} className="mt-1.5 text-[12px] font-semibold text-slate-500">
                Sem prazo
              </button>
            ) : null}
          </div>
          <button type="button" disabled={busy} onClick={() => onRemove(item)} className="flex items-center gap-1.5 text-[13px] font-semibold text-rose-600">
            <Trash2 className="h-4 w-4" /> Remover
          </button>
        </div>
      )}
    </article>
  );
}

const UNITS = [{ id: 'dias', mult: 1 }, { id: 'semanas', mult: 7 }, { id: 'meses', mult: 30 }] as const;

/** Atalhos (15 dias, 1 mês…) + campo livre: o tutor coloca o tempo que quiser (1 a 730 dias). */
function DurationPicker({ value, onPick, disabled = false, toggle = false }: { value: number | null; onPick: (days: number | null) => void; disabled?: boolean; toggle?: boolean }) {
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<(typeof UNITS)[number]['id']>('dias');
  const mult = UNITS.find((u) => u.id === unit)!.mult;
  const n = Number(amount);
  const days = Math.round(n * mult);
  const valid = amount !== '' && Number.isFinite(n) && n > 0 && days >= 1 && days <= 730;
  const isPreset = value != null && CABINET_DURATIONS.some((d) => d.days === value);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Dura cerca de">
        {CABINET_DURATIONS.map((d) => (
          <button
            key={d.days}
            type="button"
            role="radio"
            aria-checked={value === d.days}
            disabled={disabled}
            onClick={() => onPick(toggle && value === d.days ? null : d.days)}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${value === d.days ? 'border-[#0056D2] bg-[#0056D2] text-white' : 'border-slate-300 bg-white text-slate-700'}`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-slate-500">Outro:</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Tempo que dura"
          placeholder="ex.: 45"
          className="w-20 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-[14px] text-slate-900"
        />
        <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} aria-label="Unidade" className="rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-[14px] text-slate-900">
          {UNITS.map((u) => <option key={u.id} value={u.id}>{u.id}</option>)}
        </select>
        <button
          type="button"
          disabled={disabled || !valid}
          onClick={() => { onPick(days); setAmount(''); }}
          className="rounded-xl bg-slate-800 px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-40 active:scale-95"
        >
          Usar
        </button>
      </div>
      {value != null && !isPreset && <p className="text-[12px] font-semibold text-[#0056D2]">Prazo atual: {value} dias</p>}
      {amount !== '' && !valid && <p className="text-[11px] text-rose-600">Use entre 1 dia e 2 anos.</p>}
    </div>
  );
}

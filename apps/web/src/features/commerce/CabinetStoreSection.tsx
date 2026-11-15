'use client';

import { cabinetSearchTerm, cabinetStatusText, cabinetUrgency, sortCabinet } from '@/lib/cabinet';
import type { CabinetItem } from '@/lib/cabinetApi';

/**
 * "Produtos de {pet}" dentro da Loja: o que o tutor guardou em Cuidados/Higiene → Produtos aparece aqui, com o prazo
 * quando existe, para comprar de novo. Só reaproveita a busca da Loja (nenhum link é montado aqui).
 */
export function CabinetStoreSection({
  items, petName, onBuy,
}: { items: CabinetItem[]; petName: string; onBuy: (query: string, item: CabinetItem) => void }) {
  if (items.length === 0) return null;
  const sorted = sortCabinet(items);
  return (
    <section aria-label={`Produtos de ${petName}`} className="space-y-2.5" data-testid="loja-produtos">
      <p className="px-0.5 text-[11px] font-bold uppercase tracking-[0.13em] text-slate-400">Produtos de {petName}</p>
      {sorted.map((i) => {
        const u = cabinetUrgency(i);
        const status = cabinetStatusText(i);
        const hot = u === 'soon' || u === 'out';
        return (
          <article key={i.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            {i.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={i.image_url} alt="" className="h-12 w-12 flex-shrink-0 rounded-lg object-contain" loading="lazy" />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold leading-snug text-slate-900">{i.name}</p>
              {status && (
                <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${u === 'out' ? 'bg-rose-100 text-rose-700' : u === 'soon' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                  {status}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onBuy(cabinetSearchTerm(i), i)}
              className={`flex-shrink-0 rounded-xl px-3 py-2 text-[13px] font-bold active:scale-95 ${hot ? 'bg-[#0056D2] text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
            >
              Comprar
            </button>
          </article>
        );
      })}
    </section>
  );
}

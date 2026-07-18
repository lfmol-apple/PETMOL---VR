'use client';

/**
 * PriceCompareList — mostra ofertas do ML ordenadas do menor para o maior preço.
 *
 * Recebe uma `query` já resolvida pelo componente pai (ex: "Royal Canin 15kg ração").
 * Quando o backend não retorna ofertas (provider desligado, sem resultado, erro),
 * faz fallback para os cards de HOME_SHOPPING_PARTNERS.
 */

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import {
  HOME_SHOPPING_PARTNERS,
  openHomeShoppingPartner,
} from '@/features/commerce/homeShoppingPartners';
import { trackPartnerClicked } from '@/lib/v1Metrics';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface PriceOffer {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  original_price: number | null;
  currency: string;
  url: string;
  image_url: string | null;
  in_stock: boolean;
  free_shipping: boolean;
  provider: string;
}

interface SearchResult {
  offers: PriceOffer[];
  best_total?: PriceOffer | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── Componente ────────────────────────────────────────────────────────────────

interface PriceCompareListProps {
  /** Query já montada pelo pai, ex: "Royal Canin Maxi 15kg ração" */
  query: string;
  petId?: string;
  /** Rótulo de fonte exibido acima da lista, ex: "Vermífugo" */
  label?: string;
}

type LoadState = 'idle' | 'loading' | 'done' | 'error';

export function PriceCompareList({ query, petId, label }: PriceCompareListProps) {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [offers, setOffers]       = useState<PriceOffer[]>([]);
  const [bestId, setBestId]       = useState<string | null>(null);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    setLoadState('loading');
    setOffers([]);
    setBestId(null);

    const params = new URLSearchParams({
      q: query,
      country: 'BR',
      currency: 'BRL',
      units: 'metric',
      limit: '8',
    });

    fetch(`${API_BASE_URL}/search?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: SearchResult) => {
        if (cancelled) return;
        const sorted = [...(data.offers ?? [])].sort(
          (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
        );
        setOffers(sorted);
        setBestId(data.best_total?.id ?? sorted[0]?.id ?? null);
        setLoadState('done');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });

    return () => { cancelled = true; };
  }, [query]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loadState === 'idle' || loadState === 'loading') {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-gray-100" />
        ))}
      </div>
    );
  }

  // ── Fallback para HOME_SHOPPING_PARTNERS ───────────────────────────────────
  if (loadState === 'error' || offers.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Onde comprar{label ? ` ${label}` : ''}
        </p>
        {HOME_SHOPPING_PARTNERS.map((partner) => (
          <button
            key={partner.id}
            type="button"
            onClick={() => {
              trackPartnerClicked({
                source: 'price_compare_fallback',
                partner: partner.id,
                pet_id: petId ?? null,
                control_type: null,
                product_name: null,
              });
              void openHomeShoppingPartner(partner.id);
            }}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-2xl bg-white hover:bg-gray-50 active:scale-[0.98] transition-all text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={partner.logoSrc}
              alt={partner.logoAlt}
              className="w-12 h-12 rounded-xl object-contain bg-white p-1.5 flex-shrink-0 shadow-sm border border-gray-100"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-gray-900 text-[15px] leading-tight truncate">{partner.name}</p>
              <p className="text-[12px] text-gray-500">{partner.description}</p>
            </div>
            <span className="text-sm font-bold text-blue-700">Abrir</span>
          </button>
        ))}
      </div>
    );
  }

  // ── Lista de ofertas ───────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
        {offers.length} {offers.length === 1 ? 'oferta encontrada' : 'ofertas encontradas'}
        {label ? ` · ${label}` : ''}
      </p>

      {offers.map((offer) => {
        const isBest = offer.id === bestId;
        const hasDiscount = offer.original_price != null && offer.original_price > offer.price;

        return (
          <a
            key={offer.id}
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              trackPartnerClicked({
                source: 'price_compare_ml',
                partner: 'mercadolivre',
                pet_id: petId ?? null,
                control_type: null,
                product_name: offer.name,
              });
            }}
            className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all active:scale-[0.98] text-left no-underline block
              ${isBest
                ? 'border-emerald-300 bg-emerald-50 shadow-sm shadow-emerald-100'
                : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
          >
            {/* Thumbnail */}
            {offer.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={offer.image_url}
                alt={offer.name}
                className="w-14 h-14 rounded-xl object-contain bg-white flex-shrink-0 border border-gray-100 p-1"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-2xl">🛒</div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-1.5 flex-wrap mb-0.5">
                {isBest && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-black leading-none flex-shrink-0">
                    Menor preço
                  </span>
                )}
                {offer.free_shipping && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] font-bold leading-none flex-shrink-0">
                    Frete grátis
                  </span>
                )}
              </div>
              <p className="text-[13px] font-semibold text-gray-800 leading-snug line-clamp-2">{offer.name}</p>
              {offer.brand && (
                <p className="text-[11px] text-gray-400 mt-0.5">{offer.brand}</p>
              )}
            </div>

            {/* Preço */}
            <div className="text-right flex-shrink-0">
              <p className={`text-[17px] font-black leading-tight ${isBest ? 'text-emerald-700' : 'text-gray-900'}`}>
                {fmtBRL(offer.price)}
              </p>
              {hasDiscount && (
                <p className="text-[11px] text-gray-400 line-through">{fmtBRL(offer.original_price!)}</p>
              )}
              <p className="text-[11px] font-semibold text-blue-600 mt-0.5">Ver oferta ›</p>
            </div>
          </a>
        );
      })}

      <p className="text-center text-[10px] text-gray-400 pt-1">
        PETMOL pode receber comissão. O preço não muda para você.
      </p>
    </div>
  );
}

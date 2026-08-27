'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ProductDetectionSheetGold } from '@/components/ProductDetectionSheet';
import { trackClick } from '@/lib/analytics/click';
import { identifyProductByBarcode, type ScannedProduct } from '@/lib/productScanner';
import { formatBRLPrice, fetchCommerceOffers, merchantLabel, offerPriceLabel, searchAwinCatalog, type AwinSearchResult, type CommerceOffer } from './productPricing';
import {
  HOME_SHOPPING_PARTNERS,
  type HomeShoppingPartnerId,
} from './homeShoppingPartners';

function merchantLogoSrc(merchant: string): string | null {
  return HOME_SHOPPING_PARTNERS.find((p) => p.id === merchant)?.logoSrc ?? null;
}

function MerchantLogo({ merchant }: { merchant: string }) {
  const src = merchantLogoSrc(merchant);
  if (!src) return null;
  return (
    <span className="w-5 h-5 rounded-md overflow-hidden bg-white border border-gray-100 flex-shrink-0 flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="w-full h-full object-contain" />
    </span>
  );
}

interface AffiliateCatalogSearchProps {
  petId: string;
  initialQuery?: string;
  merchantFilter?: HomeShoppingPartnerId;
}

type ResolvedOffers = CommerceOffer[] | 'loading' | 'error';
type BarcodeLookupState = 'idle' | 'loading' | 'done' | 'not_found' | 'error';

// Substitui o card estático "Cobasi" (Lojas) — em vez de só levar pro site
// de uma loja sem contexto, deixa o tutor achar o produto real dentro do
// catálogo já sincronizado da Awin e comprar direto. GTIN é o que falta pro
// app conseguir exercitar AwinFeedProvider (busca textual normal nunca
// envia GTIN — ver docs/AFFILIATES.md). Multi-loja por natureza: novas lojas
// Awin habilitadas aparecem aqui sem mudar este componente (offer_count > 1
// já monta o grid de preços).
//
// Oferta é resolvida assim que o resultado da busca chega (useEffect
// abaixo), não no toque em "Comprar" — descoberto com um tutor real num
// PWA instalado (iOS): resolver no clique obriga a navegação a acontecer
// depois de um `await`, e nesse contexto específico o clique deixa de se
// comportar como um link de verdade. Pré-resolvendo, "Comprar" vira um
// <a href target="_blank"> real (nunca window.open()/location.href via
// JS) — a navegação mais parecida possível com "tocar num link", que é
// o que as restrições do iOS pra apps instalados esperam. Para Cobasi via
// Awin, o backend agora troca o pclick por /commerce/awin-click: no clique
// real o backend resolve a Awin com UA desktop e entrega a URL Cobasi `/p`
// com `awc`, priorizando abrir produto web em vez do OneLink cair na home
// do app Cobasi.

export function AffiliateCatalogSearch({ petId, initialQuery = '', merchantFilter }: AffiliateCatalogSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  // Escanear/código de barras: ocultos por enquanto (feedback do tutor —
  // deixar só a busca por texto, maior e mais direta). Estado e handlers
  // continuam aqui prontos pra reativar rápido depois, só a UI some.
  const [barcode, setBarcode] = useState('');
  const [barcodeState, setBarcodeState] = useState<BarcodeLookupState>('idle');
  const [barcodeProduct, setBarcodeProduct] = useState<ScannedProduct | null>(null);
  const [barcodeOffers, setBarcodeOffers] = useState<ResolvedOffers | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [results, setResults] = useState<AwinSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [failedImageGtins, setFailedImageGtins] = useState<Set<string>>(new Set());
  const [offersByGtin, setOffersByGtin] = useState<Record<string, ResolvedOffers>>({});
  const [storeChoicesForGtin, setStoreChoicesForGtin] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRunRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const resolvingGtinsRef = useRef<Set<string>>(new Set());
  const trimmedQuery = query.trim();
  const activeMerchantFilter = merchantFilter ?? undefined;
  const visibleResults = results;

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery, merchantFilter]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      searchRunRef.current += 1;
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const runId = ++searchRunRef.current;
    debounceRef.current = setTimeout(async () => {
      const found = await searchAwinCatalog(trimmed, activeMerchantFilter);
      if (searchRunRef.current !== runId) return;
      setResults(found);
      setLoading(false);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (searchRunRef.current === runId) searchRunRef.current += 1;
    };
  }, [query, activeMerchantFilter]);

  function loadOffersForGtin(gtin: string) {
    const current = offersByGtin[gtin];
    if (current === 'loading' || Array.isArray(current) || resolvingGtinsRef.current.has(gtin)) return;

    resolvingGtinsRef.current.add(gtin);
    setOffersByGtin((prev) => ({ ...prev, [gtin]: 'loading' }));
    // Passa pelo commerce engine de verdade (GET /commerce/offers), mas
    // SEM texto de busca — só gtin. Isso mantém a compra monetizada por
    // identidade exata sem disparar busca textual externa para cada card.
    fetchCommerceOffers('', undefined, gtin)
      .then((offers) => setOffersByGtin((prev) => ({ ...prev, [gtin]: offers })))
      .catch(() => setOffersByGtin((prev) => ({ ...prev, [gtin]: 'error' })))
      .finally(() => {
        resolvingGtinsRef.current.delete(gtin);
      });
  }

  useEffect(() => {
    // Não resolva lojas para todos os 50 resultados de uma vez: no celular
    // isso deixava vários cards presos em "Buscando". Prefetch curto para
    // os primeiros resultados; os demais carregam sob demanda no toque.
    results.slice(0, 6).forEach((item) => loadOffersForGtin(item.gtin));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  function trackBuyClick(gtin: string, offer: CommerceOffer) {
    void trackClick({
      source: 'home',
      cta_type: 'shop_awin_search_buy',
      target: offer.merchant,
      link_type: offer.link_type,
      pet_id: petId,
      metadata: { gtin },
    });
    setStoreChoicesForGtin(null);
  }

  async function resolveBarcode(raw: string) {
    const gtin = raw.replace(/\D/g, '');
    if (!/^\d{8,14}$/.test(gtin)) {
      setBarcodeState('not_found');
      setBarcodeProduct(null);
      setBarcodeOffers(null);
      return;
    }

    setBarcode(gtin);
    setBarcodeState('loading');
    setBarcodeProduct(null);
    setBarcodeOffers('loading');
    try {
      const product = await identifyProductByBarcode(gtin);
      const queryForOffers = product.found ? product.name : '';
      const offers = await fetchCommerceOffers(queryForOffers, undefined, gtin);
      setBarcodeProduct(product.found ? product : { ...product, barcode: gtin });
      setBarcodeOffers(offers);
      setBarcodeState(product.found || offers.length > 0 ? 'done' : 'not_found');
      if (product.found && product.name) {
        setQuery(product.name);
      }
      void trackClick({
        source: 'home',
        cta_type: 'shop_barcode_lookup',
        link_type: 'direct',
        pet_id: petId,
        metadata: { gtin, found: product.found, offers: offers.length },
      });
    } catch {
      setBarcodeState('error');
      setBarcodeOffers('error');
    }
  }

  function renderOffersForBarcode() {
    if (barcodeState === 'idle') return null;
    const offers = Array.isArray(barcodeOffers) ? barcodeOffers : [];
    return (
      <div className="mt-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50 text-lg">▦</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-black uppercase tracking-wide text-slate-400">Resultado por código</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{barcode}</p>
            {barcodeProduct?.found && (
              <p className="mt-1 text-[13px] font-bold leading-tight text-gray-900">{barcodeProduct.name}</p>
            )}
            {barcodeProduct?.brand && <p className="mt-0.5 text-[11px] text-gray-400">{barcodeProduct.brand}</p>}
          </div>
        </div>

        {barcodeState === 'loading' && <p className="mt-3 text-[12px] text-gray-400">Buscando produto e ofertas...</p>}
        {barcodeState === 'error' && <p className="mt-3 text-[12px] text-amber-700">Não foi possível consultar esse código agora.</p>}
        {barcodeState === 'not_found' && (
          <p className="mt-3 text-[12px] text-gray-500">Ainda não encontramos esse código nas bases disponíveis.</p>
        )}

        {offers.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {offers.map((offer) => (
              offer.url ? (
                <a
                  key={`${barcode}:${offer.merchant}`}
                  href={offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackBuyClick(barcode, offer)}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 transition-all active:scale-[0.98]"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <MerchantLogo merchant={offer.merchant} />
                    <span className="text-[12px] font-bold text-gray-800 truncate">{merchantLabel(offer.merchant)}</span>
                  </span>
                  <span className="text-[12px] font-bold text-emerald-700 flex-shrink-0">{offerPriceLabel(offer)}</span>
                </a>
              ) : null
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Escanear código / código de barras manual: ocultos por enquanto
          (feedback do tutor) — só a busca por texto, maior e direta. */}
      <div className="sticky top-0 z-20 bg-white pb-2">
        <div className="relative">
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={(e) => {
            // font-size >= 16px evita o zoom automático do Safari iOS ao
            // focar um input (o que empurrava o campo pra fora da área
            // visível); scrollIntoView garante que ele fique acima do
            // teclado mesmo dentro de uma sheet/modal rolável.
            window.setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
          }}
          placeholder="Buscar produto..."
          className="w-full border-2 border-gray-200 rounded-2xl pl-12 pr-4 py-4 text-[16px] font-semibold text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 transition-colors"
        />
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">🔎</span>
        </div>
      </div>

      {scannerOpen && (
        <ProductDetectionSheetGold
          petId={petId}
          defaultMode="scan"
          onClose={() => setScannerOpen(false)}
          onProductConfirmed={(product) => {
            setScannerOpen(false);
            if (product.barcode) {
              void resolveBarcode(product.barcode);
            } else if (product.name) {
              setQuery(product.name);
            }
          }}
        />
      )}

      {loading && (
        <p className="text-[12px] text-gray-400 mt-2 px-1">Buscando...</p>
      )}

      {!loading && trimmedQuery.length >= 2 && results.length === 0 && (
        <p className="text-[12px] text-gray-400 mt-2 px-1">Nenhum produto encontrado para &quot;{query.trim()}&quot;.</p>
      )}

      {visibleResults.length > 0 && (
        <div className="mt-2.5 space-y-2.5">
          {visibleResults.map((item) => {
            const resolved = offersByGtin[item.gtin];
            const choosingStore = storeChoicesForGtin === item.gtin;
            const loadingStores = resolved === undefined || resolved === 'loading';
            const storeLoadError = resolved === 'error';
            const unavailable = Array.isArray(resolved) && resolved.length === 0;
            const offers = Array.isArray(resolved) ? resolved : [];
            const expectedStoreCount = Math.max(offers.length, item.offer_count || 0);
            const canOpen = expectedStoreCount > 0;
            const handleResultTap = () => {
              if (!canOpen) return;
              setStoreChoicesForGtin(choosingStore ? null : item.gtin);
              if (!Array.isArray(resolved)) loadOffersForGtin(item.gtin);
            };
            const handleResultKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              handleResultTap();
            };

            return (
              <div
                key={item.gtin}
                role={canOpen ? 'button' : undefined}
                tabIndex={canOpen ? 0 : undefined}
                onClick={canOpen ? handleResultTap : undefined}
                onKeyDown={canOpen ? handleResultKeyDown : undefined}
                className={`p-3 bg-white border border-gray-200 rounded-2xl shadow-sm transition-all ${canOpen ? 'cursor-pointer hover:border-emerald-200 active:scale-[0.99]' : ''}`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 flex-shrink-0 flex items-center justify-center">
                    {item.image_url && !failedImageGtins.has(item.gtin) ? (
                      <img
                        src={item.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={() => setFailedImageGtins((prev) => new Set(prev).add(item.gtin))}
                      />
                    ) : (
                      <span className="text-2xl">🛍️</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-gray-900 leading-tight line-clamp-2">{item.title}</p>
                    {typeof item.price === 'number' && (
                      <p className="text-[13px] font-bold text-emerald-700 mt-1">
                        {item.offer_count > 1 ? 'A partir de ' : ''}{formatBRLPrice(item.price)}
                        {item.offer_count > 1 && (
                          <span className="block mt-0.5 text-[10px] font-black uppercase tracking-wide text-blue-600 whitespace-nowrap">
                            {merchantLabel(item.merchant)} · +{item.offer_count - 1} loja{item.offer_count - 1 > 1 ? 's' : ''}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {canOpen ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleResultTap();
                      }}
                      className="flex-shrink-0 rounded-full bg-emerald-500 text-white text-[11px] font-bold px-3 py-1.5 active:scale-95 transition-all"
                    >
                      🛒 Lojas
                    </button>
                  ) : unavailable ? (
                    <span className="flex-shrink-0 rounded-full bg-gray-100 text-gray-400 text-[11px] font-bold px-3 py-1.5">
                      Sem loja
                    </span>
                  ) : (
                    <span className="flex-shrink-0 rounded-full bg-gray-100 text-gray-400 text-[11px] font-bold px-3 py-1.5">
                      Buscando
                    </span>
                  )}
                </div>

                {choosingStore && canOpen && (
                  <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-1.5">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-0.5">Escolha a loja</p>
                    {loadingStores && (
                      <p className="rounded-xl bg-gray-50 px-3 py-2 text-[12px] font-semibold text-gray-500">
                        Carregando lojas disponíveis...
                      </p>
                    )}
                    {storeLoadError && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          loadOffersForGtin(item.gtin);
                        }}
                        className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[12px] font-bold text-amber-800 active:scale-[0.98]"
                      >
                        Não carregou agora. Tocar para tentar novamente.
                      </button>
                    )}
                    {unavailable && (
                      <p className="rounded-xl bg-gray-50 px-3 py-2 text-[12px] font-semibold text-gray-500">
                        Nenhuma loja ativa retornou para este produto agora.
                      </p>
                    )}
                    {offers.map((offer) => (
                      offer.url ? (
                        <a
                          key={offer.merchant}
                          href={offer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => {
                            event.stopPropagation();
                            trackBuyClick(item.gtin, offer);
                          }}
                          className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-emerald-300 px-3 py-2 transition-all active:scale-[0.98]"
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <MerchantLogo merchant={offer.merchant} />
                            <span className="text-[12px] font-bold text-gray-800 truncate">{merchantLabel(offer.merchant)}</span>
                          </span>
                          <span className="text-[12px] font-bold text-emerald-700 flex-shrink-0">{offerPriceLabel(offer)}</span>
                        </a>
                      ) : null
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { ProductDetectionSheetGold } from '@/components/ProductDetectionSheet';
import { trackClick } from '@/lib/analytics/click';
import { identifyProductByBarcode, type ScannedProduct } from '@/lib/productScanner';
import { formatBRLPrice, fetchCommerceOffers, fetchPetzDirectLink, merchantLabel, offerPriceLabel, searchAwinCatalog, type AwinSearchResult, type CommerceOffer, type PetzDirectLink } from './productPricing';
import {
  HOME_SHOPPING_PARTNERS,
  openPetzPartnerStore,
  PETZ_COUPON_CODE,
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
  /**
   * Chamado quando a busca entra/sai do "modo ativo" (campo focado ou com
   * texto).
   */
  onActiveChange?: (active: boolean) => void;
  /**
   * 'inline' (padrão): campo + resultados no fluxo normal, para uso dentro
   * de sheets que já têm o próprio scroll (Vacina/Vermífugo/Medicação/Ração).
   * 'fill': o componente vira uma coluna flex que preenche o espaço do pai —
   * campo de busca FIXO no topo (não rola) e uma área de scroll própria
   * abaixo com os resultados; quando não há busca ativa, essa área mostra
   * `children` (ex.: "Comprar de novo" + lojas parceiras da Loja do pet).
   */
  layout?: 'inline' | 'fill';
  className?: string;
  children?: ReactNode;
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
// Awin, o backend entrega /commerce/awin-click e resolve o clique para a
// URL web final do produto com `awc`; isso evita o OneLink abrir a home/app
// da Cobasi em vez do produto.

export function AffiliateCatalogSearch({ petId, initialQuery = '', merchantFilter, onActiveChange, layout = 'inline', className, children }: AffiliateCatalogSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
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
  const [petzByGtin, setPetzByGtin] = useState<Record<string, PetzDirectLink | 'loading' | undefined>>({});
  const [storeChoicesForGtin, setStoreChoicesForGtin] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRunRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const resolvingGtinsRef = useRef<Set<string>>(new Set());
  const resolvingPetzGtinsRef = useRef<Set<string>>(new Set());
  const trimmedQuery = query.trim();
  const activeMerchantFilter = merchantFilter ?? undefined;
  const visibleResults = results;
  const searchActive = focused || trimmedQuery.length >= 2;

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery, merchantFilter]);

  useEffect(() => {
    onActiveChange?.(searchActive);
  }, [searchActive, onActiveChange]);

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

  function loadOffersForGtin(item: AwinSearchResult) {
    const gtin = item.gtin;
    const current = offersByGtin[gtin];
    if (current === 'loading' || Array.isArray(current) || resolvingGtinsRef.current.has(gtin)) return;

    resolvingGtinsRef.current.add(gtin);
    setOffersByGtin((prev) => ({ ...prev, [gtin]: 'loading' }));
    // Passa pelo commerce engine de verdade (GET /commerce/offers). Desde
    // 29/08/2026 a Cobasi só monetiza via busca ao vivo na VTEX
    // (CobasiProvider), nunca por GTIN puro via Awin (AWIN_SELLABLE_MERCHANTS
    // vazio — ver awin_advertisers.py) — sem um texto de busca aqui, a Cobasi
    // nunca aparecia no "Escolha a loja" mesmo quando o próprio card veio com
    // preço Cobasi do catálogo Awin. título+marca do resultado já buscado é
    // texto suficiente pra CobasiProvider re-resolver o mesmo produto.
    const searchQuery = [item.brand, item.title].filter(Boolean).join(' ').trim();
    fetchCommerceOffers(searchQuery, undefined, gtin)
      .then((offers) => setOffersByGtin((prev) => ({ ...prev, [gtin]: offers })))
      .catch(() => setOffersByGtin((prev) => ({ ...prev, [gtin]: 'error' })))
      .finally(() => {
        resolvingGtinsRef.current.delete(gtin);
      });
  }

  function loadPetzForGtin(item: AwinSearchResult) {
    const gtin = item.gtin;
    const current = petzByGtin[gtin];
    if (current === 'loading' || (typeof current === 'object' && current !== null) || resolvingPetzGtinsRef.current.has(gtin)) return;

    resolvingPetzGtinsRef.current.add(gtin);
    setPetzByGtin((prev) => ({ ...prev, [gtin]: 'loading' }));
    // Caminho DELIBERADAMENTE separado de fetchCommerceOffers (ver
    // docs/AFFILIATES.md §Petz) — sem preço, a Petz nunca entra na lista
    // de ofertas do CommerceEngine. Com o programa Parceiro Petz ativo,
    // "Ver na Petz" aparece pra qualquer produto: página do produto
    // confirmado quando existe, senão busca do site da Petz pelo nome.
    fetchPetzDirectLink(gtin, item.title ?? undefined)
      .then((link) => setPetzByGtin((prev) => ({ ...prev, [gtin]: link })))
      .finally(() => {
        resolvingPetzGtinsRef.current.delete(gtin);
      });
  }

  function loadStoresForGtin(item: AwinSearchResult) {
    loadOffersForGtin(item);
    loadPetzForGtin(item);
  }

  useEffect(() => {
    // Não resolva lojas para todos os 50 resultados de uma vez: no celular
    // isso deixava vários cards presos em "Buscando". Prefetch curto para
    // os primeiros resultados; os demais carregam sob demanda no toque.
    results.slice(0, 8).forEach((item) => loadStoresForGtin(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  function trackBuyClick(gtin: string, offer: CommerceOffer) {
    void trackClick({
      source: 'home',
      cta_type: 'shop_awin_search_buy',
      target: offer.merchant,
      link_type: offer.link_type,
      pet_id: petId,
      metadata: {
        merchant: offer.merchant,
        gtin,
        price_shown: typeof offer.price === 'number' && !offer.price_is_stale ? offer.price : null,
        link_type: offer.link_type,
        screen: 'loja',
        price_is_stale: Boolean(offer.price_is_stale),
      },
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
                  rel="noopener"
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

  // Campo de busca extraído — reaproveitado nos dois layouts (inline / fill).
  // Lupa em flex (não absoluta) — nunca encavala com o texto digitado.
  const searchField = (
    <label className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white pl-4 pr-3 shadow-[0_4px_16px_-6px_rgba(15,23,42,0.18)] transition-all duration-150 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-500/10">
          <Search className="h-[18px] w-[18px] flex-shrink-0 text-slate-400" strokeWidth={2.2} />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
            onFocus={(e) => {
              setFocused(true);
              // font-size >= 16px evita o zoom automático do Safari iOS. O
              // campo é sticky, então basta trazer o topo dele pra vista —
              // block:'start' (não 'center') mantém o que se digita no alto.
              window.setTimeout(() => e.target.scrollIntoView?.({ block: 'start', behavior: 'smooth' }), 200);
            }}
            onBlur={() => setFocused(false)}
            placeholder="Buscar produto..."
            className="min-w-0 flex-1 border-0 bg-transparent py-3.5 text-[16px] font-medium text-slate-900 outline-none placeholder:text-slate-400"
          />
        </label>
  );

  const scanner = scannerOpen ? (
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
  ) : null;

  const statusAndResults = (
    <>
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
            const petzResolved = petzByGtin[item.gtin];
            const choosingStore = storeChoicesForGtin === item.gtin;
            const offersLoading = resolved === undefined || resolved === 'loading';
            const petzLoading = petzResolved === undefined || petzResolved === 'loading';
            const loadingStores = offersLoading || petzLoading;
            const storeLoadError = resolved === 'error';
            const offers = Array.isArray(resolved) ? resolved : [];
            const hasPetz = Boolean(
              typeof petzResolved === 'object' && petzResolved !== null && petzResolved.available && petzResolved.url,
            );
            const unavailable = !loadingStores && !storeLoadError && offers.length === 0 && !hasPetz;
            const expectedStoreCount = Math.max(offers.length + (hasPetz ? 1 : 0), item.offer_count || 0);
            const canOpen = expectedStoreCount > 0 || hasPetz || loadingStores;
            // Assim que as ofertas resolvem, Cobasi/Shopee aparecem direto no
            // card — sem precisar tocar em "🛒 Lojas" (feedback do tutor).
            const storesResolved = Array.isArray(resolved);
            const inlineStores = storesResolved && (offers.length > 0 || hasPetz);
            const showStores = inlineStores || (choosingStore && canOpen);
            const canTapToExpand = canOpen && !inlineStores;
            const handleResultTap = () => {
              if (!canTapToExpand) return;
              setStoreChoicesForGtin(choosingStore ? null : item.gtin);
              if (!Array.isArray(resolved)) loadStoresForGtin(item);
            };
            const handleResultKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              handleResultTap();
            };

            return (
              <div
                key={item.gtin}
                role={canTapToExpand ? 'button' : undefined}
                tabIndex={canTapToExpand ? 0 : undefined}
                onClick={canTapToExpand ? handleResultTap : undefined}
                onKeyDown={canTapToExpand ? handleResultKeyDown : undefined}
                className={`p-3 bg-white rounded-2xl ring-1 ring-black/5 shadow-[0_4px_16px_-8px_rgba(15,23,42,0.18)] transition-all ${canTapToExpand ? 'cursor-pointer hover:ring-emerald-200 active:scale-[0.99]' : ''}`}
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

                  {inlineStores ? (
                    <span className="flex-shrink-0 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold px-3 py-1.5">
                      {offers.length + (hasPetz ? 1 : 0)} loja{offers.length + (hasPetz ? 1 : 0) > 1 ? 's' : ''}
                    </span>
                  ) : canOpen ? (
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

                {showStores && (
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
                          loadStoresForGtin(item);
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
                          rel="noopener"
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
                    {hasPetz && typeof petzResolved === 'object' && petzResolved && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openPetzPartnerStore({
                            productUrl: typeof petzResolved === 'object' ? petzResolved.direct_product_url : undefined,
                            searchUrl: typeof petzResolved === 'object' ? petzResolved.search_url : undefined,
                            productName: item.title ?? undefined,
                          });
                          setStoreChoicesForGtin(null);
                          void trackClick({
                            source: 'home',
                            cta_type: 'shop_awin_search_buy',
                            target: 'petz',
                            link_type: 'affiliate_store',
                            pet_id: petId,
                            metadata: {
                              merchant: 'petz',
                              gtin: item.gtin,
                              coupon: PETZ_COUPON_CODE,
                              destination_type: 'partner_store',
                              link_type: 'affiliate_store',
                              screen: 'loja',
                            },
                          });
                        }}
                        className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-blue-300 px-3 py-2 transition-all active:scale-[0.98]"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <MerchantLogo merchant="petz" />
                          <span className="text-[12px] font-bold text-gray-800 truncate">Petz</span>
                        </span>
                        <span className="text-[12px] font-bold text-blue-700 flex-shrink-0">Cupom -10%</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  // Layout 'fill' (Loja do pet): coluna flex que preenche o pai. Campo de
  // busca numa banda fixa que NUNCA rola; abaixo, uma área de scroll própria
  // com os resultados (durante a busca) ou `children` (Comprar de novo +
  // lojas parceiras) quando não há busca ativa.
  if (layout === 'fill') {
    return (
      <div className={`flex min-h-0 flex-col ${className ?? ''}`}>
        <div className="flex-shrink-0 border-b border-black/[0.06] bg-[#eef0f2]/70 px-5 pb-3 pt-1 backdrop-blur-xl">
          {searchField}
        </div>
        {scanner}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3.5">
          {searchActive ? (
            <>
              {statusAndResults}
              {!loading && trimmedQuery.length < 2 && (
                <p className="px-1 pt-1 text-[12px] text-slate-400">Digite o nome ou a marca do produto.</p>
              )}
            </>
          ) : (
            <div className="space-y-5">{children}</div>
          )}
        </div>
      </div>
    );
  }

  // Layout 'inline' (Vacina / Vermífugo / Medicação / Ração): campo sticky +
  // resultados no fluxo do scroll da sheet hospedeira.
  return (
    <div className={className}>
      {/* -mx-5/px-5 sangra até as bordas da sheet; blur + hairline dão a
          separação premium enquanto o tutor digita. */}
      <div className="sticky top-0 z-30 -mx-5 border-b border-black/[0.06] bg-[#fbfaf7]/90 px-5 pb-2.5 pt-2 backdrop-blur-2xl">
        {searchField}
      </div>
      {scanner}
      {statusAndResults}
    </div>
  );
}

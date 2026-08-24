'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ProductDetectionSheetGold } from '@/components/ProductDetectionSheet';
import { trackClick } from '@/lib/analytics/click';
import { identifyProductByBarcode, type ScannedProduct } from '@/lib/productScanner';
import { formatBRLPrice, fetchCommerceOffers, merchantLabel, offerPriceLabel, searchAwinCatalog, type AwinSearchResult, type CommerceOffer } from './productPricing';
import {
  HOME_SHOPPING_PARTNERS,
  navigateToPartnerUrl,
  openHomeShoppingPartner,
  partnerGenericLinkType,
  type HomeShoppingPartner,
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
// real ele resolve a Awin com user-agent desktop e redireciona direto para
// a URL web afiliada da Cobasi, sem expor o Safari iPhone ao OneLink
// AppsFlyer (`af_dp=appcobasi://`), que foi o salto que caía na home.
const TEXT_SEARCH_PARTNER_IDS: HomeShoppingPartnerId[] = ['cobasi', 'shopee', 'zeenow', 'zeedog'];

export function AffiliateCatalogSearch({ petId, initialQuery = '', merchantFilter }: AffiliateCatalogSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedTextMerchant, setSelectedTextMerchant] = useState<HomeShoppingPartnerId | null>(null);
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
  const trimmedQuery = query.trim();
  const activeMerchantFilter = merchantFilter ?? selectedTextMerchant ?? undefined;
  const textSearchPartners = TEXT_SEARCH_PARTNER_IDS
    .map((id) => HOME_SHOPPING_PARTNERS.find((partner) => partner.id === id))
    .filter((partner): partner is HomeShoppingPartner => Boolean(partner));

  useEffect(() => {
    setQuery(initialQuery);
    setSelectedTextMerchant(null);
  }, [initialQuery, merchantFilter]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const found = await searchAwinCatalog(trimmed, activeMerchantFilter);
      setResults(found);
      setLoading(false);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeMerchantFilter]);

  useEffect(() => {
    for (const item of results) {
      if (offersByGtin[item.gtin] !== undefined) continue;
      setOffersByGtin((prev) => ({ ...prev, [item.gtin]: 'loading' }));
      // Passa pelo commerce engine de verdade (GET /commerce/offers), mas
      // SEM texto de busca — só gtin. Descoberto testando: mandar o título
      // junto fazia o CobasiProvider rodar sua própria busca textual ao
      // vivo (imprecisa) em paralelo, e como a rota preferida é "awin",
      // isso não muda o vencedor, mas evita uma chamada redundante à API
      // da Cobasi. Só gtin faz o CobasiProvider nem tentar (sem query,
      // find_offer retorna cedo — ver cobasi_provider.py), deixando o
      // AwinFeedProvider resolver sozinho o produto certo. Já volta
      // deduplicado por loja — se mais de uma loja tiver o mesmo GTIN,
      // aqui é o grid de preços de verdade.
      fetchCommerceOffers('', undefined, item.gtin)
        .then((offers) => setOffersByGtin((prev) => ({ ...prev, [item.gtin]: offers })))
        .catch(() => setOffersByGtin((prev) => ({ ...prev, [item.gtin]: 'error' })));
    }
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

  function handleTextStoreSearch(partnerId: HomeShoppingPartnerId) {
    if (trimmedQuery.length < 2) return;
    if (partnerId === 'cobasi' || partnerId === 'zeenow' || partnerId === 'zeedog') {
      setSelectedTextMerchant(selectedTextMerchant === partnerId ? null : partnerId);
      setStoreChoicesForGtin(null);
      return;
    }
    const opened = openHomeShoppingPartner(partnerId, trimmedQuery);
    void trackClick({
      source: 'home',
      cta_type: 'shop_text_store_search',
      target: partnerId,
      link_type: opened ? partnerGenericLinkType(partnerId) : 'direct',
      pet_id: petId,
      metadata: { query: trimmedQuery, opened },
    });
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
      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-[12px] font-bold text-blue-800 active:scale-[0.98] transition-all"
        >
          📷 Escanear código
        </button>
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <input
            type="text"
            inputMode="numeric"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void resolveBarcode(barcode);
            }}
            placeholder="Código de barras"
            className="min-w-0 flex-1 bg-transparent px-2 text-[12px] font-semibold text-slate-800 placeholder-slate-400 outline-none"
          />
          <button
            type="button"
            onClick={() => void resolveBarcode(barcode)}
            className="rounded-lg bg-slate-900 px-2.5 text-[11px] font-bold text-white active:scale-95 transition-all"
          >
            OK
          </button>
        </div>
      </div>

      {renderOffersForBarcode()}

      <div className="relative mt-3">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedTextMerchant(null);
          }}
          placeholder="Buscar produto..."
          className="w-full border-2 border-gray-200 rounded-2xl pl-10 pr-4 py-3 text-[14px] text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 transition-colors"
        />
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[15px]">🔎</span>
      </div>

      {trimmedQuery.length >= 2 && !merchantFilter && (
        <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-2.5 shadow-sm">
          <p className="px-0.5 text-[10px] font-black uppercase tracking-wide text-gray-400">Escolha a loja</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {textSearchPartners.map((partner) => (
              <button
                key={partner.id}
                type="button"
                onClick={() => handleTextStoreSearch(partner.id)}
                className={`rounded-xl border px-3 py-2 text-left text-[12px] font-bold transition-all active:scale-[0.98] ${selectedTextMerchant === partner.id ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-emerald-300 hover:bg-white'}`}
              >
                {partner.name}
              </button>
            ))}
          </div>
        </div>
      )}

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

      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-[12px] text-gray-400 mt-2 px-1">Nenhum produto encontrado para &quot;{query.trim()}&quot;.</p>
      )}

      {results.length > 0 && (
        <div className="mt-2.5 space-y-2 max-h-72 overflow-y-auto">
          {results.map((item) => {
            const resolved = offersByGtin[item.gtin];
            const choosingStore = storeChoicesForGtin === item.gtin;
            const singleOffer = Array.isArray(resolved) && resolved.length === 1 ? resolved[0] : null;
            const multipleOffers = Array.isArray(resolved) && resolved.length > 1 ? resolved : null;
            const unavailable = Array.isArray(resolved) && resolved.length === 0;
            const canOpen = Boolean((singleOffer && singleOffer.url) || multipleOffers);
            const handleResultTap = () => {
              if (singleOffer?.url) {
                trackBuyClick(item.gtin, singleOffer);
                navigateToPartnerUrl(singleOffer.url);
                return;
              }
              if (multipleOffers) setStoreChoicesForGtin(choosingStore ? null : item.gtin);
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
                className={`p-2.5 bg-white border border-gray-200 rounded-2xl shadow-sm transition-all ${canOpen ? 'cursor-pointer hover:border-emerald-200 active:scale-[0.99]' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 flex-shrink-0 flex items-center justify-center">
                    {item.image_url && !failedImageGtins.has(item.gtin) ? (
                      <img
                        src={item.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={() => setFailedImageGtins((prev) => new Set(prev).add(item.gtin))}
                      />
                    ) : (
                      <span className="text-lg">🛍️</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-gray-900 leading-tight line-clamp-2">{item.title}</p>
                    {typeof item.price === 'number' && (
                      <p className="text-[12px] font-bold text-emerald-700 mt-0.5">
                        {item.offer_count > 1 ? 'A partir de ' : ''}{formatBRLPrice(item.price)}
                        {item.offer_count > 1 && (
                          <span className="block mt-0.5 text-[9px] font-black uppercase tracking-wide text-blue-600 whitespace-nowrap">
                            {merchantLabel(item.merchant)} · +{item.offer_count - 1} loja{item.offer_count - 1 > 1 ? 's' : ''}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {singleOffer && singleOffer.url ? (
                    // <a href target="_blank"> real — navegação nativa do
                    // navegador, sem JS entre o toque e a saída da página,
                    // sempre em aba nova (ver docstring do componente).
                    <a
                      href={singleOffer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => {
                        event.stopPropagation();
                        trackBuyClick(item.gtin, singleOffer);
                      }}
                      className="flex-shrink-0 rounded-full bg-emerald-500 text-white text-[11px] font-bold px-3 py-1.5 active:scale-95 transition-all"
                    >
                      🛒 Comprar
                    </a>
                  ) : multipleOffers ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setStoreChoicesForGtin(choosingStore ? null : item.gtin);
                      }}
                      className="flex-shrink-0 rounded-full bg-emerald-500 text-white text-[11px] font-bold px-3 py-1.5 active:scale-95 transition-all"
                    >
                      🛒 Comprar
                    </button>
                  ) : unavailable ? (
                    <span className="flex-shrink-0 rounded-full bg-gray-100 text-gray-400 text-[11px] font-bold px-3 py-1.5">
                      Indisponível
                    </span>
                  ) : (
                    <span className="flex-shrink-0 rounded-full bg-gray-100 text-gray-400 text-[11px] font-bold px-3 py-1.5">
                      ...
                    </span>
                  )}
                </div>

                {choosingStore && multipleOffers && (
                  <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-1.5">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-0.5">Escolha a loja</p>
                    {multipleOffers.map((offer) => (
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

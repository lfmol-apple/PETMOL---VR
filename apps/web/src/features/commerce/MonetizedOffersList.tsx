'use client';

/**
 * Lista de ofertas monetizáveis (preço real + link afiliado, ranqueadas
 * do menor pro maior preço) — usada em toda tela de "Comprar novamente"
 * (Loja do Pet, ficha da ração, ficha de antiparasitário). Uma única
 * fonte de verdade (useCommerceOffers/fetchCommerceOffers): nunca mostra
 * loja sem link afiliado ativo (Regra 1 — ver docs/AFFILIATES.md).
 *
 * Cobasi, Petz, Mercado Livre e Shopee são as lojas mantidas por enquanto.
 * Petz entra por um caminho paralelo e visualmente distinto (ver
 * PetzStorefrontCard abaixo) — storefront fixa + cupom, sem preço por
 * produto, nunca misturada na comparação de preço acima.
 */

import { useEffect, useState } from 'react';
import { fetchPetzDirectLink, formatBRLPrice, hasReliablePrice, merchantLabel, merchantLogoSrc, offerPriceLabel, type CommerceOffer, type PetzDirectLink } from './productPricing';
import {
  openPetzPartnerStore,
  navigateToPartnerUrl,
  PETZ_COUPON_CODE,
} from './homeShoppingPartners';
import { useCommerceOffers } from './useCommerceOffers';
import { trackClick } from '@/lib/analytics/click';
import { trackPartnerClicked } from '@/lib/v1Metrics';

export interface MonetizedOffersListProps {
  /** Texto de busca (marca/produto), mesma convenção usada nos lembretes. */
  query: string;
  /** Peso real do pacote (kg), quando aplicável — escolhe o SKU certo entre variantes de tamanho. */
  packageSizeKg?: number | null;
  /** GTIN/EAN real do produto, quando conhecido — permite resolver por
   * identidade exata (ex: AwinFeedProvider, que só resolve por GTIN, nunca
   * por texto) em vez de só a busca textual da Cobasi. */
  gtin?: string | null;
  petId: string;
  /** Nome exibido no card. */
  productLabel: string;
  icon?: string;
  /** Analytics: onde essa lista aparece (ex: 'food_sheet', 'parasite_sheet'). */
  source: string;
  /** Analytics: tipo de CTA do clique de compra (ex: 'food_buy_direct'). */
  ctaType: string;
  controlType?: string | null;
  /** Texto do estado vazio (nenhuma oferta encontrada) — default cobre o
   * caso genérico; telas com várias listas lado a lado (ex: medicações)
   * preferem algo mais curto como "Preço indisponível". */
  emptyStateTitle?: string;
  emptyStateSubtitle?: string;
}

export function MonetizedOffersList({
  query, packageSizeKg, gtin, petId, productLabel, icon = '🛒', source, ctaType, controlType,
  emptyStateTitle = 'Produto indisponível no momento',
  emptyStateSubtitle = 'Ainda não encontramos uma oferta ativa para este produto.',
}: MonetizedOffersListProps) {
  const { offers, loading } = useCommerceOffers(query, packageSizeKg, gtin);
  const [petzLink, setPetzLink] = useState<PetzDirectLink | null>(null);

  useEffect(() => {
    if (loading || offers.length === 0) return;
    offers.forEach((offer, index) => {
      void trackClick({
        source,
        cta_type: 'offer_viewed',
        target: offer.merchant,
        link_type: offer.link_type,
        pet_id: petId,
        metadata: {
          merchant: offer.merchant,
          gtin: gtin ?? undefined,
          price_shown: typeof offer.price === 'number' && !offer.price_is_stale ? offer.price : null,
          position: index + 1,
          link_type: offer.link_type,
          screen: source,
          price_is_stale: Boolean(offer.price_is_stale),
          offers_count: offers.length,
        },
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, offers]);

  // "Ver na Petz" — caminho deliberadamente separado das ofertas
  // monetizadas acima (ver productPricing.ts::fetchPetzDirectLink e
  // docs/AFFILIATES.md). Não bloqueia nem afeta o carregamento das
  // ofertas normais; falha em silêncio, igual ao resto do comércio.
  useEffect(() => {
    const petzName = query || productLabel;
    if (!gtin && !petzName) {
      setPetzLink(null);
      return;
    }
    let cancelled = false;
    // Sem GTIN ainda mostra "Ver na Petz" → busca da Petz pelo nome.
    void fetchPetzDirectLink(gtin ?? undefined, petzName).then((link) => {
      if (!cancelled) setPetzLink(link);
    });
    return () => {
      cancelled = true;
    };
  }, [gtin, query, productLabel]);

  function handleVerNaPetz() {
    if (!petzLink?.url) return;
    // Entra pela Loja Parceira (cookie petzPartner → atribuição garantida);
    // no web, se há URL real de produto confirmado, faz o two-hop e o
    // cliente cai no produto exato. Ver docs/PETZ_COMMISSION_VALIDATION.md.
    void openPetzPartnerStore({
      productUrl: petzLink.direct_product_url,
      searchUrl: petzLink.search_url,
      productName: productLabel,
    });
    void trackClick({
      source,
      cta_type: 'petz_direct_link_click',
      target: 'petz',
      link_type: 'affiliate_store',
      pet_id: petId,
      metadata: {
        monetization_mode: 'coupon_attribution_verified',
        destination_type: 'partner_store',
        coupon: PETZ_COUPON_CODE,
        product_gtin: gtin ?? undefined,
      },
    });
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-20 rounded-2xl bg-gray-100" />
      </div>
    );
  }

  function handleBuy(offer: CommerceOffer) {
    navigateToPartnerUrl(offer.url);
    void trackClick({
      source,
      cta_type: ctaType,
      target: offer.merchant,
      link_type: offer.link_type,
      pet_id: petId,
      metadata: {
        merchant: offer.merchant,
        gtin: gtin ?? undefined,
        price_shown: typeof offer.price === 'number' && !offer.price_is_stale ? offer.price : null,
        position: offers.findIndex((candidate) => candidate === offer) + 1,
        link_type: offer.link_type,
        screen: source,
        price_is_stale: Boolean(offer.price_is_stale),
      },
    });
    trackPartnerClicked({ source, partner: offer.merchant, pet_id: petId, control_type: controlType ?? null, product_name: productLabel });
  }

  if (offers.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm">
          <p className="text-[13px] font-bold text-gray-700">{emptyStateTitle}</p>
          <p className="mt-1 text-[12px] text-gray-500">{emptyStateSubtitle}</p>
        </div>
        <PetzStorefrontCard petzLink={petzLink} productLabel={productLabel} onClick={handleVerNaPetz} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {offers.length > 1 && (
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          {offers.length} ofertas encontradas
        </p>
      )}
      {offers.map((offer, index) => {
        const isBest = index === 0;
        const priceReliable = hasReliablePrice(offer);
        const hasDiscount = priceReliable && typeof offer.list_price === 'number' && offer.list_price > offer.price;
        const offerMerchantLabel = merchantLabel(offer.merchant);
        const offerLogoSrc = merchantLogoSrc(offer.merchant);
        const displayProductLabel = offer.canonical_name || offer.product_name || productLabel;

        return (
          <button
            type="button"
            key={`${offer.merchant}-${index}`}
            onClick={() => handleBuy(offer)}
            className={`w-full p-4 text-left bg-white border rounded-2xl shadow-sm transition-all active:scale-[0.99] hover:border-emerald-200 ${isBest ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200'}`}
          >
            <div className="flex items-center gap-3">
              {offerLogoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={offerLogoSrc} alt={offerMerchantLabel} className="w-9 h-9 rounded-lg object-contain border border-gray-100 flex-shrink-0 bg-white" />
              ) : (
                <span className="text-2xl flex-shrink-0">{icon}</span>
              )}
              <div className="flex-1 min-w-0">
                {isBest && offers.length > 1 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-black leading-none mb-0.5">
                    Menor preço
                  </span>
                )}
                <p className="font-bold text-gray-900 text-[15px] leading-tight truncate">{displayProductLabel}</p>
                <p className="text-[12px] text-gray-500">
                  {offerMerchantLabel}{offer.is_available === false ? ' · sob consulta' : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-[16px] font-black leading-tight ${isBest ? 'text-emerald-700' : 'text-gray-900'}`}>
                  {offerPriceLabel(offer)}
                </p>
                {hasDiscount && (
                  <p className="text-[11px] text-gray-400 line-through">{formatBRLPrice(offer.list_price as number)}</p>
                )}
              </div>
            </div>
            <span className="mt-2.5 flex w-full items-center justify-center rounded-xl bg-emerald-500 text-white text-[13px] font-bold py-2">
              🛒 Comprar
            </span>
          </button>
        );
      })}
      <p className="text-center text-[10px] text-gray-400 pt-1">
        Alguns links de compra podem gerar comissão para o PETMOL, sem custo adicional para você.
        {offers.some((offer) => offer.price_is_stale) ? ' *Preço confirmado ao abrir a loja.' : ''}
      </p>
      <PetzStorefrontCard petzLink={petzLink} productLabel={productLabel} onClick={handleVerNaPetz} />
    </div>
  );
}

/**
 * Card no mesmo formato visual dos cards de oferta acima, mas em azul (não
 * emerald) pra nunca parecer "a mesma comparação de preço" — a Petz não
 * tem preço por produto, só a storefront fixa + cupom PETTMOL (10% off,
 * aplicado manualmente no checkout — ver docs/AFFILIATES.md §Petz). Nunca
 * renderiza nada até o backend confirmar que o produto existe no catálogo
 * Petz (petzLink.available); some sozinho se a chamada falhar/demorar.
 */
function PetzStorefrontCard({ petzLink, productLabel, onClick }: { petzLink: PetzDirectLink | null; productLabel: string; onClick: () => void }) {
  if (!petzLink?.available || !petzLink.url) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full p-4 text-left bg-white border border-gray-200 rounded-2xl shadow-sm transition-all active:scale-[0.99] hover:border-blue-200"
    >
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/partner-logos/petz.png" alt="Petz" className="w-9 h-9 rounded-lg object-contain border border-gray-100 flex-shrink-0 bg-white" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-[15px] leading-tight truncate">{productLabel}</p>
          <p className="text-[12px] text-gray-500">Petz</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[13px] font-black leading-tight text-blue-700">Cupom PETTMOL</p>
          <p className="text-[11px] text-gray-500">10% off no checkout</p>
        </div>
      </div>
      <span className="mt-2.5 flex w-full items-center justify-center rounded-xl bg-blue-600 text-white text-[13px] font-bold py-2">
        Ver na Petz ↗
      </span>
      <p className="mt-1.5 text-center text-[11px] font-semibold text-blue-700">
        Aplique o cupom PETTMOL no carrinho antes de finalizar
      </p>
    </button>
  );
}

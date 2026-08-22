'use client';

/**
 * Lista de ofertas monetizáveis (preço real + link afiliado, ranqueadas
 * do menor pro maior preço) — usada em toda tela de "Comprar novamente"
 * (Loja do Pet, ficha da ração, ficha de antiparasitário). Uma única
 * fonte de verdade (useCommerceOffers/fetchCommerceOffers): nunca mostra
 * loja sem link afiliado ativo (Regra 1 — ver docs/AFFILIATES.md).
 *
 * Cobasi, Shopee, Zee Now e Zee Dog são as lojas mantidas por enquanto.
 */

import { formatBRLPrice, merchantLabel, type CommerceOffer } from './productPricing';
import {
  HOME_SHOPPING_PARTNERS,
  isPartnerVisibleForSearch,
  navigateToPartnerUrl,
  openHomeShoppingPartner,
  type HomeShoppingPartnerId,
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
}

export function MonetizedOffersList({
  query, packageSizeKg, gtin, petId, productLabel, icon = '🛒', source, ctaType, controlType,
}: MonetizedOffersListProps) {
  const { offers, loading } = useCommerceOffers(query, packageSizeKg, gtin);
  const merchantsWithExactOffer = new Set(offers.map((offer) => offer.merchant));
  const fallbackPartners = HOME_SHOPPING_PARTNERS
    .filter(isPartnerVisibleForSearch)
    .filter((partner) => !merchantsWithExactOffer.has(partner.id));
  const fallbackQuery = (query || productLabel || 'produto pet').trim();

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
      link_type: offer.link_type === 'affiliate_product' ? 'affiliate_product' : 'direct',
      pet_id: petId,
    });
    trackPartnerClicked({ source, partner: offer.merchant, pet_id: petId, control_type: controlType ?? null, product_name: productLabel });
  }

  function handleFallbackPartner(partnerId: HomeShoppingPartnerId) {
    openHomeShoppingPartner(partnerId, fallbackQuery);
    void trackClick({
      source,
      cta_type: `${ctaType}_store_search`,
      target: partnerId,
      link_type: 'direct',
      pet_id: petId,
      metadata: { product_name: productLabel, has_exact_offer: false },
    });
  }

  if (offers.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-center text-[13px] text-gray-500 py-4">
          Estamos buscando opções de compra para este produto.
        </p>
        {fallbackPartners.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="px-0.5 text-[10px] font-black uppercase tracking-wide text-gray-400">Buscar em lojas</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {fallbackPartners.map((partner) => (
                <button
                  key={partner.id}
                  type="button"
                  onClick={() => handleFallbackPartner(partner.id)}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left text-[12px] font-bold text-gray-700 transition-all hover:border-emerald-300 hover:bg-white active:scale-[0.98]"
                >
                  {partner.name}
                </button>
              ))}
            </div>
          </div>
        )}
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
        const hasDiscount = typeof offer.list_price === 'number' && offer.list_price > (offer.price ?? 0);
        const offerMerchantLabel = merchantLabel(offer.merchant);

        return (
          <button
            type="button"
            key={`${offer.merchant}-${index}`}
            onClick={() => handleBuy(offer)}
            className={`w-full p-4 text-left bg-white border rounded-2xl shadow-sm transition-all active:scale-[0.99] hover:border-emerald-200 ${isBest ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200'}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl flex-shrink-0">{icon}</span>
              <div className="flex-1 min-w-0">
                {isBest && offers.length > 1 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-black leading-none mb-0.5">
                    Menor preço
                  </span>
                )}
                <p className="font-bold text-gray-900 text-[15px] leading-tight truncate">{productLabel}</p>
                <p className="text-[12px] text-gray-500">
                  {offerMerchantLabel}{offer.is_available === false ? ' · sob consulta' : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                {typeof offer.price === 'number' && (
                  <p className={`text-[16px] font-black leading-tight ${isBest ? 'text-emerald-700' : 'text-gray-900'}`}>
                    {formatBRLPrice(offer.price)}
                  </p>
                )}
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
      {fallbackPartners.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <p className="px-0.5 text-[10px] font-black uppercase tracking-wide text-gray-400">Ver também em outras lojas</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {fallbackPartners.map((partner) => (
              <button
                key={partner.id}
                type="button"
                onClick={() => handleFallbackPartner(partner.id)}
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left text-[12px] font-bold text-gray-700 transition-all hover:border-emerald-300 hover:bg-white active:scale-[0.98]"
              >
                {partner.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-center text-[10px] text-gray-400 pt-1">
        Alguns links de compra podem gerar comissão para o PETMOL, sem custo adicional para você.
      </p>
    </div>
  );
}

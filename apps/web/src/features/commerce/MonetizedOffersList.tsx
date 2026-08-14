'use client';

/**
 * Lista de ofertas monetizáveis (preço real + link afiliado, ranqueadas
 * do menor pro maior preço) — usada em toda tela de "Comprar novamente"
 * (Loja do Pet, ficha da ração, ficha de antiparasitário). Uma única
 * fonte de verdade (useCommerceOffers/fetchCommerceOffers): nunca mostra
 * loja sem link afiliado ativo (Regra 1 — ver docs/AFFILIATES.md).
 *
 * Hoje só a Cobasi resolve (0 ou 1 oferta); a lista já está pronta para
 * quando Amazon/Shopee/ML/Petz entrarem — nenhuma tela precisa mudar.
 */

import { formatBRLPrice, type CommerceOffer } from './productPricing';
import { HOME_SHOPPING_PARTNERS, isPartnerVisibleForSearch, navigateToPartnerUrl } from './homeShoppingPartners';
import { buildAmazonSearchUrl } from './amazonAffiliate';
import { useCommerceOffers } from './useCommerceOffers';
import { trackClick } from '@/lib/analytics/click';
import { trackPartnerClicked } from '@/lib/v1Metrics';

const MERCHANT_LABELS: Record<string, string> = {
  cobasi: 'Cobasi',
};

// Mesma regra de visibilidade usada em "Lojas"/QuickBuyRow
// (isPartnerVisibleForSearch — active + afiliado configurado) — nunca uma
// checagem paralela que possa divergir em prod vs dev.
const AMAZON_PARTNER = HOME_SHOPPING_PARTNERS.find((p) => p.id === 'amazon');

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

  // AMAZON_PARTNER.affiliateStatus === 'active' hoje (tag real petmol-20,
  // cadastro fiscal/bancário concluído) — nunca passa por CommerceEngine
  // (que descarta oferta sem preço, ver commerce_provider.py): é sempre um
  // link de busca por nome de produto, nunca preço/imagem/nota da Amazon
  // (sem scraping, sem PA-API/Creators API ainda — ver docs/AFFILIATES.md).
  const showAmazonCard = Boolean(AMAZON_PARTNER) && isPartnerVisibleForSearch(AMAZON_PARTNER!) && query.trim().length > 0;
  const amazonUrl = showAmazonCard ? buildAmazonSearchUrl(query) : null;

  function handleAmazonClick() {
    void trackClick({
      source,
      cta_type: ctaType,
      target: 'amazon',
      link_type: 'affiliate_search',
      pet_id: petId,
    });
    trackPartnerClicked({ source, partner: 'amazon', pet_id: petId, control_type: controlType ?? null, product_name: productLabel });
    // Sem preventDefault — o <a href> abre o destino Amazon diretamente
    // depois do clique, trackClick nunca bloqueia a navegação (fire-and-forget).
  }

  if (offers.length === 0 && !amazonUrl) {
    return (
      <p className="text-center text-[13px] text-gray-500 py-4">
        Estamos buscando opções de compra para este produto.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {offers.length > 1 && (
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          {offers.length} ofertas encontradas
        </p>
      )}
      {offers.length === 0 && (
        <p className="text-center text-[13px] text-gray-500 py-1">
          Ainda sem oferta com preço pra este produto — consulte na Amazon abaixo.
        </p>
      )}
      {offers.map((offer, index) => {
        const isBest = index === 0;
        const hasDiscount = typeof offer.list_price === 'number' && offer.list_price > (offer.price ?? 0);
        const merchantLabel = MERCHANT_LABELS[offer.merchant] || offer.merchant;

        return (
          <div
            key={`${offer.merchant}-${index}`}
            className={`p-4 bg-white border rounded-2xl shadow-sm ${isBest ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200'}`}
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
                  {merchantLabel}{offer.is_available === false ? ' · sob consulta' : ''}
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
            <button
              type="button"
              onClick={() => handleBuy(offer)}
              className="mt-2.5 w-full rounded-xl bg-emerald-500 text-white text-[13px] font-bold py-2 active:scale-95 transition-all"
            >
              🛒 Comprar
            </button>
          </div>
        );
      })}
      {amazonUrl && (
        <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-2xl flex-shrink-0">📦</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-[15px] leading-tight truncate">{productLabel}</p>
              <p className="text-[12px] text-gray-500">Consulte o preço e a disponibilidade na loja</p>
            </div>
          </div>
          <a
            href={amazonUrl}
            target="_blank"
            rel="sponsored nofollow noopener noreferrer"
            onClick={handleAmazonClick}
            className="mt-2.5 flex items-center justify-center w-full rounded-xl bg-gray-900 text-white text-[13px] font-bold py-2 active:scale-95 transition-all"
          >
            Ver na Amazon
          </a>
        </div>
      )}
      <p className="text-center text-[10px] text-gray-400 pt-1">
        Alguns links de compra podem gerar comissão para o PETMOL, sem custo adicional para você.
        {amazonUrl && ' Como associado da Amazon, o PETMOL recebe por compras qualificadas.'}
      </p>
    </div>
  );
}

'use client';

/**
 * Card de oferta monetizável (preço real + link afiliado do MESMO produto,
 * casados por EAN em commerce_offers.py) — usado em toda tela de "Comprar
 * novamente" (Loja do Pet, ficha da ração, ficha de antiparasitário). Uma
 * única fonte de verdade: nunca mostra loja sem link afiliado ativo (Regra
 * 1 — ver docs/AFFILIATES.md), e a mesma query/peso reais mostram sempre a
 * mesma oferta em qualquer tela.
 */

import { useEffect, useState } from 'react';
import { fetchProductOffer, formatBRLPrice, type ProductOfferResult } from './productPricing';
import { navigateToPartnerUrl } from './homeShoppingPartners';
import { trackClick } from '@/lib/analytics/click';
import { trackPartnerClicked } from '@/lib/v1Metrics';

export interface MonetizedOfferCardProps {
  /** Texto de busca (marca/produto), mesma convenção usada nos lembretes. */
  query: string;
  /** Peso real do pacote (kg), quando aplicável — escolhe o SKU certo entre variantes de tamanho (ex: ração 2kg vs 7,5kg). */
  packageSizeKg?: number | null;
  petId: string;
  /** Nome exibido no card. */
  productLabel: string;
  icon?: string;
  /** Analytics: onde esse card aparece (ex: 'food_sheet', 'parasite_sheet'). */
  source: string;
  /** Analytics: tipo de CTA do clique de compra (ex: 'food_buy_direct'). */
  ctaType: string;
  controlType?: string | null;
}

export function MonetizedOfferCard({
  query, packageSizeKg, petId, productLabel, icon = '🛒', source, ctaType, controlType,
}: MonetizedOfferCardProps) {
  const [offer, setOffer] = useState<ProductOfferResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setOffer(null);
    fetchProductOffer(query, packageSizeKg ?? undefined).then((result) => {
      if (!cancelled) {
        setOffer(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [query, packageSizeKg]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-20 rounded-2xl bg-gray-100" />
      </div>
    );
  }

  const hasOffer = Boolean(offer?.found && typeof offer.price === 'number' && offer.url);
  if (!hasOffer || !offer) {
    return (
      <p className="text-center text-[13px] text-gray-500 py-4">
        Estamos buscando opções de compra para este produto.
      </p>
    );
  }

  const hasDiscount = typeof offer.list_price === 'number' && offer.list_price > (offer.price ?? 0);

  return (
    <div className="p-4 bg-white border border-emerald-200 rounded-2xl shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-2xl flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-[15px] leading-tight truncate">{productLabel}</p>
          <p className="text-[16px] mt-0.5 font-black text-emerald-700">
            {formatBRLPrice(offer.price as number)} na Cobasi
            {hasDiscount && (
              <span className="ml-1.5 text-[11px] font-semibold text-gray-400 line-through">{formatBRLPrice(offer.list_price as number)}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (offer.url) navigateToPartnerUrl(offer.url);
            void trackClick({
              source,
              cta_type: ctaType,
              target: offer.merchant,
              link_type: offer.link_type === 'affiliate_product' ? 'affiliate_product' : 'direct',
              pet_id: petId,
            });
            trackPartnerClicked({ source, partner: offer.merchant, pet_id: petId, control_type: controlType ?? null, product_name: productLabel });
          }}
          className="flex-shrink-0 rounded-full bg-emerald-500 text-white text-[13px] font-bold px-4 py-2 active:scale-95 transition-all"
        >
          🛒 Comprar
        </button>
      </div>
      <p className="text-center text-[10px] text-gray-400 pt-3">
        Alguns links de compra podem gerar comissão para o PETMOL, sem custo adicional para você.
      </p>
    </div>
  );
}

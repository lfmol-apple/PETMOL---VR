'use client';

import { useEffect, useMemo, useState } from 'react';
import { petDo } from '@/lib/petGender';
import { trackClick } from '@/lib/analytics/click';
import type { PetHealthProfile } from '@/lib/petHealth';
import type { PetCareReminder } from '@/lib/petCareDomain';
import {
  HOME_SHOPPING_PARTNERS,
  openHomeShoppingPartner,
  navigateToPartnerUrl,
  isPartnerVisibleInStoreArea,
  isPartnerVisibleForSearch,
  partnerHasAffiliate,
  type HomeShoppingPartner,
  type HomeShoppingPartnerId,
} from './homeShoppingPartners';
import { formatBRLPrice, type CommerceOffer } from './productPricing';
import { useCommerceOffers } from './useCommerceOffers';
import {
  buildReorderCards,
  STORE_CATEGORIES,
  buildStoreCategoryQuery,
  QUICK_BUY_PARTNERS,
  type ReorderCard,
  type StoreCategoryOption,
} from './petStoreContent';

interface HomeShoppingSheetProps {
  open: boolean;
  onClose: () => void;
  currentPet: PetHealthProfile;
  buyableReminders: PetCareReminder[];
}

// Tela enxuta de propósito: "Comprar novamente" (com preço real quando
// disponível) é a seção que importa de verdade — uma tela mais longa com
// categorias genéricas e promoções não-personalizadas só cansava o tutor
// antes de ele chegar no que interessa. Serviços fica de fora por enquanto.
export function HomeShoppingSheet({ open, onClose, currentPet, buyableReminders }: HomeShoppingSheetProps) {
  const [browsingPartner, setBrowsingPartner] = useState<HomeShoppingPartner | null>(null);
  // Nenhuma loja fixa por padrão: uma busca de verdade mostrou que uma loja
  // específica pode simplesmente não ter o produto (zero resultado). Em vez
  // de comprometer com uma só, tocar em "Comprar" expande esta escolha
  // rápida entre 3 pet shops — identificada pela mesma chave usada no card.
  const [quickBuyFor, setQuickBuyFor] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBrowsingPartner(null);
      setQuickBuyFor(null);
      return;
    }
    void trackClick({ source: 'home', cta_type: 'shop_sheet_view', pet_id: currentPet.pet_id });
  }, [open, currentPet.pet_id]);

  const reorderCards = useMemo(() => buildReorderCards(buyableReminders), [buyableReminders]);

  const visibleStorePartners = useMemo(
    () => HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleInStoreArea),
    [],
  );
  const visibleQuickBuyPartners = useMemo(
    () =>
      QUICK_BUY_PARTNERS
        .map((id) => HOME_SHOPPING_PARTNERS.find((p) => p.id === id))
        .filter((p): p is HomeShoppingPartner => Boolean(p) && isPartnerVisibleForSearch(p as HomeShoppingPartner)),
    [],
  );

  if (!open) return null;

  const petName = currentPet.pet_name;
  const title = petName ? `Loja ${petDo(currentPet)} ${petName}` : 'Loja do Pet';

  function handleQuickBuy(partnerId: HomeShoppingPartnerId, searchQuery: string, ctaType: string, metadata: Record<string, unknown>) {
    // Not closing the sheet here on purpose: if the tutor's phone keeps this
    // page suspended (rather than fully reloading it) while they're on the
    // partner site, coming back should still show Loja do Baby, not Home —
    // confirmed as a real complaint (tapping Comprar, going to Cobasi,
    // returning landed somewhere other than where they'd been).
    openHomeShoppingPartner(partnerId, searchQuery);
    void trackClick({
      source: 'home',
      cta_type: ctaType,
      target: partnerId,
      link_type: partnerHasAffiliate(partnerId) ? 'affiliate_search' : 'direct',
      pet_id: currentPet.pet_id,
      metadata,
    });
  }

  // Merchants com storefront afiliada fixa (ex: Cobasi Minha Loja/MAIS) não
  // têm parâmetro de busca na vitrine — abrir a categoria lá cairia sempre
  // no fallback sem afiliado. Para esses, tocar no card já abre a storefront
  // direto; os demais continuam no drill-down de categoria de sempre.
  function handlePartnerTap(partner: HomeShoppingPartner) {
    if (partner.storefrontAffiliateUrl) {
      navigateToPartnerUrl(partner.storefrontAffiliateUrl);
      void trackClick({
        source: 'home',
        cta_type: 'shop_storefront_click',
        target: partner.id,
        link_type: 'affiliate_store',
        pet_id: currentPet.pet_id,
      });
      return;
    }
    setBrowsingPartner(partner);
  }

  function handleStoreCategory(category: StoreCategoryOption) {
    if (!browsingPartner) return;
    const query = buildStoreCategoryQuery(category, currentPet.species);
    openHomeShoppingPartner(browsingPartner.id, query);
    void trackClick({
      source: 'home',
      cta_type: 'shop_partner_category_click',
      target: browsingPartner.id,
      link_type: partnerHasAffiliate(browsingPartner.id) ? 'affiliate_search' : 'direct',
      pet_id: currentPet.pet_id,
      metadata: { category: category.id },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl border border-gray-100 flex flex-col"
        style={{ maxHeight: '88dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-4 flex-shrink-0">
          {browsingPartner ? (
            <button
              type="button"
              onClick={() => setBrowsingPartner(null)}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 active:scale-90 transition-all flex-shrink-0"
              aria-label="Voltar"
            >
              <span className="text-lg">‹</span>
            </button>
          ) : (
            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-xl flex-shrink-0">🛒</div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-black text-gray-900 truncate">{browsingPartner ? browsingPartner.name : title}</h2>
            <p className="text-[12px] text-gray-400">{browsingPartner ? 'Escolha a categoria' : `Tudo que ${petName || 'seu pet'} usa`}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 active:scale-90 transition-all flex-shrink-0"
            aria-label="Fechar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto overscroll-contain flex-1 px-5 pb-8 space-y-5">
          {browsingPartner ? (
            <div className="grid grid-cols-2 gap-3">
              {STORE_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleStoreCategory(category)}
                  className="flex items-center gap-2.5 p-4 bg-white border border-gray-200 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 active:scale-[0.97] transition-all text-left shadow-sm"
                >
                  <span className="text-xl flex-shrink-0">{category.icon}</span>
                  <span className="text-[13px] font-bold text-gray-900 leading-tight">{category.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              {/* ❤️ Comprar novamente — sempre primeiro */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">❤️ Comprar novamente</p>
                {reorderCards.length > 0 ? (
                  <div className="space-y-2">
                    {reorderCards.map((card) => {
                      const pickerKey = `reorder:${card.id}`;
                      return (
                        <ReorderCardItem
                          key={card.id}
                          card={card}
                          isPickerOpen={quickBuyFor === pickerKey}
                          visibleQuickBuyPartners={visibleQuickBuyPartners}
                          onTogglePicker={() => setQuickBuyFor(quickBuyFor === pickerKey ? null : pickerKey)}
                          onQuickBuy={(partnerId) => handleQuickBuy(partnerId, card.searchQuery, 'shop_reorder_click', { domain: card.domain, label: card.label })}
                          onDirectBuy={(offer) => {
                            if (offer.url) navigateToPartnerUrl(offer.url);
                            void trackClick({
                              source: 'home',
                              cta_type: 'shop_reorder_buy_direct',
                              target: offer.merchant,
                              link_type: offer.link_type === 'affiliate_product' ? 'affiliate_product' : 'direct',
                              pet_id: currentPet.pet_id,
                              metadata: { domain: card.domain, label: card.label, price: offer.price },
                            });
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center">
                    <p className="text-[13px] text-gray-500">
                      Cadastre a ração ou o antiparasitário {petDo(currentPet)} {petName || 'pet'} para ver as recompras aqui.
                    </p>
                  </div>
                )}
              </div>

              {/* 🏪 Lojas */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">🏪 Lojas</p>
                <div className="grid grid-cols-2 gap-3">
                  {visibleStorePartners.map((partner) => (
                    <button
                      key={partner.id}
                      type="button"
                      onClick={() => handlePartnerTap(partner)}
                      className="flex flex-col items-center gap-2.5 p-4 bg-white border border-gray-200 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 active:scale-[0.97] transition-all text-center shadow-sm"
                    >
                      <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center bg-gray-50 border border-gray-100 flex-shrink-0 p-1.5">
                        <img
                          src={partner.logoSrc}
                          alt={partner.logoAlt}
                          className="w-full h-full object-contain"
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            const el = e.currentTarget as HTMLImageElement;
                            el.style.display = 'none';
                            const fallback = el.nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                        <span className="hidden w-full h-full items-center justify-center text-2xl">🏪</span>
                      </div>
                      <div className="w-full min-w-0">
                        <p className="text-[13px] font-bold text-gray-900 leading-tight line-clamp-1">{partner.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-center text-[10px] text-gray-400 pt-1">
                Alguns links de compra podem gerar comissão para o PETMOL, sem custo adicional para você.
                A disponibilidade, preço, pagamento e entrega são de responsabilidade da loja escolhida.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface ReorderCardItemProps {
  card: ReorderCard;
  isPickerOpen: boolean;
  visibleQuickBuyPartners: HomeShoppingPartner[];
  onTogglePicker: () => void;
  onQuickBuy: (partnerId: HomeShoppingPartnerId) => void;
  onDirectBuy: (offer: CommerceOffer) => void;
}

// Busca a lista de ofertas monetizáveis (mesma fonte usada em toda tela de
// "Comprar novamente" — ver useCommerceOffers/commerce_offers.py) ao
// montar. Lista vazia = nenhum caminho monetizável; em produção, nunca
// cai para a URL crua da Cobasi. Enquanto carrega ou sem oferta, cai no
// comportamento anterior (escolha entre lojas visíveis) — nunca trava a
// experiência esperando o provider responder.
function ReorderCardItem({ card, isPickerOpen, visibleQuickBuyPartners, onTogglePicker, onQuickBuy, onDirectBuy }: ReorderCardItemProps) {
  const { offers, loading } = useCommerceOffers(card.searchQuery, card.packageSizeKg);
  const offer = offers[0] ?? null;

  const hasMonetizedOffer = Boolean(offer && typeof offer.price === 'number' && offer.url);
  const hasDiscount = Boolean(
    hasMonetizedOffer && offer && typeof offer.list_price === 'number' && offer.list_price > (offer.price ?? 0),
  );
  const noBuyOptionAtAll = !hasMonetizedOffer && visibleQuickBuyPartners.length === 0;

  return (
    <div className={`p-3.5 bg-white border rounded-2xl shadow-sm ${hasDiscount ? 'border-orange-300' : 'border-gray-200'}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl flex-shrink-0">{card.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-bold text-gray-900 leading-tight truncate">{card.label}</p>
            {hasDiscount && (
              <span className="flex-shrink-0 rounded-full bg-orange-100 text-orange-700 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5">
                🔥 Oferta
              </span>
            )}
          </div>
          <p className={`text-[11px] mt-0.5 font-semibold ${card.urgencyTone === 'overdue' ? 'text-rose-600' : card.urgencyTone === 'today' ? 'text-amber-600' : 'text-gray-400'}`}>
            {card.urgencyText}
          </p>
          {loading && <p className="text-[10px] mt-1 text-gray-300">Buscando oferta...</p>}
          {!loading && hasMonetizedOffer && offer && (
            <p className="text-[12px] mt-1 font-bold text-emerald-700">
              {formatBRLPrice(offer.price as number)} na Cobasi
              {hasDiscount && (
                <span className="ml-1.5 text-[10px] font-semibold text-gray-400 line-through">{formatBRLPrice(offer.list_price as number)}</span>
              )}
            </p>
          )}
          {!loading && noBuyOptionAtAll && (
            <p className="text-[11px] mt-1 text-gray-400">Estamos buscando opções de compra para este produto.</p>
          )}
        </div>
        {!noBuyOptionAtAll && (
          <button
            type="button"
            disabled={loading}
            onClick={() => (hasMonetizedOffer && offer ? onDirectBuy(offer) : onTogglePicker())}
            className="flex-shrink-0 rounded-full bg-emerald-500 text-white text-[12px] font-bold px-3 py-1.5 active:scale-95 transition-all disabled:opacity-50"
          >
            🛒 Comprar
          </button>
        )}
      </div>
      {!hasMonetizedOffer && isPickerOpen && visibleQuickBuyPartners.length > 0 && (
        <QuickBuyRow partners={visibleQuickBuyPartners} onPick={onQuickBuy} />
      )}
    </div>
  );
}

function QuickBuyRow({ partners, onPick }: { partners: HomeShoppingPartner[]; onPick: (partnerId: HomeShoppingPartnerId) => void }) {
  return (
    <div className="mt-2.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
      {partners.map((partner) => (
        <button
          key={partner.id}
          type="button"
          onClick={() => onPick(partner.id)}
          className="flex-1 rounded-xl border border-gray-200 bg-gray-50 py-2 text-[12px] font-bold text-gray-700 hover:bg-white hover:border-emerald-300 active:scale-95 transition-all"
        >
          {partner.name}
        </button>
      ))}
    </div>
  );
}

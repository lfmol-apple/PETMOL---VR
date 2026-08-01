'use client';

import { useEffect, useMemo, useState } from 'react';
import { petDo } from '@/lib/petGender';
import { trackClick } from '@/lib/analytics/click';
import type { PetHealthProfile } from '@/lib/petHealth';
import type { PetCareReminder } from '@/lib/petCareDomain';
import { HOME_SHOPPING_PARTNERS, openHomeShoppingPartner, type HomeShoppingPartner, type HomeShoppingPartnerId } from './homeShoppingPartners';
import {
  buildReorderCards,
  buildRecommendedCategories,
  buildPromoDestinations,
  STORE_CATEGORIES,
  buildStoreCategoryQuery,
  buildServiceMapsUrl,
  SERVICE_CATEGORIES,
  type ReorderCard,
  type RecommendedCategory,
  type PromoDestination,
  type StoreCategoryOption,
  type ServiceCategory,
} from './petStoreContent';

interface HomeShoppingSheetProps {
  open: boolean;
  onClose: () => void;
  currentPet: PetHealthProfile;
  buyableReminders: PetCareReminder[];
}

// Loja padrão para os cliques de 1 toque (Recomendado/Promoções) — mesma
// lógica de fallback de homeShoppingPartners.resolvePartnerUrl garante que
// funciona mesmo sem afiliado configurado ainda.
const DEFAULT_PARTNER_ID: HomeShoppingPartnerId = 'petz';

export function HomeShoppingSheet({ open, onClose, currentPet, buyableReminders }: HomeShoppingSheetProps) {
  const [browsingPartner, setBrowsingPartner] = useState<HomeShoppingPartner | null>(null);

  useEffect(() => {
    if (!open) {
      setBrowsingPartner(null);
      return;
    }
    void trackClick({ source: 'home', cta_type: 'shop_sheet_view', pet_id: currentPet.pet_id });
  }, [open, currentPet.pet_id]);

  const reorderCards = useMemo(() => buildReorderCards(buyableReminders), [buyableReminders]);
  const recommended = useMemo(() => buildRecommendedCategories(currentPet), [currentPet]);
  const promos = useMemo(() => buildPromoDestinations(), []);

  if (!open) return null;

  const petName = currentPet.pet_name;
  const title = petName ? `Loja ${petDo(currentPet)} ${petName}` : 'Loja do Pet';

  function handleBuyReorder(card: ReorderCard) {
    onClose();
    openHomeShoppingPartner(card.partnerId, card.searchQuery);
    void trackClick({
      source: 'home',
      cta_type: 'shop_reorder_click',
      target: card.partnerId,
      pet_id: currentPet.pet_id,
      metadata: { domain: card.domain, label: card.label },
    });
  }

  function handleRecommended(cat: RecommendedCategory) {
    onClose();
    openHomeShoppingPartner(DEFAULT_PARTNER_ID, cat.searchQuery);
    void trackClick({
      source: 'home',
      cta_type: 'shop_recommendation_click',
      target: DEFAULT_PARTNER_ID,
      pet_id: currentPet.pet_id,
      metadata: { category: cat.id },
    });
  }

  function handlePromo(promo: PromoDestination) {
    onClose();
    openHomeShoppingPartner(DEFAULT_PARTNER_ID, promo.searchQuery);
    void trackClick({
      source: 'home',
      cta_type: 'shop_promo_click',
      target: DEFAULT_PARTNER_ID,
      pet_id: currentPet.pet_id,
      metadata: { promo: promo.id },
    });
  }

  function handleStoreCategory(category: StoreCategoryOption) {
    if (!browsingPartner) return;
    const query = buildStoreCategoryQuery(category, currentPet.species);
    onClose();
    openHomeShoppingPartner(browsingPartner.id, query);
    void trackClick({
      source: 'home',
      cta_type: 'shop_partner_category_click',
      target: browsingPartner.id,
      pet_id: currentPet.pet_id,
      metadata: { category: category.id },
    });
  }

  function handleService(service: ServiceCategory) {
    void trackClick({
      source: 'home',
      cta_type: 'shop_service_click',
      target: service.id,
      pet_id: currentPet.pet_id,
    });
    window.open(buildServiceMapsUrl(service), '_blank', 'noopener,noreferrer');
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
                    {reorderCards.map((card) => (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => handleBuyReorder(card)}
                        className="w-full flex items-center gap-3 p-3.5 bg-white border border-gray-200 rounded-2xl hover:border-rose-200 hover:bg-rose-50/30 active:scale-[0.98] transition-all text-left shadow-sm"
                      >
                        <span className="text-2xl flex-shrink-0">{card.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-gray-900 leading-tight truncate">{card.label}</p>
                          <p className={`text-[11px] mt-0.5 font-semibold ${card.urgencyTone === 'overdue' ? 'text-rose-600' : card.urgencyTone === 'today' ? 'text-amber-600' : 'text-gray-400'}`}>
                            {card.urgencyText}
                          </p>
                        </div>
                        <span className="flex-shrink-0 rounded-full bg-emerald-500 text-white text-[12px] font-bold px-3 py-1.5">
                          🛒 Comprar
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center">
                    <p className="text-[13px] text-gray-500">
                      Cadastre a ração ou o antiparasitário {petDo(currentPet)} {petName || 'pet'} para ver as recompras aqui.
                    </p>
                  </div>
                )}
              </div>

              {/* ⭐ Recomendado para o Baby */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">⭐ Recomendado para {petName || 'o pet'}</p>
                <div className="grid grid-cols-2 gap-3">
                  {recommended.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleRecommended(cat)}
                      className="flex items-center gap-2.5 p-4 bg-white border border-gray-200 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 active:scale-[0.97] transition-all text-left shadow-sm"
                    >
                      <span className="text-xl flex-shrink-0">{cat.icon}</span>
                      <span className="text-[13px] font-bold text-gray-900 leading-tight">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 🔥 Promoções */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">🔥 Promoções</p>
                <div className="space-y-2">
                  {promos.map((promo) => (
                    <button
                      key={promo.id}
                      type="button"
                      onClick={() => handlePromo(promo)}
                      className="w-full flex items-center gap-3 p-3.5 bg-white border border-gray-200 rounded-2xl hover:border-orange-200 hover:bg-orange-50/30 active:scale-[0.98] transition-all text-left shadow-sm"
                    >
                      <span className="text-2xl flex-shrink-0">{promo.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-gray-900 leading-tight">{promo.label}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{promo.description}</p>
                      </div>
                      <span className="flex-shrink-0 text-lg text-gray-300">›</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 🏪 Lojas */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">🏪 Lojas</p>
                <div className="grid grid-cols-2 gap-3">
                  {HOME_SHOPPING_PARTNERS.map((partner) => (
                    <button
                      key={partner.id}
                      type="button"
                      onClick={() => setBrowsingPartner(partner)}
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

              {/* ✂️ Serviços */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">✂️ Serviços</p>
                <div className="grid grid-cols-2 gap-3">
                  {SERVICE_CATEGORIES.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => handleService(service)}
                      className="flex items-center gap-2.5 p-4 bg-white border border-gray-200 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 active:scale-[0.97] transition-all text-left shadow-sm"
                    >
                      <span className="text-xl flex-shrink-0">{service.icon}</span>
                      <span className="text-[13px] font-bold text-gray-900 leading-tight">{service.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

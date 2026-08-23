'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { petDo } from '@/lib/petGender';
import { trackClick } from '@/lib/analytics/click';
import type { PetHealthProfile } from '@/lib/petHealth';
import type { PetCareReminder } from '@/lib/petCareDomain';
import {
  HOME_SHOPPING_PARTNERS,
  openHomeShoppingPartner,
  navigateToPartnerUrl,
  isPartnerVisibleForSearch,
  partnerHasAffiliate,
  type HomeShoppingPartner,
  type HomeShoppingPartnerId,
} from './homeShoppingPartners';
import { AffiliateCatalogSearch } from './AffiliateCatalogSearch';
import { formatBRLPrice, merchantLabel, type CommerceOffer } from './productPricing';
import { useCommerceOffers } from './useCommerceOffers';
import {
  buildReorderCards,
  buildPetStoreTitle,
  STORE_CATEGORIES,
  buildStoreCategoryQuery,
  QUICK_BUY_PARTNERS,
  type ReorderCard,
} from './petStoreContent';

interface HomeShoppingSheetProps {
  open: boolean;
  onClose: () => void;
  currentPet: PetHealthProfile;
  buyableReminders: PetCareReminder[];
}

// Ilustrações coloridas por categoria — mesmo estilo do card Alimentação
// (AppleControlButtons.tsx), pra "Explorar categorias" não parecer um menu
// de emojis. Cada categoria = STORE_CATEGORIES.id (petStoreContent.ts).
function CategoryIllustration({ categoryId, className }: { categoryId: string; className?: string }) {
  switch (categoryId) {
    case 'racao':
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <path d="M8 9.5c0-1 .3-1.7.9-2.2-.3-.7-.1-1.5.5-2 .7-.5 1.5-.4 2 .1.5-.5 1.3-.6 2-.1.6.5.8 1.3.5 2 .6.5.9 1.2.9 2.2v9.5a.8.8 0 0 1-.8.8H8.8a.8.8 0 0 1-.8-.8V9.5Z" fill="#C98A4B" stroke="#9C6530" strokeWidth="0.6" strokeLinejoin="round" />
          <path d="M8.6 9.3h6.8v2.4H8.6z" fill="#E8B27A" />
          <ellipse cx="12" cy="16" rx="1.2" ry="0.95" fill="#FBEFE0" opacity="0.9" />
          <circle cx="10.9" cy="14.3" r="0.5" fill="#FBEFE0" opacity="0.9" />
          <circle cx="11.9" cy="13.9" r="0.5" fill="#FBEFE0" opacity="0.9" />
          <circle cx="12.9" cy="14.1" r="0.5" fill="#FBEFE0" opacity="0.9" />
        </svg>
      );
    case 'petiscos':
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <rect x="6" y="8" width="12" height="11" rx="2.5" fill="#E3673C" stroke="#B24A26" strokeWidth="0.6" />
          <path d="M6 11h12" stroke="#B24A26" strokeWidth="0.6" />
          <circle cx="12" cy="15" r="2.4" fill="#FBD9C6" />
          <circle cx="12" cy="15" r="1.3" fill="#B24A26" />
        </svg>
      );
    case 'antipulgas':
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <path d="M12 4 6 6.5v5.2c0 4.3 2.6 6.8 6 8.3 3.4-1.5 6-4 6-8.3V6.5L12 4Z" fill="#4E8F5C" stroke="#3C7248" strokeWidth="0.6" strokeLinejoin="round" />
          <path d="m9.3 12 2 2 3.4-3.8" stroke="#EAF6EC" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'coleiras':
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <circle cx="12" cy="10.5" r="7" fill="none" stroke="#C98A4B" strokeWidth="2.2" />
          <path d="M12 17v2.3" stroke="#9C6530" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="12" cy="20.3" r="1.4" fill="#E3673C" stroke="#B24A26" strokeWidth="0.5" />
        </svg>
      );
    case 'brinquedos':
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <circle cx="12" cy="12" r="7.5" fill="#4A90D9" stroke="#2F6CB0" strokeWidth="0.6" />
          <ellipse cx="9" cy="9.5" rx="1.1" ry="0.9" fill="#FBEFE0" opacity="0.9" />
          <circle cx="7.6" cy="7.7" r="0.5" fill="#FBEFE0" opacity="0.9" />
          <circle cx="9" cy="7" r="0.5" fill="#FBEFE0" opacity="0.9" />
          <circle cx="10.4" cy="7.7" r="0.5" fill="#FBEFE0" opacity="0.9" />
          <path d="M13 13.5c1.2 1.6 2.8 2.4 4.4 2.1" stroke="#EAF3FB" strokeWidth="0.8" strokeLinecap="round" fill="none" />
        </svg>
      );
    case 'shampoos':
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <path d="M9.5 5h3v2.2h-3z" fill="#7CB6D9" />
          <rect x="8" y="7.2" width="6" height="1.6" fill="#4A90D9" />
          <rect x="7.5" y="8.8" width="7" height="10.7" rx="2" fill="#5FA6D6" stroke="#2F6CB0" strokeWidth="0.6" />
          <rect x="8" y="12" width="6" height="3" fill="#EAF3FB" opacity="0.85" />
        </svg>
      );
    default:
      return null;
  }
}

// Tela enxuta de propósito: "Comprar novamente" (com preço real quando
// disponível) é a seção que importa de verdade — uma tela mais longa com
// categorias genéricas e promoções não-personalizadas só cansava o tutor
// antes de ele chegar no que interessa. Serviços fica de fora por enquanto.
export function HomeShoppingSheet({ open, onClose, currentPet, buyableReminders }: HomeShoppingSheetProps) {
  const [quickBuyFor, setQuickBuyFor] = useState<string | null>(null);
  // Categoria tocada na grade "Explorar categorias" — mesma busca da Awin
  // (AffiliateCatalogSearch), só que já chega com a query pronta em vez do
  // tutor precisar digitar. Sufixo numérico força o useEffect de
  // initialQuery a disparar de novo mesmo tocando a mesma categoria duas
  // vezes seguidas (string igual não muda estado sozinha).
  const [categoryQuery, setCategoryQuery] = useState<string | null>(null);
  const [categoryQuerySeq, setCategoryQuerySeq] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuickBuyFor(null);
      setCategoryQuery(null);
      return;
    }
    void trackClick({ source: 'home', cta_type: 'shop_sheet_view', pet_id: currentPet.pet_id });
  }, [open, currentPet.pet_id]);

  const reorderCards = useMemo(() => buildReorderCards(buyableReminders), [buyableReminders]);

  const visibleQuickBuyPartners = useMemo(
    () =>
      QUICK_BUY_PARTNERS
        .map((id) => HOME_SHOPPING_PARTNERS.find((p) => p.id === id))
        .filter((p): p is HomeShoppingPartner => Boolean(p) && isPartnerVisibleForSearch(p as HomeShoppingPartner)),
    [],
  );

  if (!open) return null;

  const petName = currentPet.pet_name;
  const title = buildPetStoreTitle(currentPet);

  function handleQuickBuy(partnerId: HomeShoppingPartnerId, searchQuery: string, ctaType: string, metadata: Record<string, unknown>) {
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
          <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-xl flex-shrink-0">🛒</div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-black text-gray-900 truncate">{title}</h2>
            <p className="text-[12px] text-gray-400">Tudo que {petName || 'seu pet'} usa</p>
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

              {/* Explorar categorias — carrossel de círculos ilustrados, no
                  lugar da grade estática "🏪 Lojas" (que só levava pra home
                  de cada loja sem contexto nenhum). Tocar uma categoria
                  preenche a busca abaixo, igual ao padrão "escolha uma loja
                  → escolha uma categoria" que já existia por trás de cada
                  card de loja (STORE_CATEGORIES/buildStoreCategoryQuery) —
                  só que como ponto de entrada direto, sem precisar passar
                  por uma loja específica primeiro. */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Explorar categorias</p>
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-5 px-5">
                  {STORE_CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        setCategoryQuery(buildStoreCategoryQuery(category, currentPet.species));
                        setCategoryQuerySeq((n) => n + 1);
                        void trackClick({
                          source: 'home',
                          cta_type: 'shop_category_tap',
                          target: category.id,
                          link_type: 'affiliate_product',
                          pet_id: currentPet.pet_id,
                        });
                      }}
                      className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16 active:scale-95 transition-all"
                    >
                      <span className="w-14 h-14 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center shadow-sm">
                        <CategoryIllustration categoryId={category.id} className="w-8 h-8" />
                      </span>
                      <span className="text-[10px] font-bold text-gray-700 text-center leading-tight">{category.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 🐾 Buscar produtos — catálogo Awin sincronizado, no lugar
                  do ícone estático que só levava pro site sem contexto.
                  Multi-loja por natureza (ver AffiliateCatalogSearch.tsx) —
                  copy neutra para Cobasi, Zee Dog e próximas lojas. Key
                  muda a cada toque numa categoria acima pra remontar o
                  componente com a nova initialQuery, mesmo repetindo a
                  mesma categoria duas vezes seguidas. */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">🐾 Buscar produtos</p>
                <AffiliateCatalogSearch
                  key={`${categoryQuery ?? 'default'}-${categoryQuerySeq}`}
                  petId={currentPet.pet_id}
                  initialQuery={categoryQuery ?? ''}
                />
              </div>

              <p className="text-center text-[10px] text-gray-400 pt-1">
                Alguns links de compra podem gerar comissão para o PETMOL, sem custo adicional para você.
                A disponibilidade, preço, pagamento e entrega são de responsabilidade da loja escolhida.
              </p>
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
// montar. Se ainda não houver oferta exata, mantém a escolha rápida entre
// as lojas habilitadas, igual ao comportamento já validado em produção.
// Exportado pra ser reaproveitado fora desta sheet (ver
// MedicationItemSheet.tsx "onde comprar") — mesma lógica de preço/picker já
// validada aqui, sem duplicar useCommerceOffers numa segunda cópia.
export function ReorderCardItem({ card, isPickerOpen, visibleQuickBuyPartners, onTogglePicker, onQuickBuy, onDirectBuy }: ReorderCardItemProps) {
  const { offers, loading } = useCommerceOffers(card.searchQuery, card.packageSizeKg, card.gtin);
  const offer = offers[0] ?? null;
  const [imageFailed, setImageFailed] = useState(false);
  // Toda oferta na lista é o mesmo produto (mesmo GTIN) — só preço/loja
  // mudam. Nem toda loja tem imagem (Shopee/busca por palavra-chave ainda
  // não tem, só o feed Awin tem), então usa a primeira com imagem em vez
  // de travar na foto só da oferta mais barata.
  const imageUrl = offers.find((o) => o.image_url)?.image_url ?? null;
  // offers já vem ordenado por preço crescente (CommerceEngine) — offer é
  // sempre o mais barato. Quando mais de um provider responde pro mesmo
  // GTIN (ex: Cobasi + Shopee), oferece escolha de loja em vez de comprar
  // direto no mais barato sem avisar (ver OfferPickerRow abaixo).
  const hasMultipleOffers = offers.length > 1;

  const hasMonetizedOffer = Boolean(offer && typeof offer.price === 'number' && offer.url);
  const hasDiscount = Boolean(
    hasMonetizedOffer && offer && typeof offer.list_price === 'number' && offer.list_price > (offer.price ?? 0),
  );
  const noBuyOptionAtAll = !hasMonetizedOffer && visibleQuickBuyPartners.length === 0;
  const canAct = !loading && !noBuyOptionAtAll;

  function handlePrimaryAction() {
    if (!canAct) return;
    if (hasMonetizedOffer && offer) {
      if (hasMultipleOffers) onTogglePicker();
      else onDirectBuy(offer);
      return;
    }
    onTogglePicker();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handlePrimaryAction();
  }

  return (
    <div
      role={canAct ? 'button' : undefined}
      tabIndex={canAct ? 0 : undefined}
      onClick={handlePrimaryAction}
      onKeyDown={handleKeyDown}
      className={`p-3.5 bg-white border rounded-2xl shadow-sm transition-all ${canAct ? 'cursor-pointer active:scale-[0.99] hover:border-emerald-200' : ''} ${hasDiscount ? 'border-orange-300' : 'border-gray-200'}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
          {imageUrl && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-contain"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="w-5 h-5 rounded-md bg-gray-200" />
          )}
        </div>
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
            <p className="text-[12px] mt-1 font-bold text-emerald-700 flex items-center flex-wrap gap-x-1">
              <span>{hasMultipleOffers ? 'A partir de ' : ''}{formatBRLPrice(offer.price as number)} na</span>
              {(() => {
                const logoSrc = HOME_SHOPPING_PARTNERS.find((p) => p.id === offer.merchant)?.logoSrc;
                return logoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoSrc} alt="" className="w-3.5 h-3.5 rounded object-contain bg-white border border-emerald-100 inline-block" />
                ) : null;
              })()}
              <span>{merchantLabel(offer.merchant)}</span>
              {hasDiscount && (
                <span className="ml-1.5 text-[10px] font-semibold text-gray-400 line-through">{formatBRLPrice(offer.list_price as number)}</span>
              )}
              {hasMultipleOffers && (
                <span className="block mt-0.5 text-[9px] font-black uppercase tracking-wide text-blue-600">
                  +{offers.length - 1} loja{offers.length - 1 > 1 ? 's' : ''}
                </span>
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
            onClick={(event) => {
              event.stopPropagation();
              if (hasMonetizedOffer && offer) {
                if (hasMultipleOffers) onTogglePicker();
                else onDirectBuy(offer);
              } else {
                onTogglePicker();
              }
            }}
            className="flex-shrink-0 rounded-full bg-emerald-500 text-white text-[12px] font-bold px-3 py-1.5 active:scale-95 transition-all disabled:opacity-50"
          >
            🛒 Comprar
          </button>
        )}
      </div>
      {hasMonetizedOffer && hasMultipleOffers && isPickerOpen && (
        <OfferPickerRow offers={offers} onPick={onDirectBuy} />
      )}
      {!hasMonetizedOffer && isPickerOpen && visibleQuickBuyPartners.length > 0 && (
        <QuickBuyRow partners={visibleQuickBuyPartners} onPick={onQuickBuy} />
      )}
    </div>
  );
}

function OfferPickerRow({ offers, onPick }: { offers: CommerceOffer[]; onPick: (offer: CommerceOffer) => void }) {
  return (
    <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-0.5">Escolha a loja</p>
      {offers.map((offer) => (
        <button
          key={offer.merchant}
          type="button"
          onClick={() => onPick(offer)}
          className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-emerald-300 px-3 py-2 transition-all active:scale-[0.98]"
        >
          <span className="text-[12px] font-bold text-gray-800">{merchantLabel(offer.merchant)}</span>
          {typeof offer.price === 'number' && (
            <span className="text-[12px] font-bold text-emerald-700">{formatBRLPrice(offer.price)}</span>
          )}
        </button>
      ))}
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

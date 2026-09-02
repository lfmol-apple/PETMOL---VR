'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { useKeyboardSheetViewport } from '@/hooks/useKeyboardSheetViewport';
import { petO } from '@/lib/petGender';
import { SheetAvatar, SheetHeader } from '@/components/ui/sheet';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';
import { trackClick } from '@/lib/analytics/click';
import type { PetHealthProfile } from '@/lib/petHealth';
import type { PetCareReminder } from '@/lib/petCareDomain';
import {
  HOME_SHOPPING_PARTNERS,
  openHomeShoppingPartner,
  navigateToPartnerUrl,
  resolvePartnerUrl,
  openPetzPartnerStore,
  PETZ_COUPON_CODE,
  isPartnerVisibleForSearch,
  isPartnerVisibleInStoreArea,
  partnerGenericLinkType,
  type HomeShoppingPartner,
  type HomeShoppingPartnerId,
} from './homeShoppingPartners';
import { AffiliateCatalogSearch } from './AffiliateCatalogSearch';
import { fetchPetzDirectLink, formatBRLPrice, hasReliablePrice, merchantLabel, offerOriginLabel, offerPriceLabel, type CommerceOffer, type PetzDirectLink } from './productPricing';
import { useCommerceOffers } from './useCommerceOffers';
import {
  buildReorderCards,
  buildPetStoreTitle,
  QUICK_BUY_PARTNERS,
  type ReorderCard,
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
  const [quickBuyFor, setQuickBuyFor] = useState<string | null>(null);
  // Mantém a sheet colada ao viewport visível quando o teclado abre (busca) —
  // sem isso o campo de busca fica atrás do teclado no iOS.
  const kbViewportRef = useKeyboardSheetViewport(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  // iOS dispara um "ghost click" ~300ms depois do toque, na coordenada
  // original. Ao tocar no campo de busca o teclado sobe, a sheet encolhe/
  // sobe (items-end), e esse click atrasado cai no backdrop → a sheet
  // fechava sozinha e "voltava pra Home". Ignora o backdrop logo após um
  // foco dentro da sheet e enquanto um campo dela estiver focado.
  const lastFocusInsideAt = useRef(0);

  function handleBackdropClick() {
    if (Date.now() - lastFocusInsideAt.current < 800) return;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (active instanceof HTMLElement && sheetRef.current?.contains(active)) {
      active.blur();
      return;
    }
    onClose();
  }

  const reorderCards = useMemo(() => buildReorderCards(buyableReminders), [buyableReminders]);

  useEffect(() => {
    if (!open) {
      setQuickBuyFor(null);
      return;
    }
    void trackClick({ source: 'home', cta_type: 'shop_sheet_view', pet_id: currentPet.pet_id });
    void trackClick({ source: 'home', cta_type: 'store_opened', pet_id: currentPet.pet_id });
  }, [open, currentPet.pet_id]);

  const visibleStorePartners = useMemo(() => HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleInStoreArea), []);

  const visibleQuickBuyPartners = useMemo(
    () =>
      QUICK_BUY_PARTNERS
        .map((id) => HOME_SHOPPING_PARTNERS.find((p) => p.id === id))
        .filter((p): p is HomeShoppingPartner => Boolean(p) && isPartnerVisibleForSearch(p as HomeShoppingPartner)),
    [],
  );

  if (!open) return null;

  const petName = currentPet.pet_name;
  const petPhotoSrc = resolvePetPhotoUrl(currentPet.photo);
  const title = buildPetStoreTitle(currentPet);

  function handleQuickBuy(partnerId: HomeShoppingPartnerId, searchQuery: string, ctaType: string, metadata: Record<string, unknown>) {
    const opened = openHomeShoppingPartner(partnerId, searchQuery);
    void trackClick({
      source: 'home',
      cta_type: ctaType,
      target: partnerId,
      link_type: partnerGenericLinkType(partnerId),
      pet_id: currentPet.pet_id,
      metadata: { ...metadata, opened },
    });
  }

  function handleStorePartnerOpen(partner: HomeShoppingPartner) {
    // Card genérico de loja: abre a loja SEM busca pré-definida — o tutor
    // pesquisa livremente lá dentro (feedback do tutor).
    const url = resolvePartnerUrl(partner, '', '');
    void trackClick({
      source: 'home',
      cta_type: 'shop_partner_store_click',
      target: partner.id,
      link_type: partnerGenericLinkType(partner.id),
      pet_id: currentPet.pet_id,
      metadata: {
        opened: Boolean(url),
        surface: 'store_grid',
        search_query: null,
      },
    });
    if (!url) return;
    if (partner.id === 'petz') {
      void openPetzPartnerStore({});
      return;
    }
    navigateToPartnerUrl(url);
  }

  return (
    <div
      ref={kbViewportRef}
      className="fixed inset-x-0 top-0 z-50 flex items-end justify-center sm:px-4"
      style={{ height: '100dvh' }}
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-2xl" />

      <div
        ref={sheetRef}
        className="relative isolate flex w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-[#f5f6f8]/82 shadow-[0_-8px_60px_-6px_rgba(15,23,42,0.45)] ring-1 ring-white/40 backdrop-blur-2xl sm:mb-4 sm:rounded-[28px]"
        style={{ maxHeight: 'min(93dvh, 100%)' }}
        onClick={(e) => e.stopPropagation()}
        onFocusCapture={() => { lastFocusInsideAt.current = Date.now(); }}
      >
        {/* Cabeçalho petmol compartilhado — mesma variante usada nos demais
            sheets do pet (SheetHeader tone="petmol"). */}
        <SheetHeader
          tone="petmol"
          withHandle
          title={title}
          subtitle={`Tudo que ${petO(currentPet)} ${petName || 'seu pet'} precisa`}
          media={
            <SheetAvatar
              src={petPhotoSrc}
              alt={petName || 'Pet'}
              fallback={currentPet.species === 'cat' ? '🐱' : '🐶'}
            />
          }
          onClose={onClose}
        />

        {/* 🐾 Busca com o campo FIXO no topo (layout="fill"): a busca não rola
            junto com os produtos. Abaixo dela, uma área de scroll própria —
            resultados durante a busca, ou "Comprar de novo" + lojas parceiras
            quando não há busca ativa. */}
        <AffiliateCatalogSearch
          petId={currentPet.pet_id}
          layout="fill"
          className="min-h-0 flex-1"
        >
          {reorderCards.length > 0 && (
            <div>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.13em] text-slate-400">Comprar de novo</p>
              <div className="space-y-2.5">
                {reorderCards.map((card) => {
                  const pickerKey = `reorder:${card.id}`;
                  return (
                    <ReorderCardItem
                      key={card.id}
                      card={card}
                      isPickerOpen={quickBuyFor === pickerKey}
                      visibleQuickBuyPartners={visibleQuickBuyPartners}
                      onTogglePicker={() => setQuickBuyFor(quickBuyFor === pickerKey ? null : pickerKey)}
                      onQuickBuy={(partnerId) => handleQuickBuy(partnerId, card.searchQuery, 'shop_reorder_click', { domain: card.domain, gtin: card.gtin ?? undefined })}
                      onDirectBuy={(offer) => {
                        if (offer.url) navigateToPartnerUrl(offer.url);
                        void trackClick({
                          source: 'home',
                          cta_type: 'shop_reorder_buy_direct',
                          target: offer.merchant,
                          link_type: offer.link_type,
                          pet_id: currentPet.pet_id,
                          metadata: {
                            domain: card.domain,
                            merchant: offer.merchant,
                            gtin: card.gtin ?? undefined,
                            price_shown: typeof offer.price === 'number' && !offer.price_is_stale ? offer.price : null,
                            link_type: offer.link_type,
                            screen: 'loja',
                            price_is_stale: Boolean(offer.price_is_stale),
                          },
                        });
                      }}
                      onPetzBuy={(petzLink) => {
                        void openPetzPartnerStore({
                          productUrl: petzLink.direct_product_url,
                          searchUrl: petzLink.search_url,
                          productName: card.label,
                        });
                        void trackClick({
                          source: 'home',
                          cta_type: 'shop_reorder_buy_petz',
                          target: 'petz',
                          link_type: 'affiliate_store',
                          pet_id: currentPet.pet_id,
                          metadata: {
                            domain: card.domain,
                            merchant: 'petz',
                            monetization_mode: 'coupon_attribution_verified',
                            destination_type: 'partner_store',
                            coupon: PETZ_COUPON_CODE,
                            gtin: card.gtin ?? undefined,
                            link_type: 'affiliate_store',
                            screen: 'loja',
                          },
                        });
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <PartnerStoreGrid partners={visibleStorePartners} onOpen={handleStorePartnerOpen} />
        </AffiliateCatalogSearch>

        {/* Disclosure fixo — sempre visível, inclusive durante a busca. */}
        <p className="flex-shrink-0 border-t border-black/[0.06] bg-[#eef0f2]/60 px-5 py-2 text-center text-[10px] leading-snug text-slate-400">
          Alguns links de compra podem gerar comissão para o PETMOL, sem custo adicional para você.
          Disponibilidade, preço e entrega são responsabilidade da loja.
        </p>
      </div>
    </div>
  );
}

function PartnerStoreGrid({
  partners,
  onOpen,
}: {
  partners: HomeShoppingPartner[];
  onOpen: (partner: HomeShoppingPartner) => void;
}) {
  if (partners.length === 0) return null;

  return (
    <div>
      <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.13em] text-slate-400">Ou visite uma loja parceira</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {partners.map((partner) => (
          <button
            key={partner.id}
            type="button"
            onClick={() => onOpen(partner)}
            className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-[0_6px_22px_-8px_rgba(15,23,42,0.16)] transition-all duration-200 hover:border-emerald-200 hover:shadow-[0_10px_28px_-8px_rgba(15,23,42,0.22)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none"
          >
            <span className="flex h-[54px] w-[74px] items-center justify-center rounded-xl border border-slate-100 bg-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_12px_rgba(15,23,42,0.05)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={partner.logoSrc}
                alt=""
                className={`object-contain ${partnerLogoClassName(partner.id)}`}
                loading="lazy"
              />
            </span>
            <span className="text-[12px] font-extrabold text-slate-800">{partner.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function partnerLogoClassName(partnerId: HomeShoppingPartnerId): string {
  if (partnerId === 'mercadolivre') return 'max-h-8 w-[60px]';
  if (partnerId === 'shopee') return 'h-11 w-11';
  return 'h-11 w-11 rounded-[0.55rem]';
}

interface ReorderCardItemProps {
  card: ReorderCard;
  isPickerOpen: boolean;
  visibleQuickBuyPartners: HomeShoppingPartner[];
  onTogglePicker: () => void;
  onQuickBuy: (partnerId: HomeShoppingPartnerId) => void;
  onDirectBuy: (offer: CommerceOffer) => void;
  onPetzBuy: (petzLink: PetzDirectLink) => void;
}

// Busca a lista de ofertas monetizáveis (mesma fonte usada em toda tela de
// "Comprar novamente" — ver useCommerceOffers/commerce_offers.py) ao
// montar. Se ainda não houver oferta exata, mantém a escolha rápida entre
// as lojas habilitadas, igual ao comportamento já validado em produção.
// Exportado pra ser reaproveitado fora desta sheet (ver
// MedicationItemSheet.tsx "onde comprar") — mesma lógica de preço/picker já
// validada aqui, sem duplicar useCommerceOffers numa segunda cópia.
export function ReorderCardItem({ card, isPickerOpen, visibleQuickBuyPartners, onTogglePicker, onQuickBuy, onDirectBuy, onPetzBuy }: ReorderCardItemProps) {
  const { offers, loading } = useCommerceOffers(card.searchQuery, card.packageSizeKg, card.gtin);
  const offer = offers[0] ?? null;
  const [imageFailed, setImageFailed] = useState(false);
  const [petzLink, setPetzLink] = useState<PetzDirectLink | null>(null);

  // "Ver na Petz" — caminho separado de useCommerceOffers (sem preço por
  // produto, ver docs/AFFILIATES.md §Petz). Com o programa Parceiro Petz
  // ativo, aparece pra qualquer produto do card: página do produto
  // confirmado quando existe, senão busca do site da Petz pelo nome.
  useEffect(() => {
    const petzName = card.searchQuery || card.label;
    if (!card.gtin && !petzName) {
      setPetzLink(null);
      return;
    }
    let cancelled = false;
    // Sem GTIN ainda mostra "Ver na Petz" → busca da Petz pelo nome.
    void fetchPetzDirectLink(card.gtin ?? undefined, petzName).then((link) => {
      if (!cancelled) setPetzLink(link);
    });
    return () => {
      cancelled = true;
    };
  }, [card.gtin, card.label, card.searchQuery]);

  // Toda oferta na lista é o mesmo SKU físico — o GTIN da oferta pode ser
  // um EAN irmão do grupo (ver offerOriginLabel). Nem toda loja tem imagem
  // (Shopee/busca por palavra-chave ainda não tem, só o feed Awin tem),
  // então usa a primeira com imagem em vez de travar na foto só da mais barata.
  const imageUrl = offers.find((o) => o.image_url)?.image_url ?? null;
  const hasPetz = Boolean(petzLink?.available && petzLink.url);
  // offers já vem ordenado por preço crescente (CommerceEngine) — offer é
  // sempre o mais barato. Quando mais de uma opção de compra existe pro
  // mesmo GTIN (mais de um provider com preço, e/ou Petz confirmada),
  // oferece escolha de loja em vez de comprar direto sem avisar (ver
  // OfferPickerRow abaixo).
  const totalBuyOptions = offers.length + (hasPetz ? 1 : 0);
  const hasMultipleOffers = totalBuyOptions > 1;

  const hasMonetizedOffer = Boolean(offer && offer.url);
  const priceReliable = Boolean(offer && hasReliablePrice(offer));
  const hasDiscount = Boolean(
    hasMonetizedOffer && offer && priceReliable && typeof offer.list_price === 'number' && offer.list_price > (offer.price ?? 0),
  );
  const noBuyOptionAtAll = !hasMonetizedOffer && !hasPetz && visibleQuickBuyPartners.length === 0;
  const canAct = !loading && !noBuyOptionAtAll;
  const displayProductLabel = offer?.canonical_name || offer?.product_name || card.label;

  function handlePrimaryAction() {
    if (!canAct) return;
    if ((hasMonetizedOffer || hasPetz) && hasMultipleOffers) {
      onTogglePicker();
      return;
    }
    if (hasMonetizedOffer && offer) {
      onDirectBuy(offer);
      return;
    }
    if (hasPetz && petzLink?.url) {
      onPetzBuy(petzLink);
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
      className={`rounded-2xl border bg-white p-3 shadow-[0_6px_22px_-8px_rgba(15,23,42,0.18)] transition-all duration-200 motion-reduce:transition-none motion-reduce:transform-none ${canAct ? 'cursor-pointer hover:border-emerald-200 hover:shadow-[0_10px_28px_-8px_rgba(15,23,42,0.24)] active:scale-[0.99]' : ''} ${hasDiscount ? 'border-orange-200/90' : 'border-slate-200'}`}
    >
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 flex-shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50/80 p-1">
          {imageUrl && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-contain"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span aria-hidden className="text-lg opacity-70">{card.icon}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <p className="line-clamp-2 flex-1 text-[13.5px] font-bold leading-tight text-slate-950">
              {displayProductLabel}
            </p>
            {hasDiscount && (
              <span className="flex-shrink-0 inline-flex items-center rounded-full bg-orange-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-orange-700 ring-1 ring-orange-100">
                🔥 Oferta
              </span>
            )}
          </div>
          <p className={`mt-0.5 text-[11.5px] font-semibold leading-tight ${card.urgencyTone === 'overdue' ? 'text-rose-600' : card.urgencyTone === 'today' ? 'text-amber-600' : 'text-slate-500'}`}>
            {card.urgencyText}
          </p>
          {loading && <p className="mt-0.5 text-[11px] font-medium text-slate-400">Buscando melhor preço...</p>}
          {!loading && hasMonetizedOffer && offer && (
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[12px] font-bold leading-tight">
              <span className={priceReliable ? 'text-emerald-800' : 'text-emerald-700'}>
                {priceReliable
                  ? `${hasMultipleOffers ? 'A partir de ' : ''}${formatBRLPrice(offer.price as number)}`
                  : offerPriceLabel(offer)}
              </span>
              {priceReliable && <span className="text-emerald-700">· {merchantLabel(offer.merchant)}</span>}
              {hasDiscount && (
                <span className="text-[10px] font-semibold text-slate-400 line-through">{formatBRLPrice(offer.list_price as number)}</span>
              )}
              {priceReliable && hasMultipleOffers && totalBuyOptions - 1 > 0 && (
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-blue-600">
                  +{totalBuyOptions - 1} loja{totalBuyOptions - 1 > 1 ? 's' : ''}
                </span>
              )}
            </p>
          )}
          {!loading && hasMonetizedOffer && offer && offerOriginLabel(offer) && (
            <p className="mt-0.5 text-[10px] font-medium leading-tight text-slate-400">{offerOriginLabel(offer)}</p>
          )}
          {!loading && !hasMonetizedOffer && hasPetz && (
            <p className="mt-0.5 text-[12px] font-bold leading-tight text-blue-700">Disponível na Petz · cupom {PETZ_COUPON_CODE} -10%</p>
          )}
          {!loading && noBuyOptionAtAll && (
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">Buscando opções de compra...</p>
          )}
        </div>

        {!noBuyOptionAtAll && (
          <button
            type="button"
            disabled={loading}
            onClick={(event) => {
              event.stopPropagation();
              handlePrimaryAction();
            }}
            className="inline-flex min-h-[40px] flex-shrink-0 items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3.5 text-[12.5px] font-bold text-white shadow-[0_4px_14px_rgba(16,185,129,0.24)] transition-all duration-200 hover:bg-emerald-600 active:scale-95 disabled:opacity-50 motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            <span className="truncate">Comprar</span>
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {hasMultipleOffers && isPickerOpen && (
        <OfferPickerRow
          offers={offers}
          onPick={onDirectBuy}
          petzLink={hasPetz ? petzLink : null}
          onPickPetz={() => petzLink?.url && onPetzBuy(petzLink)}
        />
      )}
      {offers.some((item) => item.price_is_stale) && (
        <p className="mt-1.5 text-[9px] font-medium text-slate-400">*Preço confirmado ao abrir a loja.</p>
      )}
      {!hasMonetizedOffer && !hasPetz && isPickerOpen && visibleQuickBuyPartners.length > 0 && (
        <QuickBuyRow partners={visibleQuickBuyPartners} onPick={onQuickBuy} />
      )}
    </div>
  );
}

function OfferPickerRow({ offers, onPick, petzLink, onPickPetz }: {
  offers: CommerceOffer[];
  onPick: (offer: CommerceOffer) => void;
  petzLink?: PetzDirectLink | null;
  onPickPetz?: () => void;
}) {
  return (
    <div className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2.5" onClick={(e) => e.stopPropagation()}>
      <p className="px-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Escolha a loja</p>
      {offers.map((offer) => {
        const logoSrc = HOME_SHOPPING_PARTNERS.find((p) => p.id === offer.merchant)?.logoSrc;
        return (
          <button
            key={offer.merchant}
            type="button"
            onClick={() => onPick(offer)}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 transition-all duration-200 hover:border-emerald-200 hover:bg-white active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none"
          >
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              <span className="flex min-w-0 items-center gap-1.5">
                {logoSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoSrc} alt="" className="h-4 w-4 flex-shrink-0 rounded object-contain border border-slate-100 bg-white" />
                )}
                <span className="truncate text-[12px] font-bold text-slate-800">{merchantLabel(offer.merchant)}</span>
              </span>
              {offerOriginLabel(offer) && (
                <span className="truncate text-[9px] font-medium text-slate-400">{offerOriginLabel(offer)}</span>
              )}
            </span>
            <span className="flex-shrink-0 text-[12px] font-bold text-emerald-700">{offerPriceLabel(offer)}</span>
          </button>
        );
      })}
      {petzLink?.available && petzLink.url && onPickPetz && (
        <button
          type="button"
          onClick={onPickPetz}
          className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 transition-all duration-200 hover:border-blue-200 hover:bg-white active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/partner-logos/petz.png" alt="" className="h-4 w-4 flex-shrink-0 rounded object-contain border border-slate-100 bg-white" />
            <span className="truncate text-[12px] font-bold text-slate-800">Petz</span>
          </span>
          <span className="flex-shrink-0 text-[12px] font-bold text-blue-700">Cupom -10%</span>
        </button>
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
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200/70 bg-slate-50/70 px-2 text-[12px] font-bold text-slate-700 transition-all duration-200 hover:border-emerald-200 hover:bg-white active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={partner.logoSrc} alt="" className="h-4 w-4 flex-shrink-0 rounded object-contain border border-slate-100 bg-white" />
          <span className="truncate">{partner.name}</span>
        </button>
      ))}
    </div>
  );
}

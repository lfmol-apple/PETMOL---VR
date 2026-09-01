'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, ShoppingCart, X } from 'lucide-react';
import { petDo } from '@/lib/petGender';
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
import { fetchPetzDirectLink, formatBRLPrice, hasReliablePrice, merchantLabel, offerPriceLabel, type CommerceOffer, type PetzDirectLink } from './productPricing';
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

  const reorderCards = useMemo(() => buildReorderCards(buyableReminders), [buyableReminders]);

  // Preview de urgência no estado fechado — deriva dos lembretes já calculados
  // (têm `diff`), lidera pelo mais urgente. Ignora a sentinela de petisco.
  const { reorderUrgentTone, reorderScentLine } = useMemo(() => {
    const urgent = buyableReminders
      .filter((r) => ['food', 'parasite', 'medication'].includes(r.domain) && r.diff < 9000)
      .sort((a, b) => a.diff - b.diff);
    const lead = urgent[0];
    const tone: 'critical' | 'warning' | 'neutral' =
      !lead ? 'neutral' : lead.diff <= 0 ? 'critical' : lead.diff <= 7 ? 'warning' : 'neutral';

    let line: string | null = null;
    if (lead && lead.diff <= 14) {
      const name =
        lead.action_target === 'health/food'
          ? 'Ração'
          : lead.action_target === 'health/parasites/dewormer'
            ? 'Vermífugo'
            : lead.action_target === 'health/parasites/flea_tick'
              ? 'Antipulgas'
              : lead.action_target === 'health/parasites/collar'
                ? 'Coleira'
                : lead.action_target === 'health/medication'
                  ? 'Remédio'
                  : (lead.label || 'Item').slice(0, 18);
      const verb = lead.action_target === 'health/food' ? 'acaba' : 'vence';
      const when =
        lead.diff < 0
          ? lead.action_target === 'health/food' ? 'pode ter acabado' : `venceu há ${Math.abs(lead.diff)} dia${Math.abs(lead.diff) === 1 ? '' : 's'}`
          : lead.diff === 0
            ? `${verb} hoje`
            : `${verb} em ${lead.diff} dia${lead.diff === 1 ? '' : 's'}`;
      const extra = urgent.length > 1 ? ` · +${urgent.length - 1} item${urgent.length - 1 === 1 ? '' : 's'}` : '';
      line = `${name} ${when}${extra}`;
    }
    return { reorderUrgentTone: tone, reorderScentLine: line };
  }, [buyableReminders]);

  // Abre por padrão quando há produtos pra reabastecer — essa lista é o motivo
  // da tela existir e a fonte de comissão; esconder atrás de um toque era
  // justamente a fricção reclamada. Só fica fechada quando está vazia (aí o
  // texto de "cadastre a ração" não domina) ou quando o tutor recolheu na mão
  // (memória só da sessão — reabre no próximo acesso pra reancorar o hábito).
  const [reorderOpen, setReorderOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuickBuyFor(null);
      setReorderOpen(false);
      return;
    }
    setReorderOpen(reorderCards.length > 0);
    void trackClick({ source: 'home', cta_type: 'shop_sheet_view', pet_id: currentPet.pet_id });
    void trackClick({ source: 'home', cta_type: 'store_opened', pet_id: currentPet.pet_id });
  }, [open, currentPet.pet_id, reorderCards.length]);

  const toggleReorder = () => {
    setReorderOpen((value) => {
      const next = !value;
      void trackClick({
        source: 'home',
        cta_type: 'shop_reorder_toggle',
        pet_id: currentPet.pet_id,
        metadata: { open: next, card_count: reorderCards.length, urgency: reorderUrgentTone },
      });
      return next;
    });
  };
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
    const searchQuery = 'produtos pet';
    const url = resolvePartnerUrl(partner, searchQuery, '');
    void trackClick({
      source: 'home',
      cta_type: 'shop_partner_store_click',
      target: partner.id,
      link_type: partnerGenericLinkType(partner.id),
      pet_id: currentPet.pet_id,
      metadata: {
        opened: Boolean(url),
        surface: 'store_grid',
        search_query: searchQuery,
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

      <div
        className="relative w-full max-w-md overflow-hidden rounded-t-[24px] border border-white/70 bg-[#fbfaf7] shadow-[0_-12px_40px_rgba(15,23,42,0.14)] sm:mb-4 sm:rounded-[24px] flex flex-col"
        style={{ maxHeight: '88dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-slate-300/80" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-4 flex-shrink-0">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center overflow-hidden rounded-full bg-white text-xl shadow-[0_4px_14px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.04]">
            {petPhotoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={petPhotoSrc} alt={petName || 'Pet'} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <span>{currentPet.species === 'cat' ? '🐱' : '🐶'}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="truncate text-[17px] font-extrabold leading-tight text-slate-950">{title}</h2>
            <p className="truncate text-[12px] font-medium text-slate-500">Tudo que {petName || 'seu pet'} usa</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-white/80 text-slate-500 shadow-[0_3px_12px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.04] transition-all duration-200 hover:bg-white hover:text-slate-700 active:scale-[0.9] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf7]"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" strokeWidth={2.3} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto overscroll-contain flex-1 space-y-4 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div>
            <button
              type="button"
              onClick={toggleReorder}
              className="flex w-full items-center gap-2.5 rounded-2xl bg-emerald-500 px-4 py-3 text-left text-white shadow-[0_8px_20px_rgba(16,185,129,0.22)] transition-all duration-200 hover:bg-emerald-600 active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf7]"
              aria-expanded={reorderOpen}
              aria-controls="reorder-panel"
              aria-label={`Comprar de novo, ${reorderCards.length} produto${reorderCards.length === 1 ? '' : 's'}, ${reorderOpen ? 'expandido' : 'recolhido'}`}
            >
              <span aria-hidden className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-white/[0.18] text-white ring-1 ring-white/[0.20]">
                <ShoppingCart className="h-[17px] w-[17px]" strokeWidth={2.3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-extrabold leading-tight min-[380px]:text-[16px]">Comprar de novo</span>
                <span className="block truncate text-[11px] font-semibold text-white/[0.78]">
                  {reorderCards.length === 1 ? '1 produto para repor' : `${reorderCards.length} produtos para repor`}
                </span>
              </span>
              {reorderCards.length > 0 && (
                <span className="grid h-6 min-w-6 flex-shrink-0 place-items-center rounded-full bg-white/[0.22] px-1.5 text-[12px] font-extrabold text-white">
                  {reorderCards.length}
                </span>
              )}
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 motion-reduce:transition-none ${reorderOpen ? 'rotate-180' : ''}`}
                strokeWidth={2.5}
              />
            </button>

            {/* Linha de contexto sob o botão — só quando fechado e há urgência */}
            {!reorderOpen && reorderScentLine && (
              <p className={`mt-1.5 text-center text-[12px] font-semibold ${reorderUrgentTone === 'critical' ? 'text-rose-600' : reorderUrgentTone === 'warning' ? 'text-amber-700' : 'text-gray-500'}`}>
                {reorderScentLine}
              </p>
            )}

            {reorderOpen && (
              <div id="reorder-panel" role="region" aria-label="Produtos para comprar de novo" className="mt-3">
                {reorderCards.length > 0 ? (
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
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-center">
                    <p className="text-[13px] text-slate-600 leading-snug">
                      Cadastre a ração e o antipulgas {petDo(currentPet)} {petName || 'seu pet'} — a gente avisa quando estiver acabando, já com o preço do dia.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

              {/* 🐾 Buscar produtos — catálogo Awin sincronizado, no lugar
                  do ícone estático que só levava pro site sem contexto.
                  Multi-loja por natureza (ver AffiliateCatalogSearch.tsx) —
                  copy neutra para as lojas ativas. Só a
                  busca (texto + escanear/digitar código de barras) — a
                  grade "Explorar categorias" foi removida a pedido. */}
          <div>
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Buscar outro produto</p>
            <AffiliateCatalogSearch petId={currentPet.pet_id} />
          </div>

          <PartnerStoreGrid partners={visibleStorePartners} onOpen={handleStorePartnerOpen} />

          <p className="pt-1 text-center text-[10px] leading-relaxed text-slate-400">
            Alguns links de compra podem gerar comissão para o PETMOL, sem custo adicional para você.
            A disponibilidade, preço, pagamento e entrega são de responsabilidade da loja escolhida.
          </p>
        </div>
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
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Ou visite uma loja parceira</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {partners.map((partner) => (
          <button
            key={partner.id}
            type="button"
            onClick={() => onOpen(partner)}
            className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200/70 bg-white p-3 text-center shadow-[0_4px_16px_rgba(15,23,42,0.05)] transition-all duration-200 hover:border-emerald-200 hover:shadow-[0_8px_20px_rgba(15,23,42,0.07)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none"
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

  // Toda oferta na lista é o mesmo produto (mesmo GTIN) — só preço/loja
  // mudam. Nem toda loja tem imagem (Shopee/busca por palavra-chave ainda
  // não tem, só o feed Awin tem), então usa a primeira com imagem em vez
  // de travar na foto só da oferta mais barata.
  // Imagem: identidade canônica primeiro (catálogo / feed do mesmo GTIN),
  // só depois a imagem que veio junto com uma oferta. Nunca a foto de uma
  // variante parecida só porque o nome bate.
  const imageUrl =
    offers.find((o) => o.canonical_image_url)?.canonical_image_url ??
    offers.find((o) => o.image_url)?.image_url ??
    null;
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
      className={`rounded-2xl border bg-white p-3 shadow-[0_4px_16px_rgba(15,23,42,0.05)] transition-all duration-200 motion-reduce:transition-none motion-reduce:transform-none ${canAct ? 'cursor-pointer hover:border-emerald-200 hover:shadow-[0_8px_20px_rgba(15,23,42,0.07)] active:scale-[0.99]' : ''} ${hasDiscount ? 'border-orange-200/90' : 'border-slate-200/70'}`}
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
      <p className="px-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Escolha a loja</p>
      {offers.map((offer) => {
        const logoSrc = HOME_SHOPPING_PARTNERS.find((p) => p.id === offer.merchant)?.logoSrc;
        return (
          <button
            key={offer.merchant}
            type="button"
            onClick={() => onPick(offer)}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 transition-all duration-200 hover:border-emerald-200 hover:bg-white active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {logoSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc} alt="" className="h-4 w-4 flex-shrink-0 rounded object-contain border border-slate-100 bg-white" />
              )}
              <span className="truncate text-[12px] font-bold text-slate-800">{merchantLabel(offer.merchant)}</span>
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

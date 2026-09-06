'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { useKeyboardSheetViewport } from '@/hooks/useKeyboardSheetViewport';
import { petDo, petO } from '@/lib/petGender';
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
import { fetchPetzDirectLink, formatBRLPrice, hasReliablePrice, merchantLabel, offerOriginLabel, offerPriceLabel, preferCobasiOffer, type CommerceOffer, type PetzDirectLink } from './productPricing';
import { useCommerceOffers } from './useCommerceOffers';
import {
  buildReorderCards,
  buildPetStoreTitle,
  groupReorderCardsByUrgency,
  QUICK_BUY_PARTNERS,
  type ReorderCard,
} from './petStoreContent';

interface HomeShoppingSheetProps {
  open: boolean;
  onClose: () => void;
  currentPet: PetHealthProfile;
  buyableReminders: PetCareReminder[];
}

type ShoppingView = 'store' | 'search';

// Tela enxuta de propósito: "Comprar novamente" (com preço real quando
// disponível) é a seção que importa de verdade — uma tela mais longa com
// categorias genéricas e promoções não-personalizadas só cansava o tutor
// antes de ele chegar no que interessa. Serviços fica de fora por enquanto.
//
// Ordem da tela (decisão de produto, 04/09/2026 — revisada): campo de
// busca PRIMEIRO (antes de qualquer produto do pet — melhor achar a busca
// de cara) → Comprar de novo (sem prazo) → Vai precisar em breve → Mais
// para frente → lojas parceiras. Ver petStoreContent.groupReorderCardsByUrgency
// pro agrupamento por urgência. O pet vem antes do merchant — cada card
// mostra produto e prazo primeiro, loja só na hora de comprar. Tocar no
// campo de busca abre a view dedicada (AffiliateCatalogSearch) — nela SÓ
// aparece o resultado da busca, os produtos do pet somem enquanto o
// tutor está procurando algo novo.
//
// As 3 seções de produto ficam SEMPRE visíveis (decisão de produto,
// 04/09/2026): a Loja do Pet tem poucos itens e todos são personalizados
// pro pet atual — nenhum produto recorrente conhecido deve ficar oculto
// por padrão. REORDER_SOON_THRESHOLD_DAYS classifica em qual seção um
// produto cai, nunca se ele aparece ou não.
export function HomeShoppingSheet({ open, onClose, currentPet, buyableReminders }: HomeShoppingSheetProps) {
  const [quickBuyFor, setQuickBuyFor] = useState<string | null>(null);
  const [view, setView] = useState<ShoppingView>('store');
  // Mantém a sheet colada ao viewport visível quando o teclado abre (busca) —
  // sem isso o campo de busca fica atrás do teclado no iOS.
  const kbViewportRef = useKeyboardSheetViewport(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Ao focar a busca, o teclado sobe e a sheet passa a caber só na metade
  // visível (maxHeight min(...,100%)). O iOS ainda dispara um "ghost click"
  // ~300ms depois, na coordenada original do toque — que agora aponta pro
  // backdrop → a sheet fechava sozinha. Ignora o backdrop logo após um foco
  // dentro da sheet; com um campo focado, só fecha o teclado.
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
  const grouped = useMemo(() => groupReorderCardsByUrgency(reorderCards), [reorderCards]);

  useEffect(() => {
    if (!open) {
      setQuickBuyFor(null);
      setView('store');
      return;
    }
    void trackClick({ source: 'home', cta_type: 'shop_sheet_view', pet_id: currentPet.pet_id });
    void trackClick({ source: 'home', cta_type: 'store_opened', pet_id: currentPet.pet_id });
    // "Visão" das seções personalizadas — a tela abre nelas por padrão
    // (sem rolagem necessária pra a primeira dobra), então contam como
    // vistas assim que a Loja abre, uma vez por abertura.
    if (grouped.anytime.length > 0) {
      void trackClick({ source: 'home', cta_type: 'shop_reorder_section_view', pet_id: currentPet.pet_id, metadata: { count: grouped.anytime.length } });
    }
    if (grouped.soon.length > 0) {
      void trackClick({ source: 'home', cta_type: 'shop_upcoming_section_view', pet_id: currentPet.pet_id, metadata: { count: grouped.soon.length } });
    }
    if (grouped.later.length > 0) {
      void trackClick({ source: 'home', cta_type: 'shop_later_section_view', pet_id: currentPet.pet_id, metadata: { count: grouped.later.length } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Sem pré-busca: os cards de loja parceira levam à vitrine/storefront
    // da loja, nunca a uma busca genérica tipo "produtos pet" — o tutor
    // escolheu "quero navegar direto na loja", não "busque algo pra mim"
    // (isso já existe na seção de busca). Pra Cobasi e Shopee hoje isso já
    // não fazia diferença na prática (storefrontAffiliateUrl/shortlink
    // fixos ignoram o parâmetro), mas resolvePartnerUrl(query, ...) pode
    // futuramente montar uma URL de busca real com esse texto — string
    // vazia garante que nenhuma pré-busca nasça aqui por engano.
    const searchQuery = '';
    const url = resolvePartnerUrl(partner, searchQuery, '');

    if (partner.id === 'petz') {
      // Petz é Loja Parceira + cupom, não busca — a analítica só sai
      // DEPOIS da tentativa de copiar o cupom, porque coupon_copied
      // precisa ser o que de fato aconteceu no clique, não uma suposição.
      if (!url) {
        void trackClick({
          source: 'home',
          cta_type: 'shop_partner_store_click',
          target: partner.id,
          link_type: partnerGenericLinkType(partner.id),
          pet_id: currentPet.pet_id,
          metadata: { opened: false, surface: 'store_grid', search_query: searchQuery },
        });
        return;
      }
      void (async () => {
        const copied = await openPetzPartnerStore({});
        void trackClick({
          source: 'home',
          cta_type: 'shop_partner_store_click',
          target: partner.id,
          link_type: partnerGenericLinkType(partner.id),
          pet_id: currentPet.pet_id,
          metadata: {
            opened: true,
            surface: 'store_grid',
            search_query: searchQuery,
            merchant: 'petz',
            destination_type: 'partner_store',
            coupon: PETZ_COUPON_CODE,
            coupon_copied: copied,
            monetization_mode: 'partner_store_plus_coupon',
          },
        });
      })();
      return;
    }

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
    navigateToPartnerUrl(url);
  }

  function handleSearchEntry() {
    void trackClick({ source: 'home', cta_type: 'shop_search_entry_click', pet_id: currentPet.pet_id });
    setView('search');
  }

  function renderReorderCards(cards: ReorderCard[]) {
    return cards.map((card) => {
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
            // openPetzPartnerStore SEMPRE abre a Loja Parceira (nunca
            // busca/produto — ver comentário na função); productUrl/
            // searchUrl continuam mandados só pro nome do produto exibido
            // na ponte. coupon_copied é o que de fato aconteceu no clique
            // (nunca assumido) — por isso a analítica espera o retorno.
            void (async () => {
              const copied = await openPetzPartnerStore({
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
                  monetization_mode: 'partner_store_plus_coupon',
                  destination_type: 'partner_store',
                  coupon: PETZ_COUPON_CODE,
                  coupon_copied: copied,
                  gtin: card.gtin ?? undefined,
                  link_type: 'affiliate_store',
                  screen: 'loja',
                },
              });
            })();
          }}
        />
      );
    });
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
        // A view de loja usa `maxHeight` (cresce com o conteúdo — poucos
        // itens não deixam vão vazio embaixo), mas o CAP subiu de 88dvh
        // pra 96dvh (decisão de produto, 04/09/2026): exceção deliberada
        // ao padrão mais contido dos outros sheets do app — com busca +
        // 3 seções + lojas parceiras + aviso, o conteúdo real passou a
        // bater no teto com frequência, cortando "Ou visite uma loja
        // parceira"/o aviso de afiliados sem indicar claramente que dava
        // pra rolar mais. Foi até quase o topo da tela de propósito, pra
        // mostrar o que ficava faltando embaixo. A view de busca é
        // diferente: com 0-1 resultado ela tem bem menos conteúdo que
        // qualquer cap, então usa `height` fixo (94dvh) — sem isso a
        // sheet "encolhe" e sobra um vão cinza enorme acima do campo.
        style={view === 'search' ? { height: 'min(94dvh, 100%)' } : { maxHeight: 'min(96dvh, 100%)' }}
        onClick={(e) => e.stopPropagation()}
        onFocusCapture={() => { lastFocusInsideAt.current = Date.now(); }}
      >
        {/* Cabeçalho petmol compartilhado — mesma variante usada nos demais
            sheets do pet (SheetHeader tone="petmol"). Na view de busca vira
            "← Voltar" pra loja + X continua fechando a sheet inteira. */}
        {view === 'search' ? (
          <SheetHeader
            tone="petmol"
            withHandle
            title="Buscar produto"
            subtitle={`Na Loja ${petDo(currentPet)} ${petName || 'seu pet'}`}
            onBack={() => setView('store')}
            onClose={onClose}
          />
        ) : (
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
        )}

        {/* Scrollable content */}
        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {view === 'search' ? (
            <AffiliateCatalogSearch petId={currentPet.pet_id} autoFocus />
          ) : (
            <>
              {/* Campo de busca — PRIMEIRO item da tela, antes dos produtos
                  do pet (decisão de produto, 04/09/2026: melhor experiência
                  é achar a busca de cara, sem rolar a tela toda). Visual de
                  campo de busca de verdade (mesmo estilo do campo real em
                  AffiliateCatalogSearch), mas é um <button> — o toque leva
                  pra view de busca dedicada em vez de abrir teclado aqui em
                  cima; lá o campo tem fonte grande ("zoom", igual ao
                  cadastro inicial) pra facilitar digitar/ler. */}
              <button
                type="button"
                onClick={handleSearchEntry}
                className="flex w-full items-center gap-2.5 rounded-2xl border border-slate-200 bg-white pl-4 pr-4 py-3.5 text-left shadow-[0_4px_16px_-6px_rgba(15,23,42,0.18)] transition-all active:scale-[0.99] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                <Search className="h-[18px] w-[18px] flex-shrink-0 text-slate-400" strokeWidth={2.2} />
                <span className="text-[15px] font-medium text-slate-400">Buscar produto...</span>
              </button>

              {/* Títulos das 3 seções de produto (decisão de produto,
                  04/09/2026): maiores, centralizados, mb-3.5 (era 2.5,
                  descola mais dos cards abaixo) — texto de seção, não
                  mais um rótulo discreto de canto. Cor branca (não
                  slate-700 como na primeira tentativa): o fundo real
                  aqui não é branco — é o bg-[#f5f6f8]/82 translúcido da
                  sheet por cima do backdrop escuro/blur (bg-slate-950/55)
                  — então QUALQUER cinza escuro fica com contraste ruim
                  contra esse cinza-escuro composto, por mais que pareça
                  óbvio "texto escuro em fundo claro" olhando só o valor
                  hex do fundo. Branco puro (títulos) / branco 70%
                  ("Ou visite uma loja parceira", só rótulo utilitário,
                  mais discreto) / branco 60% (aviso de afiliados, fine
                  print) — mesma cor, hierarquia só por opacidade. */}
              {/* Comprar de novo — produtos recorrentes sem prazo definido
                  (ex: petisco). Intenção livre, o tutor compra quando quiser. */}
              {grouped.anytime.length > 0 && (
                <div>
                  <p className="mb-3.5 text-center text-[15px] font-black uppercase tracking-[0.06em] text-white">Comprar de novo</p>
                  <div className="space-y-2.5">{renderReorderCards(grouped.anytime)}</div>
                </div>
              )}

              {/* Vai precisar em breve — inclui vencido/hoje (o mais urgente)
                  até o limiar de apresentação (ver REORDER_SOON_THRESHOLD_DAYS
                  em petStoreContent.ts), ordenado do mais próximo pro mais longe. */}
              {grouped.soon.length > 0 && (
                <div>
                  <p className="mb-3.5 text-center text-[15px] font-black uppercase tracking-[0.06em] text-white">Vai precisar em breve</p>
                  <div className="space-y-2.5">{renderReorderCards(grouped.soon)}</div>
                </div>
              )}

              {/* Mais para frente — SEMPRE visível, igual às outras duas
                  seções (decisão de produto, 04/09/2026): poucos produtos,
                  todos personalizados pro pet, nenhum fica oculto por
                  padrão. Só classificação visual (mais distante), nunca
                  accordion/collapse. */}
              {grouped.later.length > 0 && (
                <div>
                  <p className="mb-3.5 text-center text-[15px] font-black uppercase tracking-[0.06em] text-white">Mais para frente</p>
                  <div className="space-y-2.5">{renderReorderCards(grouped.later)}</div>
                </div>
              )}

              <PartnerStoreGrid partners={visibleStorePartners} onOpen={handleStorePartnerOpen} />

              <p className="pt-1 text-center text-[10px] leading-relaxed text-white/60">
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
      <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.13em] text-white/70">Ou visite uma loja parceira</p>
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
  const { offers: offersByPrice, loading } = useCommerceOffers(card.searchQuery, card.packageSizeKg, card.gtin);
  // Loja preferida nos cards de "produtos cadastrados do pet": Cobasi
  // primeiro quando tiver preço confiável, mesmo que outra loja seja mais
  // barata (ver preferCobasiOffer). offersByPrice continua a ordem crua
  // por preço do backend — usada abaixo só pra saber se o preço mostrado
  // é de fato o mais barato (rótulo "A partir de").
  const offers = useMemo(() => preferCobasiOffer(offersByPrice), [offersByPrice]);
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
  // `offers` (Cobasi-primeiro) já reordenou offersByPrice — offer NEM
  // SEMPRE é o mais barato agora (ver preferCobasiOffer/isShowingCheapest
  // acima). Quando mais de uma opção de compra existe pro mesmo GTIN
  // (mais de um provider com preço, e/ou Petz confirmada), oferece
  // escolha de loja em vez de comprar direto sem avisar (ver
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
          {/* Nome do produto ocupa a largura toda da coluna — ele é o
              protagonista do card. */}
          <p className="line-clamp-2 text-[13.5px] font-bold leading-tight text-slate-950">
            {displayProductLabel}
          </p>
          <p className={`mt-0.5 text-[11.5px] font-semibold leading-tight ${card.urgencyTone === 'overdue' ? 'text-rose-600' : card.urgencyTone === 'today' ? 'text-amber-600' : 'text-slate-500'}`}>
            {card.urgencyText}
          </p>
          {loading && <p className="mt-0.5 text-[11px] font-medium text-slate-400">Buscando opções de compra...</p>}
          {/* Primeiro nível do card = produto + prazo + preço de referência.
              O PETMOL informa, não "grita promoção": nada de selo de oferta
              aqui. A loja, o preço por loja e a origem do preço só aparecem
              ao tocar "Comprar" (ver OfferPickerRow). */}
          {!loading && hasMonetizedOffer && offer && (
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[12px] font-bold leading-tight">
              <span className={priceReliable ? 'text-emerald-800' : 'text-emerald-700'}>
                {priceReliable ? formatBRLPrice(offer.price as number) : offerPriceLabel(offer)}
              </span>
              {hasDiscount && (
                <span className="text-[10px] font-semibold text-slate-400 line-through">{formatBRLPrice(offer.list_price as number)}</span>
              )}
            </p>
          )}
          {!loading && !hasMonetizedOffer && hasPetz && (
            <p className="mt-0.5 text-[12px] font-bold leading-tight text-blue-700">Disponível para compra</p>
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

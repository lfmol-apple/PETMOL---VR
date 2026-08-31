'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FoodControlTab, type FoodControlTabFormRequest, type FoodControlTabState } from '@/components/FoodControlTab';
import type { PetHealthProfile } from '@/lib/petHealth';
import { ModalPortal } from '@/components/ModalPortal';
import { trackV1Metric } from '@/lib/v1Metrics';
import { API_BACKEND_BASE, API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { localTodayISO } from '@/lib/localDate';
import { scheduleFoodReminder, cancelFoodRemindersForPet, buildRemindAt } from '@/features/notifications/pushService';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';
import { petDo } from '@/lib/petGender';
import { CoachMark } from '@/components/CoachMark';
import { ProductBarcodeScanner } from '@/components/ProductBarcodeScanner';
import { guessFoodKind, type ScannedProduct } from '@/lib/productScanner';
import { resolveFoodCommerceSnapshot } from '@/features/commerce/homeContextualCommerce';
import { MonetizedOffersList } from '@/features/commerce/MonetizedOffersList';
import { AffiliateCatalogSearch } from '@/features/commerce/AffiliateCatalogSearch';
import { requestUserDecision } from '@/features/interactions/userPromptChannel';

export interface FoodItemSheetProps {
  pet: PetHealthProfile;
  onClose: () => void;
  onSaved?: () => void;
  onGoHome?: () => void;
  initialMode?: 'view' | 'buy';
  petPhotoUrl?: string | null;
  racaoEventId?: string | null;
}

// Sheet-level navigation (page swaps)
type SheetMode = 'view' | 'edit' | 'buy';

// Internal submodes within view — no router.push, no sheet close
type FoodSubMode = 'main' | 'adjustDuration' | 'finished' | 'channel' | 'restockConfirm';

type PurchaseChannel = 'cobasi' | 'petz' | 'mercadolivre' | 'shopee' | 'loja_fisica' | 'outro';

type FeedingPlanApiItem = {
  id?: string | null;
  label?: string | null;
  food_brand?: string | null;
  package_size_kg?: number | null;
  daily_amount_g?: number | null;
  duration_days?: number | null;
  last_refill_date?: string | null;
  mode?: string | null;
  is_primary?: boolean;
  barcode?: string | null;
  category?: string | null;
  notes?: string | null;
};

type FeedingPlanApiResponse = {
  status: string;
  pet_id: string;
  plan: {
    pet_id?: string | null;
    species?: string | null;
    country_code?: string | null;
    enabled?: boolean | null;
    no_consumption_control?: boolean | null;
    mode?: string | null;
    food_brand?: string | null;
    package_size_kg?: number | null;
    daily_amount_g?: number | null;
    duration_days?: number | null;
    last_refill_date?: string | null;
    safety_buffer_days?: number | null;
    manual_reminder_days_before?: number | null;
    reminder_time?: string | null;
    next_purchase_date?: string | null;
    notes?: string | null;
    items?: FeedingPlanApiItem[];
  } | null;
  estimate?: {
    estimated_end_date?: string | null;
    estimated_days_left?: number | null;
    recommended_alert_date?: string | null;
  } | null;
};

// ── utils ─────────────────────────────────────────────────────────────────────

function isoPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][m - 1]}`;
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function parseLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDaysLocal(iso: string, days: number): string {
  const start = parseLocalDate(iso);
  if (!start) return iso;
  start.setDate(start.getDate() + days);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
}

function diffFromLocalToday(iso: string): number | null {
  const target = parseLocalDate(iso);
  const today = parseLocalDate(localTodayISO());
  if (!target || !today) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function normalizeFoodName(raw: string): string {
  const value = (raw || '').trim().replace(/\s+/g, ' ');
  if (!value) return '';
  const words = value.split(' ');
  if (words.length >= 4) {
    const firstTwo = words.slice(0, 2).join(' ').toLowerCase();
    const nextTwo = words.slice(2, 4).join(' ').toLowerCase();
    if (firstTwo === nextTwo) {
      return [...words.slice(0, 2), ...words.slice(4)].join(' ').trim();
    }
  }
  return value;
}

function clearPendingScannedProduct(): void {
  try {
    sessionStorage.removeItem('petmol_pending_scanned_product');
  } catch {
    // non-blocking
  }
}

// ── Drum-roller days picker ────────────────────────────────────────────────────

function DaysScrollPicker({ value, onChange, min = 1, max = 90 }: {
  value: number;
  onChange: (days: number) => void;
  min?: number;
  max?: number;
}) {
  const ITEM_H = 52;
  const VISIBLE = 5;
  const PAD = ITEM_H * Math.floor(VISIBLE / 2);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const days = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = (value - min) * ITEM_H;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readValue = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_H);
    onChange(days[Math.max(0, Math.min(idx, days.length - 1))]);
  }, [days, onChange]);

  const handleScroll = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(readValue, 80);
  }, [readValue]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="relative select-none" style={{ height: ITEM_H * VISIBLE }}>
      <div className="absolute inset-x-0 top-0 pointer-events-none z-10"
        style={{ height: PAD, background: 'linear-gradient(to bottom, white 60%, transparent)' }} />
      <div className="absolute inset-x-0 bottom-0 pointer-events-none z-10"
        style={{ height: PAD, background: 'linear-gradient(to top, white 60%, transparent)' }} />
      <div className="absolute inset-x-8 bg-blue-50 border border-blue-200 rounded-2xl pointer-events-none z-0"
        style={{ top: PAD, height: ITEM_H }} />
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-y-scroll [&::-webkit-scrollbar]:hidden"
        style={{
          scrollSnapType: 'y mandatory',
          paddingTop: PAD,
          paddingBottom: PAD,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        } as React.CSSProperties}
        onScroll={handleScroll}
      >
        {days.map((d) => (
          <div
            key={d}
            style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
            className="flex items-center justify-center text-[18px] font-bold text-gray-800"
          >
            {d} dia{d !== 1 ? 's' : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── pet photo bubble ─────────────────────────────────────────────────────────
// Hoisted to module scope on purpose: this was previously declared *inside*
// FoodItemSheet's body, so every re-render (any state change anywhere in a
// component with dozens of useState calls, not just photo-related ones)
// produced a brand-new function reference. React then treated <PhotoBubble>
// as a different component type each time and remounted it from scratch —
// destroying and recreating the <img> DOM node, which made the browser
// re-fetch/redecode the photo and visibly flash. A stable module-level
// component reference fixes that: only its props change now, no remount.
function PhotoBubble({
  size, photoSrc, photoFailed, onPhotoError, species, petName,
}: {
  size: number;
  photoSrc: string | null;
  photoFailed: boolean;
  onPhotoError: () => void;
  species?: string;
  petName?: string;
}) {
  return (
    <div
      className="rounded-full overflow-hidden bg-amber-100 flex items-center justify-center flex-shrink-0 shadow-sm ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {photoSrc && !photoFailed ? (
        <img src={photoSrc} alt={petName} className="w-full h-full object-cover" loading="lazy"
          onError={onPhotoError} />
      ) : (
        <span>{species === 'cat' ? '🐱' : '🐶'}</span>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export function FoodItemSheet({ pet, onClose, onSaved, onGoHome, initialMode, petPhotoUrl, racaoEventId }: FoodItemSheetProps) {
  // Navigation
  const [mode, setMode]           = useState<SheetMode>(initialMode === 'buy' ? 'buy' : 'view');
  const [subMode, setSubMode]     = useState<FoodSubMode>('main');

  // Food data (populated by hidden FoodControlTab)
  const [foodBrand, setFoodBrand] = useState('');
  const [foodState, setFoodState] = useState<FoodControlTabState>({
    showForm: false, commerceStatus: null, foodBrand: '',
    daysLeft: null, restockDate: null, packageSizeKg: null,
    dailyConsumptionG: null, durationDays: null, startDate: null,
    gtin: null, secondaryItems: [],
  });

  // Partner / commerce
  const [formRequest, setFormRequest]       = useState<FoodControlTabFormRequest | null>(null);

  // UI state
  const [busy, setBusy]                           = useState(false);
  const [feedback, setFeedback]                   = useState<{ msg: string; tone: 'green' | 'blue' | 'red' } | null>(null);
  const [photoLoadFailed, setPhotoLoadFailed]     = useState(false);
  const [successMessage, setSuccessMessage]       = useState<string | null>(null);
  const [justSaved, setJustSaved]                 = useState(false);
  const [selectedDays, setSelectedDays]           = useState(7);
  const [hasFoodConfigured, setHasFoodConfigured] = useState(false);
  // Declaração explícita "não uso ração" (mode !== 'kibble' + no_consumption_control) —
  // não confundir com "ainda não configurou": aqui o tutor já disse que não quer
  // rastreamento, então a tela não deve insistir em pedir marca/peso/consumo.
  const [isNonKibbleDeclared, setIsNonKibbleDeclared] = useState(false);
  const [declaringNonKibble, setDeclaringNonKibble] = useState(false);
  // "Mudei de ideia" a partir da tela de alimentação caseira: mostra de novo
  // as 3 opções (foto/manual/caseira), igual primeira vez — não pula direto
  // pro formulário manual. Reseta sozinho sempre que o plano é recarregado
  // do servidor (refreshFoodPlan), já que nesse ponto vamos mostrar o estado
  // real de novo, não mais a escolha "finge que está vazio".
  const [showFreshChoice, setShowFreshChoice] = useState(false);
  const [nextReminderDate, setNextReminderDate]   = useState<string | null>(null);
  const [reminderTime, setReminderTime]           = useState<string | null>(null);
  // Produto recém-escaneado aguardando a escolha "ração principal" vs
  // "petisco/outro alimento" — só usado quando já existe uma ração
  // configurada (ver handleFoodProductConfirmed).
  const [pendingClassifyProduct, setPendingClassifyProduct] = useState<ScannedProduct | null>(null);
  const [foodScanIntent, setFoodScanIntent] = useState<'ask' | 'secondary'>('ask');
  // Quando definido, a tela "Comprar" usa a busca/GTIN desse item
  // secundário (petisco) em vez do item primário (ração) — ver botão
  // "🛒 Comprar" na seção "Outros alimentos".
  const [buyTargetItem, setBuyTargetItem] = useState<{ label: string; query: string; gtin: string | null; packageSizeKg: number | null } | null>(null);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [deletingSecondaryId, setDeletingSecondaryId] = useState<string | null>(null);
  // Alterna qual seção a tela principal mostra — ração (controle de peso/
  // tempo) ou petiscos (compra esporádica, sem contagem). Pedido do tutor:
  // as duas seções empilhadas numa rolagem só ficavam confusas pra um
  // usuário com dificuldade; abas simples resolvem sem esconder nada.
  const [viewSection, setViewSection] = useState<'racao' | 'petiscos'>('racao');
  const successMessageTimerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollBodyRef                               = useRef<HTMLDivElement>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const photoSource = petPhotoUrl
    ?? (pet as { photo_url?: string | null; photo?: string | null }).photo_url
    ?? pet.photo;
  const petPhotoSrc = resolvePetPhotoUrl(photoSource);

  const hasFood  = hasFoodConfigured;
  const estEnd   = foodState.restockDate;

  // Chute (não decisão) pra pré-destacar a opção provável na tela de
  // classificação ração x petisco — baseado no nome do produto escaneado
  // (ver guessFoodKind). O tutor sempre confirma; um falso positivo aqui só
  // custa um toque a mais, nunca decide sozinho sem chance de correção.
  const suggestedFoodKind = pendingClassifyProduct
    ? guessFoodKind(`${pendingClassifyProduct.name || ''} ${pendingClassifyProduct.brand || ''}`)
    : null;

  const handleFoodControlStateChange = useCallback((nextState: FoodControlTabState) => {
    setFoodState((previous) => {
      if (
        previous.showForm === nextState.showForm &&
        previous.commerceStatus === nextState.commerceStatus &&
        previous.foodBrand === nextState.foodBrand &&
        previous.daysLeft === nextState.daysLeft &&
        previous.restockDate === nextState.restockDate &&
        previous.packageSizeKg === nextState.packageSizeKg &&
        previous.dailyConsumptionG === nextState.dailyConsumptionG &&
        previous.durationDays === nextState.durationDays &&
        previous.startDate === nextState.startDate
      ) {
        return previous;
      }
      return nextState;
    });
    setFoodBrand((previous) => (previous === nextState.foodBrand ? previous : nextState.foodBrand));
  }, []);

  const clearSuccessMessageTimer = () => {
    if (successMessageTimerRef.current) {
      clearTimeout(successMessageTimerRef.current);
      successMessageTimerRef.current = null;
    }
  };

  const dispatchFoodPlanUpdated = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('petmol:feeding-plan-updated', { detail: { petId: pet.pet_id } }));
  };

  const showSuccessAndReturnToMain = (message: string) => {
    clearSuccessMessageTimer();
    setMode('view');
    setSubMode('main');
    setJustSaved(true);

    setFeedback(null);
    setSuccessMessage(`✅ ${message}`);
    successMessageTimerRef.current = setTimeout(() => {
      setSuccessMessage(null);
      successMessageTimerRef.current = null;
    }, 3000);
  };

  const handleEditBackToView = () => {
    clearPendingScannedProduct();
    clearSuccessMessageTimer();
    setFormRequest(null);
    setFeedback(null);

    setSubMode('main');
    setMode('view');
  };

  const handleSubModeBackToMain = () => {
    clearPendingScannedProduct();
    setSubMode('main');

    setFeedback(null);
  };

  // Código de barras é a via principal (leitura exata, sem ambiguidade).
  // Em todos os pontos de alimentação o tutor pode escanear ou digitar o
  // EAN/GTIN; foto da embalagem e busca por nome ficam dentro do detector
  // compartilhado como fallback quando a leitura/código não resolvem.
  //
  // `intent` decide o que acontece depois de confirmar o produto:
  //  - 'ask'       (padrão) — pergunta "ração principal ou petisco?"
  //                 quando já existe uma ração configurada.
  //  - 'secondary' — pula a pergunta, vai direto pra petisco/outro
  //                 alimento (usado pelo botão "+ Adicionar outro
  //                 alimento", onde a intenção já é explícita).
  // Grava o produto escaneado como item primário (ração do dia a dia) ou
  // secundário (petisco/outro alimento) do plano — ambos cabem no mesmo
  // items_json (ver FoodControlTab.tsx), só o secundário não exige peso/
  // duração e não entra no ciclo de "dias restantes"/alerta de reposição.
  // Petisco escolhido como primeiro alimento do pet (nenhuma ração
  // cadastrada ainda) nunca deve abrir o formulário completo de ração —
  // isso obrigava o tutor a ver/preencher um card de "ração principal"
  // vazio só pra conseguir salvar um petisco (bug real reportado: "se
  // escolher petisco tem que abrir petisco e deixar ração pra depois ou
  // nunca"). Salva direto pelo endpoint, sem passar pelo FoodControlTab —
  // a ração fica como item vazio/pendente (o backend sempre exige um
  // primário em items_json), mas o tutor nunca vê essa exigência, só o
  // petisco aparecendo na aba certa.
  const persistFirstPetiscoDirect = async (product: ScannedProduct) => {
    setBusy(true);
    const brand = normalizeFoodName(product.name || product.brand || '') || 'Petisco';
    try {
      const res = await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH() },
        credentials: 'include',
        body: JSON.stringify({
          mode: 'kibble',
          enabled: true,
          items: [
            { is_primary: true },
            { is_primary: false, food_brand: brand, barcode: product.barcode || null, category: 'food' },
          ],
        }),
      });
      if (!res.ok) throw new Error('save failed');
      dispatchFoodPlanUpdated();
      onSaved?.();
      await refreshFoodPlan();
      setViewSection('petiscos');
      clearSuccessMessageTimer();
      setFeedback(null);
      setSuccessMessage(`✅ ${brand} adicionado aos petiscos`);
      successMessageTimerRef.current = setTimeout(() => {
        setSuccessMessage(null);
        successMessageTimerRef.current = null;
      }, 3000);
    } catch {
      setFeedback({ msg: 'Não deu pra salvar agora. Tente de novo.', tone: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const serializeFeedingItemForSave = (item: FeedingPlanApiItem) => ({
    id: item.id ?? undefined,
    label: item.label ?? undefined,
    food_brand: item.food_brand ?? undefined,
    package_size_kg: item.package_size_kg ?? undefined,
    daily_amount_g: item.daily_amount_g ?? undefined,
    duration_days: item.duration_days ?? undefined,
    last_refill_date: item.last_refill_date ?? undefined,
    mode: item.mode || 'kibble',
    barcode: item.barcode ?? undefined,
    category: item.category ?? undefined,
    notes: item.notes ?? undefined,
    is_primary: Boolean(item.is_primary),
  });

  const buildFeedingPlanSaveBody = (plan: NonNullable<FeedingPlanApiResponse['plan']>, items: FeedingPlanApiItem[]) => ({
    species: plan.species || pet.species || 'dog',
    country_code: plan.country_code || 'BR',
    safety_buffer_days: plan.safety_buffer_days ?? 3,
    manual_reminder_days_before: plan.manual_reminder_days_before ?? null,
    reminder_time: plan.reminder_time ?? null,
    mode: plan.mode || 'kibble',
    enabled: plan.enabled ?? true,
    no_consumption_control: plan.no_consumption_control ?? false,
    next_purchase_date: plan.next_purchase_date ?? null,
    notes: plan.notes ?? null,
    items: items.map(serializeFeedingItemForSave),
  });

  const persistSecondaryFoodDirect = async (product: ScannedProduct) => {
    const brand = normalizeFoodName(product.name || product.brand || '') || 'Petisco';
    const barcode = (product.barcode || '').trim() || null;
    if (!hasFood) {
      void persistFirstPetiscoDirect(product);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan`, {
        headers: authH(),
        credentials: 'include',
      });
      if (res.status === 404) {
        await persistFirstPetiscoDirect(product);
        return;
      }
      if (!res.ok) throw new Error('fetch failed');
      const payload: FeedingPlanApiResponse = await res.json();
      const plan = payload.plan;
      if (!plan) {
        await persistFirstPetiscoDirect(product);
        return;
      }

      const existingItems = Array.isArray(plan.items) ? plan.items : [];
      const normalizedBrand = brand.trim().toLowerCase();
      const alreadyExists = existingItems.some((item) => {
        if (item?.is_primary) return false;
        const itemBarcode = (item.barcode || '').trim();
        const itemBrand = (item.food_brand || '').trim().toLowerCase();
        return Boolean((barcode && itemBarcode === barcode) || (normalizedBrand && itemBrand === normalizedBrand));
      });

      if (!alreadyExists) {
        const saveRes = await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authH() },
          credentials: 'include',
          body: JSON.stringify(buildFeedingPlanSaveBody(plan, [
            ...existingItems,
            {
              food_brand: brand,
              barcode,
              category: 'food',
              mode: 'kibble',
              is_primary: false,
            },
          ])),
        });
        if (!saveRes.ok) throw new Error('save failed');
      }

      dispatchFoodPlanUpdated();
      onSaved?.();
      await refreshFoodPlan();
      setViewSection('petiscos');
      clearSuccessMessageTimer();
      setFeedback(null);
      setSuccessMessage(alreadyExists ? `✅ ${brand} já estava nos petiscos` : `✅ ${brand} adicionado aos petiscos`);
      successMessageTimerRef.current = setTimeout(() => {
        setSuccessMessage(null);
        successMessageTimerRef.current = null;
      }, 3000);
    } catch {
      setFeedback({ msg: 'Não deu pra salvar agora. Tente de novo.', tone: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const persistScannedFoodProduct = (product: ScannedProduct, asPrimary: boolean) => {
    if (!asPrimary) {
      void persistSecondaryFoodDirect(product);
      return;
    }
    try {
      sessionStorage.setItem(
        'petmol_pending_scanned_product',
        JSON.stringify({
          petId: pet.pet_id,
          asPrimary,
          product: {
            ...product,
            category: 'food',
          },
        }),
      );
    } catch {
      // non-blocking
    }
    setFormRequest({ id: Date.now(), mode: 'edit' });
    setMode('edit');
  };

  const handleFoodProductConfirmed = (product: ScannedProduct, intent: 'ask' | 'secondary' = foodScanIntent) => {
    if (!hasFood) {
      // Primeiro cadastro NÃO é garantia de ração principal — o tutor pode
      // muito bem escanear um petisco primeiro (bug real reportado: um
      // produto claramente petisco, ex. contendo "biscoito"/"snack" no
      // nome, virava ração automaticamente sem nunca perguntar). Só pula a
      // pergunta quando o nome não bate com nenhuma palavra de petisco —
      // no caso ambíguo/petisco, mostra a mesma tela de classificação.
      if (guessFoodKind(`${product.name || ''} ${product.brand || ''}`) === 'petisco') {
        setPendingClassifyProduct(product);
        return;
      }
      persistScannedFoodProduct(product, true);
      return;
    }
    if (intent === 'secondary') {
      persistScannedFoodProduct(product, false);
      return;
    }
    setPendingClassifyProduct(product);
  };

  const handleClose = useCallback(() => {
    clearPendingScannedProduct();
    onClose();
  }, [onClose]);

  type RefreshedPlanAlert = { recommendedAlertDate: string | null; reminderTime: string | null; brand: string } | null;

  const refreshFoodPlan = async (): Promise<RefreshedPlanAlert> => {
    setShowFreshChoice(false);
    try {
      const response = await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan`, {
        headers: authH(),
        credentials: 'include',
      });

      if (response.status === 404) {
        setHasFoodConfigured(false);
        setIsNonKibbleDeclared(false);
        setNextReminderDate(null);
        setReminderTime(null);
        setFoodBrand('');
        setFoodState({
          showForm: false,
          commerceStatus: null,
          foodBrand: '',
          daysLeft: null,
          restockDate: null,
          packageSizeKg: null,
          dailyConsumptionG: null,
          durationDays: null,
          startDate: null,
          gtin: null,
          secondaryItems: [],
        });
        return null;
      }

      if (!response.ok) return null;
      const payload: FeedingPlanApiResponse = await response.json();
      const plan = payload.plan;
      const estimate = payload.estimate;

      const items = Array.isArray(plan?.items) ? plan.items : [];
      const primary = items.find((item) => item?.is_primary) ?? items[0] ?? null;

      const brand = normalizeFoodName((primary?.food_brand ?? plan?.food_brand ?? '').trim());
      const packageSizeKg = primary?.package_size_kg ?? plan?.package_size_kg ?? null;
      const dailyConsumptionG = primary?.daily_amount_g ?? plan?.daily_amount_g ?? null;
      const durationDays = primary?.duration_days ?? plan?.duration_days ?? null;
      const startDate = (primary?.last_refill_date ?? plan?.last_refill_date ?? null);
      const gtin = (primary?.barcode || '').trim() || null;
      const secondaryItems = items
        .filter((item) => !item?.is_primary && (item?.food_brand || '').trim())
        .map((item, index) => ({
          id: item.id || `secondary-${index}`,
          brand: (item.food_brand || '').trim(),
          barcode: (item.barcode || '').trim() || null,
          packageSizeKg: item.package_size_kg ?? null,
        }));
      const manualReminderDays = plan?.manual_reminder_days_before ?? null;
      const safetyBufferDays = plan?.safety_buffer_days ?? null;
      const resolvedReminderDays = manualReminderDays ?? safetyBufferDays;
      const startDateOnly = startDate ? startDate.split('T')[0] : null;
      const durationEndDate = startDateOnly && durationDays ? addDaysLocal(startDateOnly, durationDays) : null;
      const estimatedEndDate = estimate?.estimated_end_date ?? durationEndDate ?? plan?.next_purchase_date ?? null;
      const daysLeft = estimate?.estimated_days_left ?? (estimatedEndDate ? diffFromLocalToday(estimatedEndDate) : null);
      const nextReminder = estimate?.recommended_alert_date
        ?? (estimatedEndDate && resolvedReminderDays != null ? addDaysLocal(estimatedEndDate, -resolvedReminderDays) : null);
      const hasPersistedPlan = Boolean(plan && plan.enabled !== false);
      const nonKibbleDeclared = Boolean(
        plan?.no_consumption_control && plan?.mode && plan.mode !== 'kibble' && !brand,
      );
      setIsNonKibbleDeclared(nonKibbleDeclared);

      const hasConfiguredData = Boolean(
        hasPersistedPlan ||
        brand ||
        packageSizeKg != null ||
        dailyConsumptionG != null ||
        durationDays != null ||
        startDate ||
        plan?.next_purchase_date ||
        items.some((item) => Boolean(item?.food_brand || item?.package_size_kg != null || item?.daily_amount_g != null || item?.duration_days != null || item?.last_refill_date)),
      );

      const commerce = resolveFoodCommerceSnapshot({
        brand,
        packageSizeKg: packageSizeKg != null ? String(packageSizeKg) : null,
        daysLeft,
        estimatedEndDate: estimatedEndDate ? fmtDate(estimatedEndDate) : null,
      });

      setHasFoodConfigured(hasConfiguredData);
      setNextReminderDate(nextReminder);
      setReminderTime(plan?.reminder_time ?? null);
      setFoodBrand(brand);
      setFoodState({
        showForm: false,
        commerceStatus: commerce?.status ?? null,
        foodBrand: brand,
        daysLeft,
        restockDate: estimatedEndDate,
        packageSizeKg: packageSizeKg ?? null,
        dailyConsumptionG: dailyConsumptionG ?? null,
        durationDays: durationDays ?? null,
        startDate: startDateOnly,
        gtin,
        secondaryItems,
      });

      return { recommendedAlertDate: nextReminder, reminderTime: plan?.reminder_time ?? null, brand };
    } catch {
      // Preserve current view state on transient failures
      return null;
    }
  };

  // ── API ────────────────────────────────────────────────────────────────────

  const authH = (): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  // "Não uso ração" — declaração explícita e mínima (sem marca, peso, consumo).
  // Feedback do usuário: pra quem dá comida natural/caseira, o card da home
  // deve ficar calmo ("não rastreado"), não insistir em pedir dados que não
  // existem. O backend já suporta isso (mode + no_consumption_control, todo
  // o resto opcional) — só faltava um jeito de declarar isso em 1 toque.
  const handleDeclareNonKibble = async () => {
    setDeclaringNonKibble(true);
    try {
      const res = await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH() },
        credentials: 'include',
        body: JSON.stringify({ mode: 'homemade', no_consumption_control: true, enabled: true }),
      });
      if (!res.ok) {
        setFeedback({ msg: 'Não deu pra salvar agora. Tente de novo.', tone: 'red' });
        return;
      }
      await refreshFoodPlan();
      dispatchFoodPlanUpdated();
      onSaved?.();
      showSuccessAndReturnToMain('Combinado — não vamos controlar estoque para esta alimentação.');
    } catch {
      setFeedback({ msg: 'Não deu pra salvar agora. Tente de novo.', tone: 'red' });
    } finally {
      setDeclaringNonKibble(false);
    }
  };

  // "🗑️ Excluir plano" — ação direta na tela principal em vez de enterrada
  // dentro de "Editar plano" → "Editar manualmente" → rolar até achar o
  // botão. Remove ração principal E todos os petiscos (o backend só tem um
  // DELETE de plano inteiro, não por item — mesmo comportamento do "Excluir
  // controle" que já existia dentro do formulário).
  const handleDeletePlan = async () => {
    const accepted = await requestUserDecision(
      `Excluir o plano de alimentação ${petDo(pet)} ${pet.pet_name}? Isso remove a ração principal e todos os petiscos cadastrados — não dá pra desfazer.`,
      { title: 'Excluir plano de alimentação', tone: 'danger', confirmLabel: 'Excluir plano' },
    );
    if (!accepted) return;
    setDeletingPlan(true);
    try {
      await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan`, {
        method: 'DELETE',
        headers: authH(),
        credentials: 'include',
      });
      dispatchFoodPlanUpdated();
      onSaved?.();
      await refreshFoodPlan();
    } catch {
      setFeedback({ msg: 'Não deu pra excluir agora. Tente de novo.', tone: 'red' });
    } finally {
      setDeletingPlan(false);
    }
  };

  // "🗑️" por item na aba Petiscos — o backend substitui items_json inteiro
  // a cada save (create_or_update_feeding_plan nunca faz merge), então
  // excluir um item significa: buscar o plano atual, tirar só esse item da
  // lista, e regravar o resto exatamente como veio (nenhum campo novo,
  // nenhum default assumido) pra não corromper a ração principal nem
  // resetar lembrete/duração dela.
  const handleDeleteSecondaryItem = async (itemId: string, itemBrand: string) => {
    const accepted = await requestUserDecision(
      `Excluir "${itemBrand}" da lista de petiscos?`,
      { title: 'Excluir item', tone: 'danger', confirmLabel: 'Excluir' },
    );
    if (!accepted) return;
    setDeletingSecondaryId(itemId);
    try {
      const res = await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan`, {
        headers: authH(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('fetch failed');
      const payload: FeedingPlanApiResponse = await res.json();
      const plan = payload.plan;
      if (!plan) return;
      const remaining = (plan.items || []).filter((item) => (item.id || '') !== itemId);
      const saveRes = await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH() },
        credentials: 'include',
        body: JSON.stringify(buildFeedingPlanSaveBody(plan, remaining)),
      });
      if (!saveRes.ok) throw new Error('save failed');
      dispatchFoodPlanUpdated();
      onSaved?.();
      await refreshFoodPlan();
    } catch {
      setFeedback({ msg: 'Não deu pra excluir agora. Tente de novo.', tone: 'red' });
    } finally {
      setDeletingSecondaryId(null);
    }
  };

  const upsertRacaoEvent = async (date: string) => {
    const brand = foodBrand || 'Ração';
    const headers = { 'Content-Type': 'application/json', ...authH() };
    if (racaoEventId) {
      await fetch(`${API_BASE_URL}/events/${racaoEventId}`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ title: brand, scheduled_at: `${date}T00:00:00`, status: 'active' }),
      });
    } else {
      await fetch(`${API_BASE_URL}/events`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ pet_id: pet.pet_id, type: 'racao', title: brand, scheduled_at: `${date}T00:00:00`, status: 'active', source: 'manual' }),
      });
    }
  };

  const callRestock = async () => {
    const r = await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan/restock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH() },
      credentials: 'include',
      body: JSON.stringify({ refill_date: localTodayISO() }),
    });
    return r.ok;
  };

  const callAdjust = async (targetDate: string) => {
    const r = await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan/adjust`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authH() },
      credentials: 'include',
      body: JSON.stringify({ action: 'set_end_date', days: 0, target_date: targetDate }),
    });
    return r.ok;
  };

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleCompreiMesmoPacote = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      trackV1Metric('food_restock_confirmed', { pet_id: pet.pet_id, source: 'sheet' });
      trackV1Metric('food_purchase_confirmed', { pet_id: pet.pet_id, source: 'sheet', channel: 'same_package' });
      const ok = await callRestock();
      if (ok) {
        void upsertRacaoEvent(localTodayISO());
        onSaved?.();
        const refreshed = await refreshFoodPlan();
        dispatchFoodPlanUpdated();
        if (refreshed?.recommendedAlertDate) {
          const t = getToken();
          if (t) void scheduleFoodReminder({ pet_id: pet.pet_id, type: 'food', title: `🛒 Comprar ração de ${pet.pet_name}`, body: `O estoque de ${refreshed.brand || 'ração'} de ${pet.pet_name} está acabando. Hora de comprar!`, remind_at: buildRemindAt(refreshed.recommendedAlertDate, refreshed.reminderTime ?? '09:00') }, t);
        }
        showSuccessAndReturnToMain('Compra registrada');
      }
      else setFeedback({ msg: 'Não foi possível registrar. Tente novamente.', tone: 'red' });
    } catch {
      setFeedback({ msg: 'Sem conexão. Tente novamente.', tone: 'red' });
    } finally {
      setBusy(false);
    }
  };

  // "📦 Ajustar previsão" → set_end_date from today + days
  const handleAdjustDuration = async (targetDate: string) => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    const prevEnd = estEnd;
    const prevDailyG = foodState.dailyConsumptionG;
    const daysFromNow = Math.round(
      (new Date(targetDate + 'T00:00:00').getTime() - new Date(localTodayISO() + 'T00:00:00').getTime()) / 86400000
    );
    try {
      trackV1Metric('food_still_has_food', { pet_id: pet.pet_id, days_from_now: daysFromNow, source: 'adjust_duration' });
      trackV1Metric('food_duration_adjusted', {
        pet_id: pet.pet_id,
        new_end_date: targetDate,
        previous_end_date: prevEnd,
        days_from_now: daysFromNow,
        old_daily_consumption_g: prevDailyG,
        package_size_kg: foodState.packageSizeKg,
        old_estimated_end_date: prevEnd,
        new_estimated_end_date: targetDate,
        delta_days: daysFromNow - (foodState.daysLeft ?? 0),
      });
      const ok = await callAdjust(targetDate);
      if (ok) {
        void upsertRacaoEvent(localTodayISO());
        onSaved?.();
        const refreshed = await refreshFoodPlan();
        dispatchFoodPlanUpdated();
        if (refreshed?.recommendedAlertDate) {
          const t = getToken();
          if (t) void scheduleFoodReminder({ pet_id: pet.pet_id, type: 'food', title: `🛒 Comprar ração de ${pet.pet_name}`, body: `O estoque de ${refreshed.brand || 'ração'} de ${pet.pet_name} está acabando. Hora de comprar!`, remind_at: buildRemindAt(refreshed.recommendedAlertDate, refreshed.reminderTime ?? '09:00') }, t);
        }
        showSuccessAndReturnToMain('Previsão ajustada');
      }
      else {
        setFeedback({ msg: 'Não foi possível ajustar. Tente novamente.', tone: 'red' });
      }
    } catch {
      setFeedback({ msg: 'Sem conexão. Tente novamente.', tone: 'red' });
    } finally {
      setBusy(false);
    }
  };

  // "⚠️ Acabou" → mark as finished today and go straight to buy screen
  const handleFinishedNow = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    const today = localTodayISO();
    try {
      trackV1Metric('food_finished_early', {
        pet_id: pet.pet_id,
        finished_date: today,
        old_estimated_end_date: estEnd,
        new_estimated_end_date: today,
        old_daily_consumption_g: foodState.dailyConsumptionG,
        package_size_kg: foodState.packageSizeKg,
        delta_days: -(foodState.daysLeft ?? 0),
      });
      const ok = await callAdjust(today);
      if (ok) {
        void upsertRacaoEvent(today);
        onSaved?.();
        await refreshFoodPlan();
        dispatchFoodPlanUpdated();
        const t = getToken();
        if (t) void cancelFoodRemindersForPet(pet.pet_id, t);
        setSubMode('main');
        setMode('buy');
        setFeedback(null);
      } else {
        setFeedback({ msg: 'Não foi possível atualizar. Tente novamente.', tone: 'red' });
      }
    } catch {
      setFeedback({ msg: 'Sem conexão. Tente novamente.', tone: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const handleChannelSelect = (channel: PurchaseChannel) => {
    trackV1Metric('purchase_channel_selected', {
      pet_id: pet.pet_id,
      channel,
      channel_type: channel === 'loja_fisica' || channel === 'outro' ? 'physical' : 'online',
      source: 'food_sheet',
    });
    trackV1Metric('food_purchase_confirmed', { pet_id: pet.pet_id, channel, source: 'channel_picker' });
    void refreshFoodPlan().finally(() => {
      dispatchFoodPlanUpdated();
      showSuccessAndReturnToMain('Novo ciclo iniciado');
    });
  };

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleClose]);

  useEffect(() => {
    void refreshFoodPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet.pet_id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ petId?: string }>;
      if (custom.detail?.petId && custom.detail.petId !== pet.pet_id) return;
      void refreshFoodPlan();
    };
    window.addEventListener('petmol:feeding-plan-updated', handler as EventListener);
    return () => window.removeEventListener('petmol:feeding-plan-updated', handler as EventListener);
  }, [pet.pet_id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      clearSuccessMessageTimer();
    };
  }, []);

  useEffect(() => {
    trackV1Metric('food_alert_opened', {
      source: initialMode === 'buy' ? 'food_push' : 'food_sheet',
      pet_id: pet.pet_id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setPhotoLoadFailed(false); }, [petPhotoSrc]);

  // Reset submode when switching to view
  useEffect(() => { if (mode === 'view') { setSubMode('main'); setViewSection('racao'); } }, [mode]);

  // Scroll to top when subMode changes so new content is visible from the beginning
  useEffect(() => {
    scrollBodyRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [subMode]);

  // ── Back button (shared) ───────────────────────────────────────────────────

  const BackBtn = ({ onClick }: { onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="relative z-10 pointer-events-auto flex items-center gap-1.5 h-11 px-3 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0 text-sm font-semibold"
      aria-label="Voltar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4 flex-shrink-0">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      <span className="leading-none">Voltar</span>
    </button>
  );

  // ── Feedback banner ────────────────────────────────────────────────────────

  const FeedbackBanner = () => {
    if (!feedback) return null;
    const cls = feedback.tone === 'green' ? 'border-green-200 bg-green-50 text-green-900'
              : feedback.tone === 'red'   ? 'border-red-200 bg-red-50 text-red-900'
              :                             'border-blue-200 bg-blue-50 text-blue-900';
    const icon = feedback.tone === 'green' ? '✅' : feedback.tone === 'red' ? '⚠️' : 'ℹ️';
    return (
      <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${cls}`}>
        <span className="flex-shrink-0 mt-0.5">{icon}</span>
        <span>{feedback.msg}</span>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ModalPortal>
      <div ref={overlayRef}
        className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overscroll-x-none touch-pan-y p-4"
        onClick={(e) => { if (e.target === overlayRef.current) handleClose(); }}
      >
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={handleClose} />

        <div
          className="relative w-full max-w-md bg-white rounded-[28px] shadow-2xl border border-gray-200/60 flex flex-col overflow-x-hidden overflow-y-hidden animate-scaleIn touch-manipulation"
          style={{ maxHeight: 'min(92dvh, 760px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Success overlay */}
          {justSaved && (
            <div className="absolute inset-0 bg-white z-20 flex flex-col items-center justify-center gap-6 text-center p-8 rounded-[28px]">
              <div className="text-6xl">✅</div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Ração registrada!</h3>
                <p className="text-sm text-gray-500">O prontuário do pet foi atualizado.</p>
              </div>
              <button
                onClick={() => onGoHome?.()}
                className="w-full rounded-2xl bg-blue-600 py-3.5 text-[15px] font-black text-white shadow-md shadow-blue-500/20 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                Ir para a home
              </button>
              <button onClick={() => setJustSaved(false)} className="text-sm text-gray-400 underline">
                Ver prontuário
              </button>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              EDIT / REPLACE MODE
          ═══════════════════════════════════════════════════════════════ */}
          {mode === 'edit' && (
            <>
              <div className="relative z-10 flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
                <PhotoBubble size={36} photoSrc={petPhotoSrc} photoFailed={photoLoadFailed} onPhotoError={() => setPhotoLoadFailed(true)} species={pet.species} petName={pet.pet_name} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Editar plano
                  </p>
                  <p className="text-[15px] font-black text-gray-900">{pet.pet_name}</p>
                </div>
                <button
                  type="button"
                  onClick={handleEditBackToView}
                  className="pointer-events-auto flex items-center gap-1.5 h-11 px-3 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0 text-sm font-semibold"
                  aria-label="Voltar"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4 flex-shrink-0">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  <span className="leading-none">Voltar</span>
                </button>
              </div>
              <div className="px-4 pt-3 flex-shrink-0">
                <FeedbackBanner />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <FoodControlTab
                  petId={pet.pet_id} petName={pet.pet_name}
                  species={(pet.species as 'dog' | 'cat') || 'dog'}
                  formRequest={formRequest}
                  embedded
                  hideInternalHeader
                  onRequestBack={handleEditBackToView}
                  onStateChange={handleFoodControlStateChange}
                  onSaved={async () => {
                    onSaved?.();
                    await refreshFoodPlan();
                    dispatchFoodPlanUpdated();
                    const isQuickSetup = formRequest?.mode === 'quick_setup';
                    showSuccessAndReturnToMain(isQuickSetup ? 'Ração cadastrada' : 'Plano atualizado');
                  }}
                />
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              BUY MODE
          ═══════════════════════════════════════════════════════════════ */}
          {mode === 'buy' && (
            <>
              <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 flex-shrink-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl flex-shrink-0">🛒</div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-gray-900 truncate">
                    {buyTargetItem ? `Comprar ${buyTargetItem.label}` : (foodBrand ? `Comprar ${foodBrand}` : 'Comprar ração')}
                  </h2>
                  <p className="text-xs text-gray-400">{pet.pet_name}</p>
                </div>
                <BackBtn onClick={() => { setMode('view'); setBuyTargetItem(null); }} />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="p-5 pb-8 space-y-4">
                  {buyTargetItem || foodBrand || foodState.gtin ? (
                    <MonetizedOffersList
                      query={buyTargetItem ? buyTargetItem.query : (foodBrand ? `${foodBrand} ração` : 'ração pet')}
                      packageSizeKg={buyTargetItem ? buyTargetItem.packageSizeKg : foodState.packageSizeKg}
                      gtin={buyTargetItem ? buyTargetItem.gtin : foodState.gtin}
                      brand={buyTargetItem ? undefined : foodBrand}
                      productName={buyTargetItem ? buyTargetItem.label : undefined}
                      petId={pet.pet_id}
                      productLabel={buyTargetItem ? buyTargetItem.label : (foodBrand || 'Ração')}
                      icon={buyTargetItem ? '🦴' : '🥣'}
                      source="food_sheet"
                      ctaType="food_buy_direct"
                      controlType="food"
                    />
                  ) : (
                    <>
                      <AffiliateCatalogSearch
                        petId={pet.pet_id}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setFormRequest({ id: Date.now(), mode: 'quick_setup' });
                          setMode('edit');
                        }}
                        className="w-full py-3 rounded-2xl border border-emerald-200 bg-emerald-50 text-[14px] font-black text-emerald-800 active:scale-[0.98] transition-all"
                      >
                        Já comprei — cadastrar ração
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              VIEW MODE
          ═══════════════════════════════════════════════════════════════ */}
          {mode === 'view' && (
            <>
              {/* Fixed header */}
              <div className="px-4 pt-1 pb-3 flex items-center gap-3 flex-shrink-0">
                <PhotoBubble size={44} photoSrc={petPhotoSrc} photoFailed={photoLoadFailed} onPhotoError={() => setPhotoLoadFailed(true)} species={pet.species} petName={pet.pet_name} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-[18px] font-black text-gray-900 leading-tight">
                    {/* Título da tela sempre "Alimentação" — é a mesma
                        palavra do card da home que abre esse sheet. A aba
                        Ração/Petiscos logo abaixo já deixa claro qual dos
                        dois está sendo visto, sem precisar duplicar isso
                        no título. */}
                    Alimentação {petDo(pet)} {pet.pet_name}
                  </h2>
                </div>
                {subMode !== 'main' ? (
                  <button
                    type="button"
                    onClick={handleSubModeBackToMain}
                    className="relative z-10 pointer-events-auto flex items-center gap-1.5 h-11 px-3 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0 text-sm font-semibold"
                    aria-label="Voltar"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4 flex-shrink-0">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                    <span className="leading-none">Voltar</span>
                  </button>
                ) : (
                  <button type="button" onClick={handleClose}
                    className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 active:scale-90 transition-all flex-shrink-0"
                    aria-label="Fechar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Abas Ração / Petiscos — troca qual seção aparece, em vez de
                  empilhar as duas numa rolagem só (pedido do tutor: mais
                  simples e direto pra quem tem dificuldade com o app). */}
              {hasFood && !isNonKibbleDeclared && !showFreshChoice && subMode === 'main' && (
                <div className="px-4 pb-3 flex-shrink-0">
                  <div className="flex rounded-full bg-gray-100 p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setViewSection('racao')}
                      className={`flex-1 rounded-full py-2 text-[13px] font-bold transition-all ${viewSection === 'racao' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-400'}`}
                    >
                      🥣 Ração
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewSection('petiscos')}
                      className={`flex-1 rounded-full py-2 text-[13px] font-bold transition-all ${viewSection === 'petiscos' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-400'}`}
                    >
                      🦴 Petiscos{foodState.secondaryItems.length > 0 ? ` (${foodState.secondaryItems.length})` : ''}
                    </button>
                  </div>
                </div>
              )}

              {/* Fixed success toast — outside scroll area */}
              {successMessage && (
                <div className="flex-shrink-0 px-4 pb-2">
                  <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-900">
                    {successMessage}
                  </div>
                </div>
              )}

              {/* Scrollable body */}
              <div ref={scrollBodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="px-4 pb-8 space-y-4">
                  {(!hasFood || showFreshChoice) && (
                    <CoachMark id="food-intro">
                      Cadastrando o que {pet.pet_name} come, o PETMOL estima quando a ração vai acabar
                      e facilita a próxima compra — sem você precisar ficar de olho no saco.
                    </CoachMark>
                  )}
                  {/* ── SEM RAÇÃO ──────────────────────────────────────────── */}
                  {(!hasFood || showFreshChoice) && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-4">
                      <div>
                        <h3 className="text-[20px] font-black text-gray-900 leading-tight">Como {pet.pet_name} se alimenta?</h3>
                        <p className="text-[13px] text-amber-900/80 mt-1">Busque o produto pelo nome ou marca — sem código de barras à mão também dá.</p>
                      </div>
                      <div className="space-y-2">
                        <ProductBarcodeScanner
                          label="Escanear código de barras"
                          expectedCategory="food"
                          defaultMode="scan"
                          petId={pet.pet_id}
                          petName={pet.pet_name}
                          allowScanning
                          onProductConfirmed={(product) => {
                            setFoodScanIntent('ask');
                            handleFoodProductConfirmed(product, 'ask');
                          }}
                        />

                        <button
                          type="button"
                          onClick={() => {
                            trackV1Metric('food_buy_clicked', { pet_id: pet.pet_id, days_left: null });
                            setMode('buy');
                          }}
                          className="w-full flex items-center justify-center gap-2.5 py-3 min-h-[44px] rounded-2xl bg-emerald-500 text-[14px] font-black text-white shadow-md shadow-emerald-500/25 active:scale-95 transition-all"
                        >
                          <span className="text-lg">🛒</span>
                          Comprar ração
                        </button>

                        {/* Não usa ração de saco */}
                        <button
                          type="button"
                          onClick={handleDeclareNonKibble}
                          disabled={declaringNonKibble}
                          className="w-full flex items-center justify-center gap-2 py-3 min-h-[44px] rounded-2xl border border-gray-200 bg-white text-[14px] font-semibold text-gray-700 hover:bg-gray-50 active:scale-95 disabled:opacity-50 transition-all"
                        >
                          <span className="text-lg">🍲</span>
                          {declaringNonKibble ? 'Salvando...' : 'Alimentação Caseira'}
                        </button>

                        <button
                          type="button"
                          onClick={() => (showFreshChoice ? setShowFreshChoice(false) : handleClose())}
                          className="w-full py-2 text-[12px] font-medium text-gray-300 hover:text-gray-500 transition-colors"
                        >
                          {showFreshChoice ? 'Cancelar' : 'Fazer depois'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── ALIMENTAÇÃO NÃO-RAÇÃO DECLARADA ─────────────────────── */}
                  {hasFood && isNonKibbleDeclared && !showFreshChoice && (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-4">
                      <div>
                        <h3 className="text-[17px] font-bold text-gray-900 leading-tight">Alimentação de {pet.pet_name}</h3>
                        <p className="text-[13px] text-gray-500 mt-1">Você disse que não usa ração de saco — não vamos controlar estoque nem avisar antes de acabar.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFreshChoice(true)}
                        className="w-full py-3 min-h-[44px] rounded-2xl border border-gray-200 bg-white text-[13px] font-semibold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                      >
                        Na verdade, mudei de ideia
                      </button>
                    </div>
                  )}

                  {/* ── COM RAÇÃO ──────────────────────────────────────────── */}
                  {hasFood && !isNonKibbleDeclared && !showFreshChoice && (
                    <>
                      {/* ─── SUBMODE: main ─────────────────────────────────── */}
                      {subMode === 'main' && (
                        <>
                        {/* ─── SEÇÃO A: RAÇÃO PRINCIPAL ──────────────────────────
                            Só aparece na aba "🥣 Ração" — controle de peso/
                            duração/dias restantes, nunca mistura com os itens
                            esporádicos da aba "🦴 Petiscos". */}
                        {viewSection === 'racao' && (
                        <>
                          {/* 1. Status principal */}
                          <div className="rounded-3xl border border-amber-100 bg-amber-50/70 p-4">
                            {foodState.daysLeft !== null ? (
                              <>
                                <div className="flex items-end gap-3">
                                  <p className="text-[52px] font-black text-gray-900 leading-none tracking-tight">
                                    {Math.max(0, foodState.daysLeft)}
                                  </p>
                                  <div className="pb-1">
                                    <p className="text-[16px] font-bold text-gray-800">
                                      {foodState.daysLeft <= 0 ? 'Ração acabou' : 'dias restantes'}
                                    </p>
                                    {estEnd && (
                                      <p className="text-[13px] text-amber-900/70">
                                        Previsão: <span className="font-semibold text-gray-800">{fmtDateShort(estEnd)}</span>
                                      </p>
                                    )}
                                    {nextReminderDate && (
                                      <p className="text-[13px] text-amber-900/70">
                                        Próximo alerta: <span className="font-semibold text-gray-800">{fmtDateShort(nextReminderDate)} às {reminderTime ?? '09:00'}</span>
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <p className="mt-3 text-[13px] text-amber-950/70 leading-snug">
                                  {foodState.daysLeft <= 0
                                    ? 'Está na hora de repor a ração e registrar o novo ciclo.'
                                    : 'Acompanhe a previsão e compre com calma antes de acabar.'}
                                </p>
                              </>
                            ) : (
                              <p className="text-[15px] text-gray-400 py-2">Complete o plano para ver a previsão.</p>
                            )}
                          </div>

                          {/* 2. Produto atual */}
                          {foodBrand && (
                            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
                              <span className="text-2xl flex-shrink-0">🥣</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[15px] font-bold text-gray-900 line-clamp-2 break-words leading-tight">{foodBrand}</p>
                                <p className="text-[12px] text-gray-400">
                                  {[
                                    foodState.packageSizeKg != null
                                      ? `Pacote: ${foodState.packageSizeKg % 1 === 0 ? foodState.packageSizeKg : foodState.packageSizeKg.toFixed(1)} kg`
                                      : null,
                                    foodState.startDate ? `Início: ${fmtDate(foodState.startDate)}` : null,
                                  ].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Feedback banner */}
                          <FeedbackBanner />

                          {/* 3. Ações principais — mesma cor do botão "Comprar" da
                              Loja do Pet (emerald-500), pra reforçar que é a
                              mesma ação em qualquer tela do app. */}
                          <button type="button"
                            onClick={() => {
                              trackV1Metric('food_buy_clicked', { pet_id: pet.pet_id, days_left: foodState.daysLeft });
                              setMode('buy');
                            }}
                            className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.97] transition-all text-white text-[16px] font-black shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-3"
                          >
                            <span className="text-xl">🛒</span>
                            Comprar novamente
                          </button>

                          {/* O botão "Editar" e o painel de opções (escanear/
                              editar manualmente/não uso mais ração) nunca
                              ficam visíveis ao mesmo tempo — um substitui o
                              outro, em vez de empilhar duas UIs de "editar"
                              na mesma tela (confuso, reportado pelo tutor).
                              "Excluir" fica direto ao lado — ação decisiva,
                              sem precisar entrar no painel pra achar. */}
                          {/* Feedback do usuário: "Atualizar" e "Editar plano" eram
                              dois botões pro mesmo lugar, com um passo
                              intermediário no meio — confuso. O botão
                              principal agora vai direto pra mode='edit',
                              que já escaneia código de barras (linha ~1280)
                              além de peso/duração/datas — não precisa de
                              painel de escolha antes. "Não uso mais este
                              produto" e "Excluir" ficam como ações
                              secundárias, sempre visíveis. */}
                          <div className="space-y-2">
                            <button type="button"
                              onClick={() => { setFormRequest({ id: Date.now(), mode: 'edit' }); setMode('edit'); }}
                              className="w-full flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800 shadow-sm active:scale-[0.98] transition-all"
                            >
                              <span className="text-xl">✏️</span>
                              <span className="flex-1 text-left">
                                <span className="block">Editar plano</span>
                                <span className="block text-[12px] font-semibold text-blue-700/70">Código de barras, peso, duração ou datas</span>
                              </span>
                              <span className="text-blue-300 text-lg">›</span>
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => { void handleDeclareNonKibble(); }}
                                disabled={declaringNonKibble}
                                className="w-full py-2 min-h-[40px] rounded-xl bg-white border border-gray-200 text-gray-600 text-[12px] font-semibold hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                <span>🍲</span>
                                {declaringNonKibble ? 'Salvando...' : 'Não uso mais'}
                              </button>
                              <button type="button"
                                onClick={() => { void handleDeletePlan(); }}
                                disabled={deletingPlan}
                                className="w-full py-2 min-h-[40px] rounded-xl bg-white border border-red-100 text-red-500 text-[12px] font-semibold hover:bg-red-50 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                <span>🗑️</span>
                                {deletingPlan ? 'Excluindo...' : 'Excluir plano'}
                              </button>
                            </div>
                          </div>

                          {/* 4. Ajustes rápidos */}
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button"
                              onClick={() => {
                                setSelectedDays(Math.max(1, Math.min(Math.round(foodState.daysLeft ?? 7), 90)));
                                setSubMode('adjustDuration');
                                setFeedback(null);
                              }}
                              disabled={busy}
                              className="py-2.5 min-h-[44px] rounded-2xl bg-white border border-gray-200 text-[11px] font-medium text-gray-500 active:scale-95 transition-all disabled:opacity-50">
                              Ainda vai durar
                            </button>
                            <button type="button"
                              onClick={() => { void handleFinishedNow(); }}
                              disabled={busy}
                              className="py-2.5 min-h-[44px] rounded-2xl bg-white border border-gray-200 text-[11px] font-medium text-gray-500 active:scale-95 transition-all disabled:opacity-50">
                              {busy ? '…' : 'Acabou'}
                            </button>
                          </div>
                        </>
                        )}

                        {/* ─── SEÇÃO B: PETISCOS E OUTROS ────────────────────────
                            Só aparece na aba "🦴 Petiscos" — compra esporádica,
                            sem controle de peso/duração/dias restantes. */}
                        {viewSection === 'petiscos' && (
                        <>
                          <p className="px-1 text-[12px] text-gray-400">Sem controle de dias — compre quando precisar.</p>

                          {foodState.secondaryItems.length > 0 && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-2.5">
                              {foodState.secondaryItems.map((item) => (
                                <div key={item.id} className="rounded-xl bg-white border border-amber-100 px-3 py-3 space-y-3">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xl flex-shrink-0">🦴</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[14px] font-bold text-gray-900 line-clamp-2 break-words leading-tight">{item.brand}</p>
                                      {item.packageSizeKg != null && (
                                        <p className="text-[11px] text-gray-400">
                                          {item.packageSizeKg % 1 === 0 ? item.packageSizeKg : item.packageSizeKg.toFixed(1)} kg
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBuyTargetItem({
                                        label: item.brand,
                                        query: item.brand,
                                        gtin: item.barcode,
                                        packageSizeKg: item.packageSizeKg,
                                      });
                                      setMode('buy');
                                    }}
                                    className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-600 px-4 py-3 min-h-[48px] text-[14px] font-black text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                  >
                                    <span>🛒</span>
                                    Comprar novamente
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { void handleDeleteSecondaryItem(item.id, item.brand); }}
                                    disabled={deletingSecondaryId === item.id}
                                    className="w-full py-1 text-[11px] font-semibold text-gray-400 hover:text-red-500 active:scale-[0.98] transition-all disabled:opacity-50"
                                  >
                                    {deletingSecondaryId === item.id ? 'Removendo...' : 'Remover petisco'}
                                  </button>
                                </div>
                              ))}
                              <div className="pt-1">
                                <ProductBarcodeScanner
                                  label="Adicionar outro alimento"
                                  expectedCategory="food"
                                  defaultMode="scan"
                                  petId={pet.pet_id}
                                  petName={pet.pet_name}
                                  allowScanning
                                  onProductConfirmed={(product) => {
                                    setFoodScanIntent('secondary');
                                    handleFoodProductConfirmed(product, 'secondary');
                                  }}
                                />
                              </div>
                            </div>
                          )}
                          {foodState.secondaryItems.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/40 p-3">
                              <ProductBarcodeScanner
                                label="Adicionar petisco ou outro alimento"
                                expectedCategory="food"
                                defaultMode="scan"
                                petId={pet.pet_id}
                                petName={pet.pet_name}
                                allowScanning
                                onProductConfirmed={(product) => {
                                  setFoodScanIntent('secondary');
                                  handleFoodProductConfirmed(product, 'secondary');
                                }}
                              />
                            </div>
                          )}
                        </>
                        )}
                        </>
                      )}

                      {/* ─── SUBMODE: adjustDuration ────────────────────────── */}
                      {subMode === 'adjustDuration' && (
                        <div className="space-y-5 pt-1">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ajustar previsão</p>
                            <h3 className="text-[20px] font-black text-gray-900 leading-tight mt-1">
                              Por quantos dias a ração ainda deve durar?
                            </h3>
                            <p className="text-[13px] text-gray-500 mt-1">
                              Arraste para selecionar os dias restantes
                            </p>
                          </div>

                          <DaysScrollPicker
                            value={selectedDays}
                            onChange={setSelectedDays}
                            min={1}
                            max={90}
                          />

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleAdjustDuration(isoPlus(selectedDays))}
                            className="w-full py-4 rounded-2xl bg-blue-600 text-white text-[16px] font-black shadow-lg shadow-blue-500/25 hover:bg-blue-700 active:scale-[0.97] transition-all disabled:opacity-50"
                          >
                            {busy ? 'Ajustando…' : `Confirmar ${selectedDays} dia${selectedDays !== 1 ? 's' : ''}`}
                          </button>

                          <FeedbackBanner />
                        </div>
                      )}

                      {/* ─── SUBMODE: restockConfirm ─────────────────────── */}
                      {subMode === 'restockConfirm' && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Novo ciclo</p>
                            <h3 className="text-[20px] font-black text-gray-900 leading-tight mt-1">Você comprou novamente?</h3>
                          </div>

                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={handleCompreiMesmoPacote}
                              disabled={busy}
                              className="w-full py-3.5 rounded-2xl border border-green-200 bg-green-50 text-[15px] font-semibold text-green-800 text-left px-5 hover:bg-green-100 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                              Mesmo pacote
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFormRequest({ id: Date.now(), mode: 'edit' });
                                setMode('edit');
                                setSubMode('main');
                              }}
                              disabled={busy}
                              className="w-full py-3.5 rounded-2xl border border-gray-200 bg-white text-[15px] font-semibold text-gray-800 text-left px-5 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                              Outro pacote
                            </button>
                          </div>

                          <FeedbackBanner />
                        </div>
                      )}

                      {/* ─── SUBMODE: channel ───────────────────────────────── */}
                      {subMode === 'channel' && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Compra registrada ✅</p>
                            <h3 className="text-[20px] font-black text-gray-900 leading-tight mt-1">Onde você comprou?</h3>
                            <p className="text-[13px] text-gray-400 mt-0.5">Opcional — nos ajuda a melhorar.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                ['cobasi', 'Cobasi'],
                                ['petz', 'Petz'],
                                ['mercadolivre', 'Mercado Livre'],
                                ['shopee', 'Shopee'],
                                ['loja_fisica', 'Loja física'],
                                ['outro', 'Outro'],
                              ] as [PurchaseChannel, string][]
                            ).map(([id, label]) => (
                              <button type="button" key={id} onClick={() => handleChannelSelect(id)}
                                className="py-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-95 transition-all">
                                {label}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => { void refreshFoodPlan().finally(() => { dispatchFoodPlanUpdated(); showSuccessAndReturnToMain('Novo ciclo iniciado'); }); }}
                            className="w-full text-center text-sm text-gray-400 hover:text-gray-600 min-h-[44px] py-3 transition-colors">
                            Pular
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Passo de classificação ração x petisco — tela cheia dedicada em vez
          de modal pequeno em cima da tela principal (já lotada). Pedido do
          tutor: precisa ser óbvio até pra quem tem dificuldade com apps,
          então cada opção já explica o que ela significa (mesmo texto das
          seções "Ração principal"/"Petiscos e outros" da tela principal,
          pra reforçar o mesmo modelo mental em vez de introduzir termos
          novos aqui). */}
      {pendingClassifyProduct && (
        <ModalPortal>
          <div className="fixed inset-0 z-[210] flex flex-col bg-white">
            <div className="flex items-center px-4 pt-4 pb-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setPendingClassifyProduct(null)}
                className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 active:scale-90 transition-all"
                aria-label="Cancelar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-10 flex flex-col items-center justify-center gap-7 text-center">
              <div>
                <p className="text-[44px] leading-none mb-3">🛒</p>
                <h3 className="text-[22px] font-black text-gray-900 leading-tight">
                  {pendingClassifyProduct.name ? `O que é "${pendingClassifyProduct.name}"?` : 'O que é esse produto?'}
                </h3>
                <p className="text-[14px] text-gray-500 mt-2 max-w-[280px] mx-auto">
                  Toque na opção certa para {pet.pet_name}
                </p>
              </div>

              <div className="w-full max-w-sm space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    const product = pendingClassifyProduct;
                    setPendingClassifyProduct(null);
                    if (product) persistScannedFoodProduct(product, true);
                  }}
                  className={`w-full flex items-center gap-4 p-5 rounded-3xl border-2 border-blue-500 bg-blue-50 hover:bg-blue-100 active:scale-[0.98] transition-all text-left ${suggestedFoodKind === 'racao' ? 'ring-2 ring-blue-300 ring-offset-2' : ''}`}
                >
                  <span className="text-4xl flex-shrink-0">🥣</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[17px] font-black text-blue-950">Ração de todo dia</p>
                      {suggestedFoodKind === 'racao' && (
                        <span className="rounded-full bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">Achamos que é isso</span>
                      )}
                    </div>
                    <p className="text-[13px] text-blue-900/70 mt-0.5">Controla peso e avisa quando for acabar</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const product = pendingClassifyProduct;
                    setPendingClassifyProduct(null);
                    if (product) persistScannedFoodProduct(product, false);
                  }}
                  className={`w-full flex items-center gap-4 p-5 rounded-3xl border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 active:scale-[0.98] transition-all text-left ${suggestedFoodKind === 'petisco' ? 'ring-2 ring-amber-300 ring-offset-2' : ''}`}
                >
                  <span className="text-4xl flex-shrink-0">🦴</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[17px] font-black text-amber-950">Petisco ou extra</p>
                      {suggestedFoodKind === 'petisco' && (
                        <span className="rounded-full bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">Achamos que é isso</span>
                      )}
                    </div>
                    <p className="text-[13px] text-amber-900/70 mt-0.5">Compra ocasional, sem contar os dias</p>
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPendingClassifyProduct(null)}
                className="text-[13px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </ModalPortal>
      )}
    </ModalPortal>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FoodControlTab, type FoodControlTabFormRequest, type FoodControlTabState } from '@/components/FoodControlTab';
import type { PetHealthProfile } from '@/lib/petHealth';
import { ModalPortal } from '@/components/ModalPortal';
import { trackPartnerClicked, trackV1Metric } from '@/lib/v1Metrics';
import { API_BACKEND_BASE } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { localTodayISO } from '@/lib/localDate';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';
import { ProductDetectionSheetGold } from '@/components/ProductDetectionSheet';
import type { ScannedProduct } from '@/lib/productScanner';
import {
  HOME_SHOPPING_PARTNERS,
  buildFoodHandoffUrl,
  type HomeShoppingPartnerId,
} from '@/features/commerce/homeShoppingPartners';
import { resolveFoodCommerceSnapshot } from '@/features/commerce/homeContextualCommerce';

export interface FoodItemSheetProps {
  pet: PetHealthProfile;
  onClose: () => void;
  onSaved?: () => void;
  initialMode?: 'view' | 'buy';
  petPhotoUrl?: string | null;
}

// Sheet-level navigation (page swaps)
type SheetMode = 'view' | 'edit' | 'buy';

// Internal submodes within view — no router.push, no sheet close
type FoodSubMode = 'main' | 'adjustDuration' | 'finished' | 'channel' | 'restockConfirm';

type PurchaseChannel = 'petz' | 'cobasi' | 'amazon' | 'petlove' | 'loja_fisica' | 'outro';

type FeedingPlanApiResponse = {
  status: string;
  pet_id: string;
  plan: {
    pet_id?: string | null;
    enabled?: boolean | null;
    no_consumption_control?: boolean | null;
    food_brand?: string | null;
    package_size_kg?: number | null;
    daily_amount_g?: number | null;
    last_refill_date?: string | null;
    safety_buffer_days?: number | null;
    manual_reminder_days_before?: number | null;
    reminder_time?: string | null;
    next_purchase_date?: string | null;
    items?: Array<{
      food_brand?: string | null;
      package_size_kg?: number | null;
      daily_amount_g?: number | null;
      last_refill_date?: string | null;
      is_primary?: boolean;
    }>;
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

function endISO(daysLeft: number | null): string | null {
  return daysLeft === null ? null : isoPlus(daysLeft);
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

// ── component ─────────────────────────────────────────────────────────────────

export function FoodItemSheet({ pet, onClose, onSaved, initialMode, petPhotoUrl }: FoodItemSheetProps) {
  // Navigation
  const [mode, setMode]           = useState<SheetMode>(initialMode === 'buy' ? 'buy' : 'view');
  const [subMode, setSubMode]     = useState<FoodSubMode>('main');

  // Food data (populated by hidden FoodControlTab)
  const [foodBrand, setFoodBrand] = useState('');
  const [foodState, setFoodState] = useState<FoodControlTabState>({
    showForm: false, commerceStatus: null, foodBrand: '',
    daysLeft: null, restockDate: null, packageSizeKg: null,
    dailyConsumptionG: null, startDate: null,
  });

  // Partner / commerce
  const [formRequest, setFormRequest]       = useState<FoodControlTabFormRequest | null>(null);

  // Date pickers (shared across submodes — only one active at a time)
  const [customDate, setCustomDate]           = useState(localTodayISO);
  const [showDatePicker, setShowDatePicker]   = useState(false);

  // UI state
  const [busy, setBusy]                           = useState(false);
  const [feedback, setFeedback]                   = useState<{ msg: string; tone: 'green' | 'blue' | 'red' } | null>(null);
  const [showDetails, setShowDetails]             = useState(false);
  const [photoLoadFailed, setPhotoLoadFailed]     = useState(false);
  const [successMessage, setSuccessMessage]       = useState<string | null>(null);
  const [hasFoodConfigured, setHasFoodConfigured] = useState(false);
  const [alertDaysBefore, setAlertDaysBefore]     = useState<number | null>(null);
  const [nextReminderDate, setNextReminderDate]   = useState<string | null>(null);
  const [reminderTime, setReminderTime]           = useState<string | null>(null);
  const [showFoodPhotoFlow, setShowFoodPhotoFlow] = useState(false);
  const [foodPhotoEntry, setFoodPhotoEntry] = useState<'camera' | 'gallery' | null>(null);
  const successMessageTimerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollBodyRef                               = useRef<HTMLDivElement>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const photoSource = petPhotoUrl
    ?? (pet as { photo_url?: string | null; photo?: string | null }).photo_url
    ?? pet.photo;
  const petPhotoSrc = resolvePetPhotoUrl(photoSource);

  const hasFood  = hasFoodConfigured;
  const estEnd   = endISO(foodState.daysLeft);

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
    setShowDatePicker(false);
    setFeedback(null);
    setSuccessMessage(`✅ ${message}`);
    successMessageTimerRef.current = setTimeout(() => {
      setSuccessMessage(null);
      successMessageTimerRef.current = null;
    }, 3000);
  };

  const handleEditBackToView = () => {
    clearSuccessMessageTimer();
    setFormRequest(null);
    setFeedback(null);
    setShowDatePicker(false);
    setSubMode('main');
    setMode('view');
  };

  const handleSubModeBackToMain = () => {
    setSubMode('main');
    setShowDatePicker(false);
    setFeedback(null);
  };

  const openFoodPhotoFlow = (entry?: 'camera' | 'gallery') => {
    setFoodPhotoEntry(entry ?? null);
    setShowFoodPhotoFlow(true);
  };

  const handleFoodProductConfirmed = (product: ScannedProduct) => {
    try {
      sessionStorage.setItem(
        'petmol_pending_scanned_product',
        JSON.stringify({
          petId: pet.pet_id,
          product: {
            ...product,
            category: 'food',
          },
        }),
      );
    } catch {
      // non-blocking
    }
    setShowFoodPhotoFlow(false);
    setFoodPhotoEntry(null);
    setFormRequest({ id: Date.now(), mode: 'quick_setup' });
    setMode('edit');
  };

  const refreshFoodPlan = async () => {
    try {
      const response = await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan`, {
        headers: authH(),
        credentials: 'include',
      });

      if (response.status === 404) {
        setHasFoodConfigured(false);
        setAlertDaysBefore(null);
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
          startDate: null,
        });
        return;
      }

      if (!response.ok) return;
      const payload: FeedingPlanApiResponse = await response.json();
      const plan = payload.plan;
      const estimate = payload.estimate;

      const items = Array.isArray(plan?.items) ? plan.items : [];
      const primary = items.find((item) => item?.is_primary) ?? items[0] ?? null;

      const brand = normalizeFoodName((primary?.food_brand ?? plan?.food_brand ?? '').trim());
      const packageSizeKg = primary?.package_size_kg ?? plan?.package_size_kg ?? null;
      const dailyConsumptionG = primary?.daily_amount_g ?? plan?.daily_amount_g ?? null;
      const startDate = (primary?.last_refill_date ?? plan?.last_refill_date ?? null);
      const estimatedEndDate = estimate?.estimated_end_date ?? null;
      const daysLeft = estimate?.estimated_days_left ?? null;
      const nextReminder = estimate?.recommended_alert_date ?? null;
      const manualReminderDays = plan?.manual_reminder_days_before ?? null;
      const safetyBufferDays = plan?.safety_buffer_days ?? null;
      const resolvedReminderDays = manualReminderDays ?? safetyBufferDays;
      const hasPersistedPlan = Boolean(plan && plan.enabled !== false);

      const hasConfiguredData = Boolean(
        hasPersistedPlan ||
        brand ||
        packageSizeKg != null ||
        dailyConsumptionG != null ||
        startDate ||
        plan?.next_purchase_date ||
        items.some((item) => Boolean(item?.food_brand || item?.package_size_kg != null || item?.daily_amount_g != null || item?.last_refill_date)),
      );

      const commerce = resolveFoodCommerceSnapshot({
        brand,
        packageSizeKg: packageSizeKg != null ? String(packageSizeKg) : null,
        daysLeft,
        estimatedEndDate: estimatedEndDate ? fmtDate(estimatedEndDate) : null,
      });

      setHasFoodConfigured(hasConfiguredData);
      setAlertDaysBefore(resolvedReminderDays);
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
        startDate: startDate ? startDate.split('T')[0] : null,
      });
    } catch {
      // Preserve current view state on transient failures
    }
  };

  // ── API ────────────────────────────────────────────────────────────────────

  const authH = (): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
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
        onSaved?.();
        await refreshFoodPlan();
        dispatchFoodPlanUpdated();
        setMode('view');
        setSubMode('channel');
        setShowDatePicker(false);
        setFeedback(null);
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
        onSaved?.();
        await refreshFoodPlan();
        dispatchFoodPlanUpdated();
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

  // "⚠️ Acabou" → set_end_date to a past date
  const handleFinished = async (targetDate: string) => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    const prevEnd = estEnd;
    const prevDailyG = foodState.dailyConsumptionG;
    try {
      trackV1Metric('food_finished_early', {
        pet_id: pet.pet_id,
        finished_date: targetDate,
        old_estimated_end_date: prevEnd,
        new_estimated_end_date: targetDate,
        old_daily_consumption_g: prevDailyG,
        package_size_kg: foodState.packageSizeKg,
        delta_days: -(foodState.daysLeft ?? 0),
      });
      const ok = await callAdjust(targetDate);
      if (ok) {
        onSaved?.();
        await refreshFoodPlan();
        dispatchFoodPlanUpdated();
        showSuccessAndReturnToMain('Ração finalizada');
      }
      else {
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

  const handlePartnerClick = (partnerId: HomeShoppingPartnerId) => {
    trackV1Metric('food_partner_selected', { source: 'food_sheet', pet_id: pet.pet_id, store: partnerId });
    trackPartnerClicked({ source: 'food_sheet', partner: partnerId, pet_id: pet.pet_id, control_type: 'food' });
    window.open(buildFoodHandoffUrl(foodBrand || '', pet.pet_id, partnerId), '_blank', 'noopener,noreferrer');
  };

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

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
  useEffect(() => { if (mode === 'view') setSubMode('main'); }, [mode]);

  // Scroll to top when subMode changes so new content is visible from the beginning
  useEffect(() => {
    scrollBodyRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [subMode]);

  // ── Pet photo ──────────────────────────────────────────────────────────────

  const PhotoBubble = ({ size }: { size: number }) => (
    <div
      className="rounded-full overflow-hidden bg-amber-100 flex items-center justify-center flex-shrink-0 shadow-sm ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {petPhotoSrc && !photoLoadFailed ? (
        <img src={petPhotoSrc} alt={pet.pet_name} className="w-full h-full object-cover" loading="lazy"
          onError={() => setPhotoLoadFailed(true)} />
      ) : (
        <span>{pet.species === 'cat' ? '🐱' : '🐶'}</span>
      )}
    </div>
  );

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
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      >
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />

        <div
          className="relative w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[28px] shadow-2xl border-t border-x sm:border border-gray-200/60 flex flex-col overflow-hidden animate-slideUp sm:animate-scaleIn touch-manipulation"
          style={{ maxHeight: '92dvh' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sheet-handle my-3 opacity-40 sm:hidden" />

          {/* ═══════════════════════════════════════════════════════════════
              EDIT / REPLACE MODE
          ═══════════════════════════════════════════════════════════════ */}
          {mode === 'edit' && (
            <>
              <div className="relative z-10 flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
                <PhotoBubble size={36} />
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
                  <h2 className="text-base font-bold text-gray-900">{foodBrand ? `Comprar ${foodBrand}` : 'Comprar ração'}</h2>
                  <p className="text-xs text-gray-400">{pet.pet_name}</p>
                </div>
                <BackBtn onClick={() => setMode('view')} />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="p-5 pb-8 space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    {HOME_SHOPPING_PARTNERS.map((partner) => (
                      <button
                        key={partner.id}
                        type="button"
                        onClick={() => handlePartnerClick(partner.id)}
                        className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-2xl bg-white hover:bg-gray-50 active:scale-[0.98] transition-all text-left"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={partner.logoSrc}
                          alt={partner.logoAlt}
                          className="w-12 h-12 rounded-xl object-contain bg-white p-1.5 flex-shrink-0 shadow-sm border border-gray-100"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-gray-900 text-[15px] leading-tight">{partner.name}</p>
                          <p className="text-[12px] text-gray-500">{partner.description}</p>
                        </div>
                        <span className="text-sm font-bold text-blue-700">Abrir</span>
                      </button>
                    ))}
                  </div>
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
                <PhotoBubble size={44} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-[18px] font-black text-gray-900 leading-tight">
                    Ração {pet.pet_name.charAt(0).toUpperCase() !== pet.pet_name.charAt(0) ? 'da' : 'do'} {pet.pet_name}
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
                  <button type="button" onClick={onClose}
                    className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 active:scale-90 transition-all flex-shrink-0"
                    aria-label="Fechar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

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
                  {/* ── SEM RAÇÃO ──────────────────────────────────────────── */}
                  {!hasFood && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-4">
                      <div>
                        <h3 className="text-[20px] font-black text-gray-900 leading-tight">Vamos cadastrar a ração do {pet.pet_name}?</h3>
                        <p className="text-[13px] text-amber-900/80 mt-1">Fotografe a embalagem para identificar automaticamente, ou preencha manualmente.</p>
                      </div>
                      <div className="space-y-2">
                        {/* Opção 1 — foto ou galeria */}
                        <button
                          type="button"
                          onClick={() => openFoodPhotoFlow()}
                          className="w-full flex items-center justify-center gap-2.5 py-3.5 min-h-[44px] rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-[15px] font-black shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
                        >
                          <span className="text-xl">📷</span>
                          Fotografar ou escolher imagem
                        </button>

                        {/* Opção 2 — manual */}
                        <button
                          type="button"
                          onClick={() => { setFormRequest({ id: Date.now(), mode: 'edit' }); setMode('edit'); }}
                          className="w-full py-3 min-h-[44px] rounded-2xl border border-gray-200 bg-white text-[13px] font-semibold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                        >
                          ✏️ Cadastrar manualmente
                        </button>

                        <button
                          type="button"
                          onClick={onClose}
                          className="w-full py-2 text-[12px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          Fazer depois
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── COM RAÇÃO ──────────────────────────────────────────── */}
                  {hasFood && (
                    <>
                      {/* ─── SUBMODE: main ─────────────────────────────────── */}
                      {subMode === 'main' && (
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
                                        Previsão: <span className="font-semibold text-gray-800">{fmtDate(estEnd)}</span>
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
                                <p className="text-[15px] font-bold text-gray-900 break-words leading-tight">{foodBrand}</p>
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

                          {/* 3. CTA principal */}
                          <button type="button"
                            onClick={() => {
                              trackV1Metric('food_buy_clicked', { pet_id: pet.pet_id, days_left: foodState.daysLeft });
                              setMode('buy');
                            }}
                            className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] transition-all text-white text-[16px] font-black shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2.5"
                          >
                            <span className="text-xl">🛒</span>
                            Comprar novamente
                          </button>

                          {/* 4. Ações secundárias */}
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button"
                              onClick={() => { setSubMode('adjustDuration'); setShowDatePicker(false); setFeedback(null); }}
                              disabled={busy}
                              className="py-3 min-h-[44px] rounded-2xl bg-white border border-gray-200 text-[12px] font-semibold text-gray-600 active:scale-95 transition-all disabled:opacity-50">
                              Ainda vai durar
                            </button>
                            <button type="button"
                              onClick={() => { setSubMode('finished'); setShowDatePicker(false); setFeedback(null); }}
                              disabled={busy}
                              className="py-3 min-h-[44px] rounded-2xl bg-white border border-orange-200 text-[12px] font-semibold text-orange-700 active:scale-95 transition-all disabled:opacity-50">
                              Acabou
                            </button>
                          </div>

                          {/* 5. Detalhes do cálculo — recolhível */}
                          <button type="button" onClick={() => setShowDetails((v) => !v)}
                            className="w-full flex items-center justify-between text-[12px] font-semibold text-gray-400 hover:text-gray-600 transition-colors py-1">
                            <span>Detalhes do cálculo</span>
                            <span className="text-[10px]">{showDetails ? '▲' : '▼'}</span>
                          </button>

                          {showDetails && (
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 overflow-hidden -mt-2">
                              {[
                                ['Produto', foodBrand || '—'],
                                ['Pacote', foodState.packageSizeKg != null ? `${foodState.packageSizeKg % 1 === 0 ? foodState.packageSizeKg : foodState.packageSizeKg.toFixed(1)} kg` : '—'],
                                ['Consumo estimado', foodState.dailyConsumptionG != null ? `${Math.round(foodState.dailyConsumptionG)} g/dia` : '—'],
                                ['Início do ciclo', fmtDate(foodState.startDate)],
                                ['Previsão de término', fmtDate(estEnd)],
                                ['Dias restantes', foodState.daysLeft !== null ? `${Math.max(0, foodState.daysLeft)} dias` : '—'],
                                ['Dias antes do alerta', alertDaysBefore != null ? `${alertDaysBefore} dias` : '—'],
                                ['Próximo alerta', fmtDate(nextReminderDate)],
                                ['Horário do alerta', reminderTime ?? '—'],
                              ].map(([label, value]) => (
                                <div key={label} className="flex items-center justify-between px-4 py-2.5">
                                  <span className="text-[12px] text-gray-500">{label}</span>
                                  <span className="text-[12px] font-semibold text-gray-800">{value}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* 6. Rodapé administrativo */}
                          <div className="pt-1 pb-1">
                            <button type="button"
                              onClick={() => { setFormRequest({ id: Date.now(), mode: 'edit' }); setMode('edit'); }}
                              className="w-full py-3 min-h-[44px] rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
                            >
                              Editar plano
                            </button>
                          </div>
                        </>
                      )}

                      {/* ─── SUBMODE: adjustDuration ────────────────────────── */}
                      {subMode === 'adjustDuration' && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ajustar previsão</p>
                            <h3 className="text-[20px] font-black text-gray-900 leading-tight mt-1">
                              Por quantos dias a ração ainda deve durar?
                            </h3>
                            <p className="text-[13px] text-gray-500 mt-1">
                              Previsão atual: {fmtDate(estEnd)} ({foodState.daysLeft ?? '—'} dias)
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {[3, 7, 15, 30].map((d) => (
                              <button type="button" key={d} disabled={busy}
                                onClick={() => handleAdjustDuration(isoPlus(d))}
                                className="py-4 rounded-2xl border border-gray-200 bg-white text-[15px] font-bold text-gray-800 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50">
                                {d} dias
                              </button>
                            ))}
                          </div>

                          {!showDatePicker ? (
                            <button type="button"
                              onClick={() => { setCustomDate(isoPlus(7)); setShowDatePicker(true); }}
                              className="w-full py-3 min-h-[44px] rounded-2xl border border-dashed border-gray-300 bg-white text-sm font-semibold text-gray-500 hover:bg-gray-50 active:scale-95 transition-all">
                              Escolher data específica
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <input type="date" value={customDate} min={localTodayISO()}
                                onChange={(e) => setCustomDate(e.target.value)}
                                className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
                              <button type="button" disabled={!customDate || busy}
                                onClick={() => handleAdjustDuration(customDate)}
                                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-all">
                                OK
                              </button>
                            </div>
                          )}

                          <FeedbackBanner />
                        </div>
                      )}

                      {/* ─── SUBMODE: finished ──────────────────────────────── */}
                      {subMode === 'finished' && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">A ração acabou?</p>
                            <h3 className="text-[20px] font-black text-gray-900 leading-tight mt-1">
                              Quando acabou?
                            </h3>
                          </div>

                          <div className="space-y-2">
                            {[
                              { label: 'Hoje', iso: localTodayISO() },
                              { label: 'Ontem', iso: isoPlus(-1) },
                              { label: 'Há 3 dias', iso: isoPlus(-3) },
                            ].map(({ label, iso }) => (
                              <button type="button" key={label} disabled={busy}
                                onClick={() => handleFinished(iso)}
                                className="w-full py-3.5 rounded-2xl border border-gray-200 bg-white text-[15px] font-semibold text-gray-800 text-left px-5 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50">
                                {label}
                              </button>
                            ))}
                          </div>

                          {!showDatePicker ? (
                            <button type="button"
                              onClick={() => { setCustomDate(localTodayISO()); setShowDatePicker(true); }}
                              className="w-full py-3 min-h-[44px] rounded-2xl border border-dashed border-gray-300 bg-white text-sm font-semibold text-gray-500 hover:bg-gray-50 active:scale-95 transition-all">
                              Escolher data
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <input type="date" value={customDate} max={localTodayISO()}
                                onChange={(e) => setCustomDate(e.target.value)}
                                className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
                              <button type="button" disabled={!customDate || busy}
                                onClick={() => handleFinished(customDate)}
                                className="px-5 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-all">
                                OK
                              </button>
                            </div>
                          )}

                          <FeedbackBanner />

                          {/* Suggest buy after finishing */}
                          {feedback?.tone === 'blue' && (
                            <button type="button"
                              onClick={() => { setSubMode('main'); setMode('buy'); }}
                              className="w-full py-4 rounded-2xl bg-blue-600 text-white text-[15px] font-black shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all"
                            >
                              <span className="text-xl">🛒</span>
                              Comprar novamente
                            </button>
                          )}
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
                                ['petz', 'Petz'],
                                ['cobasi', 'Cobasi'],
                                ['amazon', 'Amazon'],
                                ['petlove', 'Petlove'],
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
      {showFoodPhotoFlow && (
        <ProductDetectionSheetGold
          petId={pet.pet_id}
          petName={pet.pet_name}
          hint="food"
          defaultMode="photo"
          photoEntry={foodPhotoEntry ?? undefined}
          allowScanning={false}
          onProductConfirmed={handleFoodProductConfirmed}
          onClose={() => {
            setShowFoodPhotoFlow(false);
            setFoodPhotoEntry(null);
          }}
        />
      )}
    </ModalPortal>
  );
}

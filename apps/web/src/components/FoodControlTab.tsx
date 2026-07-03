'use client';

import { getToken } from '@/lib/auth-token';
import { useState, useEffect } from 'react';
import { API_BACKEND_BASE } from '@/lib/api';
import { trackV1Metric } from '@/lib/v1Metrics';
import { ReminderPicker } from '@/components/ReminderPicker';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';
import type { ScannedProduct } from '@/lib/productScanner';
import { googleShoppingUrl } from '@/lib/externalShopping';
import { resolveFoodCommerceSnapshot } from '@/features/commerce/homeContextualCommerce';
import { requestUserDecision } from '@/features/interactions/userPromptChannel';
import { scheduleFoodReminder, buildRemindAt } from '@/features/notifications/pushService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimpleFoodData {
  id: string;
  brand: string;
  trackingMethod: 'weight' | 'duration';
  packageSizeKg: string;
  durationDays: string;
  startDate: string;
  dailyConsumptionG: string;
  barcode?: string;
  category?: string;
  isPrimary: boolean;
}

interface PersistedFoodItem {
  id?: string;
  label?: string;
  food_brand?: string | null;
  tracking_method?: 'weight' | 'duration' | null;
  package_size_kg?: number | null;
  daily_amount_g?: number | null;
  duration_days?: number | null;
  last_refill_date?: string | null;
  mode?: string | null;
  barcode?: string | null;
  category?: string | null;
  notes?: string | null;
  is_primary?: boolean;
}

export interface FoodControlTabState {
  showForm: boolean;
  commerceStatus: 'steady' | 'attention' | 'urgent' | null;
  foodBrand: string;
  daysLeft: number | null;
  restockDate: string | null;
  packageSizeKg: number | null;
  dailyConsumptionG: number | null;
  durationDays: number | null;
  startDate: string | null;
}

export interface FoodControlTabFormRequest {
  id: number;
  mode: 'add' | 'edit' | 'quick_setup';
}

export interface FoodControlTabProps {
  petId: string;
  petName?: string;
  countryCode?: string;
  species?: 'dog' | 'cat';
  onSaved?: () => void;
  onStateChange?: (state: FoodControlTabState) => void;
  formRequest?: FoodControlTabFormRequest | null;
  embedded?: boolean;
  hideInternalHeader?: boolean;
  onRequestBack?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dateToLocalISO(dt);
}

function fmtDate(s: string): string {
  const [, m, d] = s.split('-').map(Number);
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${d} de ${MONTHS[m - 1]}`;
}

function makeItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `food-item-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function createEmptyFoodItem(isPrimary = false): SimpleFoodData {
  return {
    id: makeItemId(),
    brand: '',
    trackingMethod: 'duration',
    packageSizeKg: '',
    durationDays: '',
    startDate: localTodayISO(),
    dailyConsumptionG: '',
    barcode: undefined,
    category: undefined,
    isPrimary,
  };
}

function ensurePrimaryItem(items: SimpleFoodData[]): SimpleFoodData[] {
  if (!items.length) return [createEmptyFoodItem(true)];
  const primaryIndex = items.findIndex((item) => item.isPrimary);
  const resolvedPrimaryIndex = primaryIndex >= 0 ? primaryIndex : 0;
  return items.map((item, index) => ({ ...item, isPrimary: index === resolvedPrimaryIndex }));
}

function hasUsefulFoodItem(item: SimpleFoodData): boolean {
  return Boolean(
    item.brand.trim() ||
    item.packageSizeKg.trim() ||
    item.durationDays.trim() ||
    item.dailyConsumptionG.trim() ||
    item.barcode ||
    item.category,
  );
}

function hasPersistedFoodPlan(plan: { enabled?: boolean | null; pet_id?: string | null } | null | undefined): boolean {
  return Boolean(plan && plan.enabled !== false);
}

function orderPrimaryFirst(items: SimpleFoodData[]): SimpleFoodData[] {
  return [...items].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
}

function getPrimaryItem(items: SimpleFoodData[]): SimpleFoodData {
  const normalized = ensurePrimaryItem(items);
  return normalized.find((item) => item.isPrimary) ?? normalized[0];
}

function normalizeScannedFoodName(product: ScannedProduct): string {
  const brand = product.brand?.trim().replace(/\s+/g, ' ') ?? '';
  const name = product.name?.trim().replace(/\s+/g, ' ') ?? '';
  if (!brand) return name;
  if (!name) return brand;

  const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normalizedBrand = normalize(brand);
  const normalizedName = normalize(name);
  const combined = normalizedName.startsWith(`${normalizedBrand} `) || normalizedName === normalizedBrand
    ? name
    : `${brand} ${name}`;

  const brandPrefix = new RegExp(`^(${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+){2,}`, 'i');
  return combined.replace(brandPrefix, `${brand} `).replace(/\s+/g, ' ').trim();
}

function getResolvedDailyConsumption(item: SimpleFoodData): number | null {
  if (item.trackingMethod === 'duration') return null;
  const dailyConsumption = parseFloat(item.dailyConsumptionG);
  if (Number.isFinite(dailyConsumption) && dailyConsumption > 0) return dailyConsumption;
  const packageSizeKg = parseFloat(item.packageSizeKg);
  const durationDays = parseInt(item.durationDays, 10);
  if (Number.isFinite(packageSizeKg) && packageSizeKg > 0 && Number.isFinite(durationDays) && durationDays > 0) {
    return Math.round((packageSizeKg * 1000) / durationDays);
  }
  return null;
}

function getTrackingMethod(value: unknown, fallback: 'weight' | 'duration' = 'weight'): 'weight' | 'duration' {
  return value === 'duration' || value === 'weight' ? value : fallback;
}

function getDurationDaysFromDates(startDate: string, endDate: string | null | undefined): string {
  if (!startDate || !endDate) return '';
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return diff > 0 ? String(diff) : '';
}

function getItemMetrics(item: SimpleFoodData): {
  packageSizeKg: number | null;
  dailyConsumptionG: number | null;
  days: number | null;
  localEndDate: string | null;
  localDaysLeft: number | null;
} {
  const packageSizeKg = parseFloat(item.packageSizeKg);
  const parsedPackageSizeKg = Number.isFinite(packageSizeKg) && packageSizeKg > 0 ? packageSizeKg : null;
  const dailyConsumptionG = getResolvedDailyConsumption(item);
  const manualDays = parseInt(item.durationDays, 10);
  const days = item.trackingMethod === 'duration'
    ? (Number.isFinite(manualDays) && manualDays > 0 ? manualDays : null)
    : dailyConsumptionG && parsedPackageSizeKg
      ? Math.round((parsedPackageSizeKg * 1000) / dailyConsumptionG)
      : (Number.isFinite(manualDays) && manualDays > 0 ? manualDays : null);
  const localEndDate = item.startDate && days ? addDays(item.startDate, days) : null;
  const localDaysLeft = localEndDate
    ? Math.round((new Date(`${localEndDate}T00:00:00`).getTime() - new Date(`${localTodayISO()}T00:00:00`).getTime()) / 86400000)
    : null;
  return {
    packageSizeKg: parsedPackageSizeKg,
    dailyConsumptionG,
    days,
    localEndDate,
    localDaysLeft,
  };
}

function normalizeLoadedItems(source: unknown): SimpleFoodData[] {
  if (!source || typeof source !== 'object') return [createEmptyFoodItem(true)];
  const record = source as { items?: PersistedFoodItem[]; [key: string]: unknown };
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const primaryFallbackTracking = getTrackingMethod(record.no_consumption_control === true ? 'duration' : null, 'weight');
  const fromItems = rawItems.map((item) => ({
    id: item.id || makeItemId(),
    brand: item.food_brand ?? '',
    trackingMethod: getTrackingMethod(item.tracking_method, item.is_primary ? primaryFallbackTracking : 'weight'),
    packageSizeKg: item.package_size_kg != null ? String(item.package_size_kg) : '',
    durationDays:
      item.duration_days != null
        ? String(item.duration_days)
        : item.package_size_kg && item.daily_amount_g
        ? String(Math.round((item.package_size_kg * 1000) / item.daily_amount_g))
        : (item.is_primary ? getDurationDaysFromDates((item.last_refill_date ?? localTodayISO()).split('T')[0], typeof record.next_purchase_date === 'string' ? record.next_purchase_date : null) : ''),
    startDate: (item.last_refill_date ?? localTodayISO()).split('T')[0],
    dailyConsumptionG: item.daily_amount_g != null ? String(item.daily_amount_g) : '',
    barcode: item.barcode ?? undefined,
    category: item.category ?? undefined,
    isPrimary: Boolean(item.is_primary),
  }));

  if (fromItems.length) return ensurePrimaryItem(fromItems);

  const legacy = {
    id: makeItemId(),
    brand: typeof record.food_brand === 'string'
      ? record.food_brand
      : (typeof record.brand === 'string' ? record.brand : ''),
    trackingMethod: getTrackingMethod(record.no_consumption_control === true ? 'duration' : null, 'weight'),
    packageSizeKg:
      typeof record.package_size_kg === 'number'
        ? String(record.package_size_kg)
        : (typeof record.packageSizeKg === 'string' ? record.packageSizeKg : ''),
    durationDays:
      typeof record.duration_days === 'number'
        ? String(record.duration_days)
        : typeof record.durationDays === 'string'
          ? record.durationDays
          : getDurationDaysFromDates(
            typeof record.last_refill_date === 'string'
              ? record.last_refill_date.split('T')[0]
              : (typeof record.startDate === 'string' ? record.startDate.split('T')[0] : localTodayISO()),
            typeof record.next_purchase_date === 'string' ? record.next_purchase_date : null,
            ),
    startDate:
      typeof record.last_refill_date === 'string'
        ? record.last_refill_date.split('T')[0]
        : (typeof record.startDate === 'string' ? record.startDate.split('T')[0] : localTodayISO()),
    dailyConsumptionG:
      typeof record.daily_amount_g === 'number'
        ? String(record.daily_amount_g)
        : (typeof record.dailyConsumptionG === 'string' ? record.dailyConsumptionG : ''),
    barcode: typeof record.barcode === 'string' ? record.barcode : undefined,
    category: typeof record.category === 'string' ? record.category : undefined,
    isPrimary: true,
  };

  return [legacy];
}

function buildItemsPayload(items: SimpleFoodData[]): PersistedFoodItem[] {
  return ensurePrimaryItem(items).map((item, index) => ({
    id: item.id,
    label: item.brand.trim() || `Produto ${index + 1}`,
    food_brand: item.brand.trim() || null,
    tracking_method: item.trackingMethod,
    package_size_kg: getItemMetrics(item).packageSizeKg,
    daily_amount_g: getItemMetrics(item).dailyConsumptionG,
    duration_days: getItemMetrics(item).days,
    last_refill_date: item.startDate || null,
    mode: 'kibble',
    barcode: item.barcode ?? null,
    category: item.category ?? null,
    notes: null,
    is_primary: item.isPrimary,
  }));
}

function buildNotes(items: PersistedFoodItem[]): string {
  return items
    .map((item, index) => {
      const parts = [
        item.food_brand ? `Produto ${index + 1}: ${item.food_brand}` : `Produto ${index + 1}`,
        item.barcode ? `EAN/GTIN: ${item.barcode}` : '',
        item.category ? `Categoria: ${item.category}` : '',
      ].filter(Boolean);
      return parts.join('\n');
    })
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 1000);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FoodControlTab({
  petId,
  petName: _petName,
  countryCode,
  species,
  onSaved,
  onStateChange,
  formRequest,
  embedded = false,
  hideInternalHeader = false,
  onRequestBack,
}: FoodControlTabProps) {
  const storageKey = `petmol_food_control_${petId}`;

  const [items, setItems] = useState<SimpleFoodData[]>([createEmptyFoodItem(true)]);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState('Dados salvos com sucesso.');
  const [apiError, setApiError] = useState<string | null>(null);
  const [, setRecurringProducts] = useState<Array<{ name: string; count: number; lastUsed: string }>>([]);
  const [hasExisting, setHasExisting] = useState(false);
  const [reminderDays, setReminderDays] = useState('3');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [loadedExisting, setLoadedExisting] = useState(false);
  const [formOpen, setFormOpen] = useState(() => !!formRequest);
  const [formMode, setFormMode] = useState<'add' | 'edit' | 'quick_setup'>(() => formRequest?.mode ?? 'edit');
  const [showAdvanced, setShowAdvanced] = useState(() => formRequest?.mode === 'edit');
  const [methodChosen, setMethodChosen] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<string | null>(null);
  const [apiEstimate, setApiEstimate] = useState<{ estimated_end_date: string | null; estimated_days_left: number | null } | null>(null);

  const applyScannedProduct = (itemId: string, product: ScannedProduct) => {
    setItems((current) => ensurePrimaryItem(current.map((item) => {
      if (item.id !== itemId) return item;
      // Resolver packageSizeKg a partir do peso do produto
      let resolvedPackageKg = item.packageSizeKg;
      const rawWeight = product.weight?.trim() ?? '';
      if (rawWeight) {
        const kgMatch = rawWeight.match(/^([\d.,]+)\s*kg/i);
        const gMatch = rawWeight.match(/^([\d.,]+)\s*g\b/i);
        if (kgMatch) {
          resolvedPackageKg = kgMatch[1].replace(',', '.');
        } else if (gMatch) {
          const grams = parseFloat(gMatch[1].replace(',', '.'));
          if (Number.isFinite(grams) && grams > 0) {
            resolvedPackageKg = String(grams / 1000);
          }
        }
      }
      return {
        ...item,
        brand: normalizeScannedFoodName(product) || item.brand,
        packageSizeKg: resolvedPackageKg,
        barcode: product.barcode,
        category: product.category,
      };
    })));
    try {
      sessionStorage.removeItem('petmol_pending_scanned_product');
    } catch { /* silent */ }
    if (!product.found) setApiError('Não encontramos os dados. Preencha manualmente.');
  };

  const updateItem = (itemId: string, updater: (item: SimpleFoodData) => SimpleFoodData) => {
    try {
      sessionStorage.removeItem('petmol_pending_scanned_product');
    } catch { /* silent */ }
    setItems((current) => ensurePrimaryItem(current.map((item) => (item.id === itemId ? updater(item) : item))));
  };

  const removeFoodItem = (itemId: string) => {
    setItems((current) => {
      const next = current.filter((item) => item.id !== itemId);
      return ensurePrimaryItem(next);
    });
  };

  const setPrimaryItem = (itemId: string) => {
    setItems((current) => current.map((item) => ({ ...item, isPrimary: item.id === itemId })));
  };

  // ─── Load existing plan ───────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        const token = getToken();
        const res = await fetch(`${API_BACKEND_BASE}/health/pets/${petId}/feeding/plan`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          credentials: 'include',
        });
        if (res.ok) {
          const json = await res.json();
          const plan = json.plan;
          if (hasPersistedFoodPlan(plan)) {
            const loadedItems = normalizeLoadedItems(plan);
            setReminderDays(String(plan.manual_reminder_days_before ?? 3));
            setReminderTime(plan.reminder_time ?? '09:00');
            setItems(loadedItems);
            // Capture API-calculated estimate — no local recalculation
            setApiEstimate({
              estimated_end_date: json.estimate?.estimated_end_date ?? null,
              estimated_days_left: json.estimate?.estimated_days_left ?? null,
            });
            setHasExisting(true);
            setLoadedExisting(true);
            setMethodChosen(true);
            return;
          }
        }
      } catch { /* offline */ }
      setLoadedExisting(true);
    };
    load();
  }, [petId, storageKey]);

  useEffect(() => {
    if (!loadedExisting) return;
    try {
      const raw = sessionStorage.getItem('petmol_pending_scanned_product');
      if (!raw) return;
      const payload = JSON.parse(raw) as { petId?: string; product?: ScannedProduct };
      if (payload.petId !== petId || !payload.product || payload.product.category !== 'food') return;
      const primary = getPrimaryItem(items);
      applyScannedProduct(primary.id, payload.product);
      sessionStorage.removeItem('petmol_pending_scanned_product');
    } catch { /* silent */ }
  }, [items, loadedExisting, petId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`petmol_product_usage_${petId}`);
      if (raw) setRecurringProducts(JSON.parse(raw));
    } catch { /* silent */ }
  }, [petId]);

  // ─── Derived values ───────────────────────────────────────────────────────

  const normalizedItems = ensurePrimaryItem(items);
  const primaryItem = getPrimaryItem(normalizedItems);
  const primaryMetrics = getItemMetrics(primaryItem);
  const pkgKg = primaryMetrics.packageSizeKg;
  const dailyConsumptionG = primaryMetrics.dailyConsumptionG;
  // Local estimates — used only for form preview (pre-save) and progress bar denominator
  const localEndDate = primaryMetrics.localEndDate;
  const localDaysLeft = primaryMetrics.localDaysLeft;
  // Display values: backend is authoritative; local is fallback before first save
  const displayDaysLeft = apiEstimate?.estimated_days_left ?? localDaysLeft;
  const displayEndDate = apiEstimate?.estimated_end_date ?? localEndDate;
  const commerceSnapshot = resolveFoodCommerceSnapshot({
    brand: primaryItem.brand,
    packageSizeKg: primaryItem.packageSizeKg,
    daysLeft: displayDaysLeft,
    estimatedEndDate: displayEndDate ? fmtDate(displayEndDate) : null,
  });
  const foodHandoffUrl = commerceSnapshot
    ? `/api/handoff/shopping?query=${encodeURIComponent(commerceSnapshot.searchQuery)}&fallback=${encodeURIComponent(googleShoppingUrl(commerceSnapshot.searchQuery))}`
    : null;

  const buildPlanPayload = (sourceItems: SimpleFoodData[]) => {
    const normalizedSourceItems = ensurePrimaryItem(sourceItems);
    const requestItems = buildItemsPayload(normalizedSourceItems);
    const primaryRequestItem = requestItems.find((item) => item.is_primary) ?? requestItems[0];
    const primarySourceItem = getPrimaryItem(normalizedSourceItems);
    const primarySourceMetrics = getItemMetrics(primarySourceItem);
    const isDurationMode = primarySourceItem.trackingMethod === 'duration';
    const nextPurchaseDate = isDurationMode && primarySourceMetrics.days && primarySourceItem.startDate
      ? addDays(primarySourceItem.startDate, primarySourceMetrics.days)
      : null;
    const packageSizeKg = primaryRequestItem?.package_size_kg ?? null;
    const dailyAmountG = isDurationMode ? null : (primaryRequestItem?.daily_amount_g ?? null);

    return {
      normalizedSourceItems,
      requestItems,
      primaryRequestItem,
      primarySourceItem,
      isDurationMode,
      nextPurchaseDate,
      packageSizeKg,
      dailyAmountG,
      localPayload: {
        food_brand: primaryRequestItem?.food_brand ?? '',
        brand: primaryRequestItem?.food_brand ?? '',
        package_size_kg: packageSizeKg,
        daily_amount_g: dailyAmountG,
        duration_days: primarySourceMetrics.days,
        last_refill_date: primaryRequestItem?.last_refill_date ?? null,
        next_purchase_date: nextPurchaseDate,
        no_consumption_control: isDurationMode,
        manual_reminder_days_before: parseInt(reminderDays, 10) || 3,
        reminder_time: reminderTime || '09:00',
        barcode: primaryRequestItem?.barcode ?? null,
        category: primaryRequestItem?.category ?? null,
        items: requestItems,
      },
      requestBody: {
        species: species ?? 'dog',
        country_code: countryCode ?? 'BR',
        food_brand: primaryRequestItem?.food_brand ?? '',
        package_size_kg: packageSizeKg,
        daily_amount_g: dailyAmountG,
        duration_days: primarySourceMetrics.days,
        last_refill_date: primaryRequestItem?.last_refill_date ?? null,
        safety_buffer_days: parseInt(reminderDays, 10) || 3,
        mode: 'kibble',
        enabled: true,
        notes: buildNotes(requestItems),
        no_consumption_control: isDurationMode,
        next_purchase_date: nextPurchaseDate,
        manual_reminder_days_before: parseInt(reminderDays, 10) || 3,
        reminder_time: reminderTime || '09:00',
        items: requestItems,
      },
    };
  };

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (showAdvanced && !methodChosen) {
      setApiError('Selecione "Por peso" ou "Por duração" antes de salvar.');
      return;
    }

    // Build the exact payload first, then validate what will actually be sent.
    const sourceItems = formMode === 'quick_setup'
      ? ensurePrimaryItem([
          {
            ...primaryItem,
            isPrimary: true,
            trackingMethod: 'duration',
            startDate: primaryItem.startDate || localTodayISO(),
            durationDays: primaryItem.durationDays || '30',
            dailyConsumptionG: '',
          },
        ])
      : !showAdvanced
        ? ensurePrimaryItem(normalizedItems.map((item) => ({
            ...item,
            trackingMethod: 'duration',
            startDate: item.startDate || localTodayISO(),
            durationDays: item.durationDays,
            dailyConsumptionG: '',
          })))
      : normalizedItems;

    if (formMode !== 'quick_setup') {
      const primarySource = getPrimaryItem(sourceItems);
      if (primarySource.trackingMethod === 'weight' && !primarySource.packageSizeKg.trim()) {
        setApiError('Informe o tamanho do pacote em kg.');
        return;
      }
      if (primarySource.trackingMethod === 'weight' && !primarySource.dailyConsumptionG.trim()) {
        setApiError('Informe o consumo diário em gramas.');
        return;
      }
      if (primarySource.trackingMethod === 'duration' && !primarySource.durationDays.trim()) {
        setApiError('Informe a duração em dias.');
        return;
      }
    }

    setSaving(true);
    setSavedOk(false);
    if (formMode === 'quick_setup') {
      setSaveFeedback('Racao cadastrada com sucesso.');
    } else {
      setSaveFeedback(hasExisting ? 'Alteracoes salvas com sucesso.' : 'Controle de alimentacao salvo com sucesso.');
    }
    setApiError(null);
    const { requestItems, primaryRequestItem, requestBody } = buildPlanPayload(sourceItems);

    try {
      const token = getToken();
      const res = await fetch(`${API_BACKEND_BASE}/health/pets/${petId}/feeding/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(detail || `HTTP ${res.status}`);
      }

      const json = await res.json();
      const plan = json?.plan;
      const loadedItems = normalizeLoadedItems(plan ?? {});
      setItems(loadedItems);
      setReminderDays(String(plan?.manual_reminder_days_before ?? 3));
      setReminderTime(plan?.reminder_time ?? '09:00');
      setApiEstimate({
        estimated_end_date: json?.estimate?.estimated_end_date ?? null,
        estimated_days_left: json?.estimate?.estimated_days_left ?? null,
      });
      setHasExisting(hasPersistedFoodPlan(plan) || loadedItems.some(hasUsefulFoodItem));
      setFormOpen(false);

      try {
        const existing = (() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}'); } catch { return {}; } })();
        localStorage.setItem(storageKey, JSON.stringify({
          ...existing,
          ...(plan ?? {}),
          estimated_end_date: json?.estimate?.estimated_end_date ?? null,
          estimated_days_left: json?.estimate?.estimated_days_left ?? null,
          manual_reminder_days_before: plan?.manual_reminder_days_before ?? (parseInt(reminderDays, 10) || 3),
          reminder_time: plan?.reminder_time ?? (reminderTime || '09:00'),
        }));
      } catch { /* silent */ }

      if (!hasExisting) {
        trackV1Metric('food_cycle_created', {
          pet_id: petId,
          brand: primaryRequestItem?.food_brand ?? null,
          package_size_kg: primaryRequestItem?.package_size_kg ?? null,
        });
      }
      localStorage.setItem('petmol_activation_control_active_v1', '1');

      try {
        const usageKey = `petmol_product_usage_${petId}`;
        const current = JSON.parse(localStorage.getItem(usageKey) || '[]') as Array<{ name: string; count: number; lastUsed: string }>;
        for (const item of requestItems) {
          const name = item.food_brand?.trim();
          if (!name) continue;
          const found = current.find(entry => entry.name.toLowerCase() === name.toLowerCase());
          if (found) {
            found.count += 1;
            found.lastUsed = localTodayISO();
          } else {
            current.push({ name, count: 1, lastUsed: localTodayISO() });
          }
        }
        current.sort((a, b) => b.count - a.count || b.lastUsed.localeCompare(a.lastUsed));
        localStorage.setItem(usageKey, JSON.stringify(current));
        setRecurringProducts(current);
      } catch { /* silent */ }

      setSavedOk(true);
      onSaved?.();
      const endDate = json?.estimate?.estimated_end_date as string | null | undefined;
      if (endDate && token && petId) {
        const alertDate = addDays(endDate, -(plan?.manual_reminder_days_before ?? 3));
        void scheduleFoodReminder(
          { pet_id: petId, type: 'food', title: '🥣 Hora de comprar ração', body: `Estoque de ${primaryRequestItem?.food_brand ?? 'ração'} previsto para acabar`, remind_at: buildRemindAt(alertDate, plan?.reminder_time ?? '09:00') },
          token
        );
      }
      setTimeout(() => setSavedOk(false), 4000);
    } catch (error) {
      console.error('[FOOD_CONTROL] save failed', error);
      const message = error instanceof Error ? error.message : '';
      if (message.includes('401') || message.includes('403')) {
        setApiError('Sessão expirada. Faça login novamente para salvar.');
      } else if (message.trim()) {
        setApiError(`Não foi possível salvar no servidor: ${message.slice(0, 140)}`);
      } else {
        setApiError('Não foi possível salvar no servidor. Verifique sua conexão e tente novamente.');
      }
      setSavedOk(false);
      setHasExisting(normalizedItems.some(hasUsefulFoodItem));
      setFormOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const accepted = await requestUserDecision(
      'Excluir este registro de alimentação? Essa ação remove o ciclo atual e exige novo preenchimento depois.',
      {
        title: 'Excluir controle de alimentação',
        tone: 'danger',
        confirmLabel: 'Excluir registro',
      },
    );
    if (!accepted) return;

    setSaving(true);
    setDeleteFeedback(null);
    try {
      const token = getToken();
      const res = await fetch(`${API_BACKEND_BASE}/health/pets/${petId}/feeding/plan`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
      });
      localStorage.removeItem(storageKey);
      setItems([createEmptyFoodItem(true)]);
      setReminderDays('3');
      setReminderTime('09:00');
      setHasExisting(false);
      setSavedOk(false);
      setApiEstimate(null);
      if (!res.ok && res.status !== 404) {
        setApiError('Registro removido localmente. Tente sincronizar depois.');
      } else {
        setDeleteFeedback('Registro removido com sucesso.');
      }
      onSaved?.();
    } catch {
      localStorage.removeItem(storageKey);
      setItems([createEmptyFoodItem(true)]);
      setReminderDays('3');
      setReminderTime('09:00');
      setHasExisting(false);
      setApiEstimate(null);
      setApiError('Sem conexão. Registro removido localmente.');
    } finally {
      setSaving(false);
    }
  };

  const openEditForm = () => {
    setApiError(null);
    setDeleteFeedback(null);
    setSavedOk(false);
    setShowAdvanced(false);
    setFormMode('edit');
    setFormOpen(true);
  };

  const openAddNewItem = () => {
    setApiError(null);
    setDeleteFeedback(null);
    setSavedOk(false);
    setShowAdvanced(false);
    setMethodChosen(false);
    setItems((current) => ensurePrimaryItem([...current, createEmptyFoodItem(false)]));
    setFormMode('add');
    setFormOpen(true);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const showForm = !hasExisting || formOpen;

  useEffect(() => {
    onStateChange?.({
      showForm,
      commerceStatus: commerceSnapshot?.status ?? null,
      foodBrand: primaryItem.brand.trim(),
      daysLeft: displayDaysLeft ?? null,
      restockDate: displayEndDate ?? null,
      packageSizeKg: primaryMetrics.packageSizeKg ?? null,
      dailyConsumptionG: primaryMetrics.dailyConsumptionG ?? null,
      durationDays: primaryMetrics.days ?? null,
      startDate: primaryItem.startDate || null,
    });
  }, [
    commerceSnapshot?.status,
    displayDaysLeft,
    displayEndDate,
    onStateChange,
    primaryItem.brand,
    primaryItem.startDate,
    primaryMetrics.dailyConsumptionG,
    primaryMetrics.days,
    primaryMetrics.packageSizeKg,
    showForm,
  ]);

  useEffect(() => {
    if (!formRequest) return;
    setApiError(null);
    setDeleteFeedback(null);
    setSavedOk(false);
    setShowAdvanced(formRequest.mode === 'edit');
    if (formRequest.mode === 'add') {
      setItems((current) => ensurePrimaryItem([...current, createEmptyFoodItem(false)]));
    }
    if (formRequest.mode === 'quick_setup') {
      setItems((current) => {
        const primary = getPrimaryItem(current);
        return ensurePrimaryItem([
          {
            ...primary,
            isPrimary: true,
            trackingMethod: 'duration',
            startDate: primary.startDate || localTodayISO(),
            durationDays: primary.durationDays || '30',
            dailyConsumptionG: '',
          },
        ]);
      });
    }
    setFormMode(formRequest.mode);
    setFormOpen(true);
  }, [formRequest]);

  return (
    <div className="overflow-x-hidden p-3 space-y-3 pb-6 sm:p-4 sm:pb-8">

      {/* ── VIEW MODE ─────────────────────────────────────────────────────── */}
      {!showForm && (
        <div className="space-y-3">

          {/* Feedback de salvamento — no topo para garantir visibilidade */}
          {savedOk && (
            <div className="bg-green-500 rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm">
              <span className="text-white text-lg">✅</span>
              <span className="text-white text-base font-bold">{saveFeedback}</span>
            </div>
          )}
          {deleteFeedback && (
            <div className="bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-2">
              <span>ℹ️</span><span className="text-base text-slate-700">{deleteFeedback}</span>
            </div>
          )}
          {/* Status card */}
          <div className="space-y-2">
            {orderPrimaryFirst(normalizedItems).map((item, index) => {
              const itemMetrics = getItemMetrics(item);
              const isTracked = item.isPrimary;
              const currentDaysLeft = isTracked ? displayDaysLeft : itemMetrics.localDaysLeft;
              const currentEndDate = isTracked ? displayEndDate : itemMetrics.localEndDate;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-3 space-y-2 ${
                    isTracked && currentDaysLeft !== null && currentDaysLeft < 0 ? 'bg-red-50 border-red-200' :
                    isTracked && currentDaysLeft !== null && currentDaysLeft <= 5 ? 'bg-orange-50 border-orange-200' :
                    isTracked ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="mt-0.5 text-lg flex-shrink-0">🥣</span>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-base leading-tight">{item.brand || `Produto ${index + 1}`}</p>
                        <p className="text-xs text-gray-500">
                          {isTracked ? 'Produto principal monitorado' : 'Produto adicional'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        isTracked ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {isTracked ? 'Principal' : 'Adicional'}
                      </span>
                      {isTracked && currentDaysLeft !== null && (
                        <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                          currentDaysLeft < 0 ? 'bg-red-100 text-red-700' :
                          currentDaysLeft <= 5 ? 'bg-orange-100 text-orange-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {currentDaysLeft < 0 ? 'Acabou' : currentDaysLeft === 0 ? 'Hoje' : `${currentDaysLeft}d restantes`}
                        </span>
                      )}
                    </div>
                  </div>
                  {isTracked && itemMetrics.days != null && currentDaysLeft !== null && (
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          currentDaysLeft < 0 ? 'bg-red-400' :
                          currentDaysLeft <= 5 ? 'bg-orange-400' :
                          'bg-green-400'
                        }`}
                        style={{ width: `${Math.max(4, Math.min(100, Math.round(((itemMetrics.days - Math.max(currentDaysLeft, 0)) / itemMetrics.days) * 100)))}%` }}
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400 mt-0.5">
                    {item.packageSizeKg && <span>{item.packageSizeKg} kg</span>}
                    {item.startDate && <span>Desde {fmtDate(item.startDate)}</span>}
                    {currentEndDate && isTracked && (
                      <span>Término ~{fmtDate(currentEndDate)}</span>
                    )}
                    {!isTracked && item.category && <span>{item.category}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recomprar — exibido apenas quando há urgência ou atenção */}
          {commerceSnapshot && foodHandoffUrl && commerceSnapshot.status !== 'steady' && (
            <a
              href={foodHandoffUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full flex items-center gap-3 rounded-2xl border p-3 transition-all active:scale-[0.98] ${
                commerceSnapshot.status === 'urgent'
                  ? 'border-rose-200 bg-rose-50 hover:bg-rose-100'
                  : 'border-amber-200 bg-amber-50 hover:bg-amber-100'
              }`}
            >
              <span className="text-xl flex-shrink-0">{commerceSnapshot.status === 'urgent' ? '🛒' : '⏰'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-slate-900 leading-tight">{commerceSnapshot.title}</p>
                <p className="text-xs text-slate-600 mt-0.5 leading-tight">{commerceSnapshot.description}</p>
              </div>
              <span className="flex-shrink-0 text-sm font-bold text-slate-700 whitespace-nowrap">{commerceSnapshot.ctaLabel} ›</span>
            </a>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button"
              onClick={openAddNewItem}
              className="min-h-[56px] rounded-2xl border border-emerald-200 bg-emerald-50 px-2 py-2.5 text-sm font-semibold leading-tight text-emerald-800 hover:bg-emerald-100"
            >
              ➕ Adicionar outro alimento
            </button>
            <button type="button"
              onClick={openEditForm}
              className="min-h-[56px] rounded-2xl border border-blue-200 bg-blue-50 px-2 py-2.5 text-sm font-semibold leading-tight text-blue-800 hover:bg-blue-100"
            >
              ✏️ Editar alimentação
            </button>
          </div>

        </div>
      )}

      {/* ── FORM MODE ─────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="space-y-2">
          {hasExisting && !hideInternalHeader && (
            <button
              type="button"
              onClick={() => {
                if (onRequestBack) {
                  onRequestBack();
                  return;
                }
                setFormOpen(false);
              }}
              className={`flex items-center gap-2 text-sm font-medium mb-1 ${embedded ? 'text-gray-600 hover:text-gray-800' : 'text-gray-500 hover:text-gray-800'}`}
            >
              ‹ Voltar
            </button>
          )}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2.5 space-y-2 sm:p-3">
            {(formMode === 'add'
              ? normalizedItems.filter((i) => !i.isPrimary)
              : formMode === 'quick_setup'
                ? [primaryItem]
              : orderPrimaryFirst(normalizedItems)
            ).map((item, index) => {
              const itemMetrics = getItemMetrics(item);
              const isQuickSetup = formMode === 'quick_setup';
              return (
                <div key={item.id} className="rounded-2xl border border-slate-200 p-3 space-y-2.5 bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-black uppercase tracking-wider text-slate-400">
                        {isQuickSetup ? 'Ração principal' : (item.isPrimary ? 'Plano principal' : `Produto ${index + 1}`)}
                      </p>
                    </div>
                    {!isQuickSetup && (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {!item.isPrimary && (
                          <button
                            type="button"
                            onClick={() => setPrimaryItem(item.id)}
                            className="min-h-[44px] px-2.5 py-2.5 rounded-full text-sm font-semibold bg-white border border-amber-200 text-amber-800 hover:bg-amber-50"
                          >
                            Usar no monitoramento
                          </button>
                        )}
                        {normalizedItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeFoodItem(item.id)}
                            className="min-h-[44px] px-2.5 py-2.5 rounded-full text-sm font-semibold bg-white border border-red-200 text-red-700 hover:bg-red-50"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {!isQuickSetup && showAdvanced && (
                    <div className="space-y-2">
                      {!methodChosen && (
                        <p className="text-xs font-bold text-amber-700">Selecione como controlar a ração:</p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => { updateItem(item.id, (current) => ({ ...current, trackingMethod: 'weight' })); setMethodChosen(true); }}
                          className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                            methodChosen && item.trackingMethod === 'weight'
                              ? 'border-amber-300 bg-amber-50 text-amber-900'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Por peso
                        </button>
                        <button
                          type="button"
                          onClick={() => { updateItem(item.id, (current) => ({ ...current, trackingMethod: 'duration' })); setMethodChosen(true); }}
                          className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                            methodChosen && item.trackingMethod === 'duration'
                              ? 'border-amber-300 bg-amber-50 text-amber-900'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Por duração
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Marca / Produto</label>
                    <input
                      type="text"
                      value={item.brand}
                      onChange={e => updateItem(item.id, (current) => ({ ...current, brand: e.target.value }))}
                      placeholder="Ex: Royal Canin, Guabi Natural, petisco..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                    />
                  </div>

                  {isQuickSetup || !showAdvanced ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Data início</label>
                        <input
                          type="date"
                          value={item.startDate}
                          onChange={e => updateItem(item.id, (current) => ({ ...current, trackingMethod: 'duration', startDate: e.target.value, dailyConsumptionG: '' }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Duração (dias)</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={item.durationDays}
                          onChange={e => updateItem(item.id, (current) => ({ ...current, trackingMethod: 'duration', durationDays: e.target.value, dailyConsumptionG: '' }))}
                          placeholder="Ex: 30"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                        />
                      </div>
                    </div>
                  ) : item.trackingMethod === 'weight' ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Pacote (kg)</label>
                          <input
                            type="number"
                            min={0.1}
                            step={0.5}
                            value={item.packageSizeKg}
                            onChange={e => updateItem(item.id, (current) => ({ ...current, packageSizeKg: e.target.value }))}
                            placeholder="Ex: 15"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Consumo/dia (g)</label>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={item.dailyConsumptionG}
                            onChange={e => updateItem(item.id, (current) => ({ ...current, dailyConsumptionG: e.target.value }))}
                            placeholder="Ex: 300"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Data início</label>
                        <input
                          type="date"
                          value={item.startDate}
                          onChange={e => updateItem(item.id, (current) => ({ ...current, startDate: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Duração (dias)</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={item.durationDays}
                          onChange={e => updateItem(item.id, (current) => ({ ...current, durationDays: e.target.value }))}
                          placeholder="Ex: 30"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Data início</label>
                        <input
                          type="date"
                          value={item.startDate}
                          onChange={e => updateItem(item.id, (current) => ({ ...current, startDate: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                        />
                      </div>
                    </div>
                  )}

                  {item.isPrimary && item.trackingMethod === 'weight' && pkgKg && dailyConsumptionG && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      <span>📦</span>
                      <span className="text-xs font-semibold text-amber-800">
                        Duração estimada: ~{Math.round((pkgKg * 1000) / dailyConsumptionG)} dias (após salvar, data exata calculada pelo servidor)
                      </span>
                    </div>
                  )}

                  {item.isPrimary && item.trackingMethod === 'duration' && itemMetrics.days != null && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      <span>⏳</span>
                      <span className="text-xs font-semibold text-amber-800">
                        O sistema vai usar {itemMetrics.days} dias para programar o próximo lembrete de reposição.
                      </span>
                    </div>
                  )}

                  {!item.isPrimary && itemMetrics.days != null && (
                    <div className="text-xs text-slate-500">
                      Previsão local deste item: cerca de {itemMetrics.days} dias.
                    </div>
                  )}

                  {!isQuickSetup && !showAdvanced && (
                    <button
                      type="button"
                      onClick={() => { setShowAdvanced(true); if (!hasExisting) setMethodChosen(false); }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Mostrar opções avançadas
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <ReminderPicker
            days={reminderDays}
            time={reminderTime}
            onDaysChange={setReminderDays}
            onTimeChange={setReminderTime}
          />

          {apiError && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800 flex items-start gap-2">
              <span>⚠️</span><span>{apiError}</span>
            </div>
          )}
          {savedOk && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800 flex items-center gap-2">
              <span>✅</span><span>{saveFeedback}</span>
            </div>
          )}

          <button type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold shadow-md disabled:opacity-50 active:scale-[0.99] transition-all"
          >
            {saving ? 'Salvando...' : formMode === 'quick_setup' ? '✅ Confirmar alimentação' : hasExisting ? '✅ Atualizar alimentação' : '✅ Confirmar alimentação'}
          </button>

          {hasExisting && formMode === 'edit' && (
            <button type="button"
              onClick={handleDelete}
              disabled={saving}
              className="w-full py-3.5 min-h-[44px] rounded-2xl border border-red-200 bg-red-50 text-red-700 text-sm font-bold shadow-sm disabled:opacity-50 active:scale-[0.99] transition-all hover:bg-red-100"
            >
              🗑 Excluir controle
            </button>
          )}
        </div>
      )}
    </div>
  );
}

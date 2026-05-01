import { useState, useEffect } from 'react';
import { API_BACKEND_BASE } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { FeedingPlanEntry, FeedingPlanItemEntry } from '@/lib/types/homeForms';

function normalizeFoodItems(raw: unknown): FeedingPlanItemEntry[] {
  if (!Array.isArray(raw)) return [];
  const parsed = raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item, index) => ({
      ...item,
      id: typeof item.id === 'string' ? item.id : `food-item-${index + 1}`,
      label: typeof item.label === 'string' ? item.label : null,
      food_brand: typeof item.food_brand === 'string' ? item.food_brand : null,
      package_size_kg: typeof item.package_size_kg === 'number' ? item.package_size_kg : null,
      daily_amount_g: typeof item.daily_amount_g === 'number' ? item.daily_amount_g : null,
      duration_days: typeof item.duration_days === 'number' ? item.duration_days : null,
      last_refill_date: typeof item.last_refill_date === 'string' ? item.last_refill_date : null,
      mode: typeof item.mode === 'string' ? item.mode : null,
      barcode: typeof item.barcode === 'string' ? item.barcode : null,
      category: typeof item.category === 'string' ? item.category : null,
      notes: typeof item.notes === 'string' ? item.notes : null,
      is_primary: Boolean(item.is_primary),
    }));

  if (!parsed.length) return [];
  const primaryIndex = parsed.findIndex((item) => item.is_primary);
  return parsed.map((item, index) => ({ ...item, is_primary: index === (primaryIndex >= 0 ? primaryIndex : 0) }));
}

function flattenFeedingPlan(raw: Record<string, unknown>): FeedingPlanEntry {
  const items = normalizeFoodItems(raw.items);
  const primary = items.find((item) => item.is_primary) ?? items[0] ?? null;
  return {
    ...raw,
    items,
    food_brand:
      (typeof raw.food_brand === 'string' ? raw.food_brand : null) ??
      primary?.food_brand ??
      (typeof raw.brand === 'string' ? raw.brand : null),
    brand:
      (typeof raw.brand === 'string' ? raw.brand : null) ??
      primary?.food_brand ??
      (typeof raw.food_brand === 'string' ? raw.food_brand : null),
    package_size_kg:
      (typeof raw.package_size_kg === 'number' ? raw.package_size_kg : null) ??
      primary?.package_size_kg ??
      null,
    daily_amount_g:
      (typeof raw.daily_amount_g === 'number' ? raw.daily_amount_g : null) ??
      primary?.daily_amount_g ??
      null,
    duration_days:
      (typeof raw.duration_days === 'number' ? raw.duration_days : null) ??
      primary?.duration_days ??
      null,
    last_refill_date:
      (typeof raw.last_refill_date === 'string' ? raw.last_refill_date : null) ??
      primary?.last_refill_date ??
      null,
    next_purchase_date:
      (typeof raw.next_purchase_date === 'string' ? raw.next_purchase_date : null) ??
      (typeof raw.nextPurchaseDate === 'string' ? raw.nextPurchaseDate : null) ??
      null,
    next_reminder_date: typeof raw.next_reminder_date === 'string' ? raw.next_reminder_date : null,
    estimated_end_date: typeof raw.estimated_end_date === 'string' ? raw.estimated_end_date : null,
    estimated_days_left: typeof raw.estimated_days_left === 'number' ? raw.estimated_days_left : null,
    manual_reminder_days_before:
      (typeof raw.manual_reminder_days_before === 'number' ? raw.manual_reminder_days_before : null) ??
      (typeof raw.manualDaysBefore === 'number' ? raw.manualDaysBefore : null) ??
      null,
    reminder_time: typeof raw.reminder_time === 'string' ? raw.reminder_time : null,
  };
}

export function useFoodPlanSync({ selectedPetId }: { selectedPetId: string | null }) {
  const [feedingPlan, setFeedingPlan] = useState<Record<string, FeedingPlanEntry>>({});

  const fetchFeedingPlan = async (petId: string, attempt = 1) => {
    const token = getToken();
    if (!petId) return;

    const maxRetries = 3;
    const isValidFeedingPlan = (entry: FeedingPlanEntry | null): boolean => {
      // Validar que o plano tem pelo menos alguns dados relevantes
      if (!entry) return false;
      // Se tem pet_id, consideramos válido (pode ter plano vazio, mas é válido)
      if (entry.pet_id) return true;
      // Se não tem pet_id, é inválido
      return false;
    };

    const readLocalFoodPlan = (): FeedingPlanEntry | null => {
      try {
        const raw = localStorage.getItem(`petmol_food_control_${petId}`);
        if (!raw) return null;
        const parsed = flattenFeedingPlan(JSON.parse(raw));
        // Só retorna se for válido
        return isValidFeedingPlan(parsed) ? parsed : null;
      } catch {
        return null;
      }
    };

    const syncFoodPlan = (entry: FeedingPlanEntry | null) => {
      setFeedingPlan((prev) => {
        if (!entry) {
          const next = { ...prev };
          delete next[petId];
          return next;
        }
        return { ...prev, [petId]: entry };
      });
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const res = await fetch(`${API_BACKEND_BASE}/health/pets/${petId}/feeding/plan`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        
        // Validar que data.plan existe e tem campos
        if (!data.plan || (typeof data.plan === 'object' && Object.keys(data.plan).length === 0)) {
          console.warn(`[FoodPlanSync] Plano vazio para pet ${petId}, tentativa ${attempt}/${maxRetries}`);
          // Se é a primeira tentativa, tentar novamente
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Backoff exponencial
            return fetchFeedingPlan(petId, attempt + 1);
          }
          // Usar fallback local
          const fallback = readLocalFoodPlan();
          syncFoodPlan(fallback);
          return;
        }

        const flat = flattenFeedingPlan({
          ...(data.plan ?? {}),
          next_reminder_date: data.estimate?.recommended_alert_date ?? null,
          estimated_end_date: data.estimate?.estimated_end_date ?? null,
          estimated_days_left: data.estimate?.estimated_days_left ?? null,
        });

        // Validar plano achatado antes de sincronizar
        if (!isValidFeedingPlan(flat)) {
          console.warn(`[FoodPlanSync] Plano inválido após flattenFeedingPlan para pet ${petId}`);
          const fallback = readLocalFoodPlan();
          syncFoodPlan(fallback);
          return;
        }

        syncFoodPlan(flat);
        
        // Salvar no localStorage com validação
        try {
          const stored = localStorage.getItem(`petmol_food_control_${petId}`);
          const local = stored ? JSON.parse(stored) : {};
          const merged = {
            ...local,
            ...flat,
            pet_id: flat.pet_id || local.pet_id || petId, // Garantir pet_id
            next_purchase_date: flat.next_purchase_date ?? local.next_purchase_date,
            next_reminder_date: flat.next_reminder_date ?? local.next_reminder_date,
            estimated_end_date: flat.estimated_end_date ?? local.estimated_end_date,
            estimated_days_left: flat.estimated_days_left ?? local.estimated_days_left ?? null,
            duration_days: flat.duration_days ?? local.duration_days ?? null,
            last_refill_date: flat.last_refill_date ?? local.last_refill_date ?? null,
            manual_reminder_days_before:
              (flat.manual_reminder_days_before as number | null | undefined) ??
              local.manual_reminder_days_before ??
              local.manualDaysBefore,
            reminder_time: flat.reminder_time ?? local.reminder_time ?? '09:00',
            food_brand: flat.food_brand ?? local.food_brand ?? local.brand,
            brand: flat.brand ?? local.brand ?? local.food_brand,
          };
          // Validar antes de salvar
          if (merged.pet_id) {
            localStorage.setItem(`petmol_food_control_${petId}`, JSON.stringify(merged));
          }
        } catch (storageError) {
          console.error(`[FoodPlanSync] Erro ao salvar localStorage para ${petId}:`, storageError);
        }
        return;
      }

      // Status não 200 OK
      if (res.status === 404) {
        console.info(`[FoodPlanSync] Plano não encontrado para pet ${petId} (404)`);
        syncFoodPlan(null);
        return;
      }

      // Erro 5xx ou outro erro — tentar novamente
      if (attempt < maxRetries && res.status >= 500) {
        console.warn(`[FoodPlanSync] Erro ${res.status} para pet ${petId}, tentativa ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Backoff exponencial
        return fetchFeedingPlan(petId, attempt + 1);
      }

      // Erro final — usar fallback local
      console.error(`[FoodPlanSync] Erro ${res.status} ao carregar plano para ${petId}`);
      const fallback = readLocalFoodPlan();
      syncFoodPlan(fallback);
    } catch (e) {
      // Timeout ou erro de rede
      if (e instanceof Error && e.name === 'AbortError') {
        console.warn(`[FoodPlanSync] Timeout ao carregar plano para pet ${petId}, tentativa ${attempt}/${maxRetries}`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Backoff exponencial
          return fetchFeedingPlan(petId, attempt + 1);
        }
      } else {
        console.error(`[FoodPlanSync] Erro ao carregar plano alimentar para ${petId}:`, e);
      }
      
      // Usar fallback local em caso de erro
      const fallback = readLocalFoodPlan();
      syncFoodPlan(fallback);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedPetId) fetchFeedingPlan(selectedPetId);
  }, [selectedPetId]);

  return { feedingPlan, setFeedingPlan, fetchFeedingPlan };
}

/**
 * Camada de orientação do novato — derivação de progresso.
 *
 * A fonte de verdade é o DADO REAL do pet (vacinas, controles parasitários,
 * plano alimentar). O localStorage só guarda o que o dado real não consegue
 * dizer: "eu declarei que não uso" ou "deixo pra depois". Dado real sempre
 * ganha de uma declaração antiga.
 *
 * Sem React aqui de propósito — função pura + acesso a storage, testável.
 */

import type { FeedingPlanEntry } from '@/lib/types/homeForms';

export type OnboardingStepKey = 'profile' | 'food' | 'vaccine' | 'flea' | 'dewormer';

/** Declarações explícitas que o dado real não carrega. */
export interface OnboardingStore {
  /** "later" = configurar depois · "na" = não uso ração de saco */
  food?: 'later' | 'na';
  /** "later" = depois · "unknown" = não sei o histórico */
  vaccine?: 'later' | 'unknown';
  /** "later" = depois · "none" = não uso · "unknown" = não sei */
  flea?: 'later' | 'none' | 'unknown';
  dewormer?: 'later' | 'none' | 'unknown';
  /** usuário fechou o card */
  dismissed?: boolean;
  /** ISO — tela de conclusão já foi mostrada uma vez */
  completedShownAt?: string;
  /** ISO — primeira montagem do checklist para este pet (evento onboarding_started) */
  startedAt?: string;
}

export interface OnboardingStepState {
  key: OnboardingStepKey;
  done: boolean;
  /** true = concluído por dado real; false = concluído por declaração ("depois"/"não uso") */
  fromData: boolean;
}

export interface OnboardingProgress {
  steps: OnboardingStepState[];
  doneCount: number;
  total: number;
  allResolved: boolean;
  dismissed: boolean;
  completedShownAt?: string;
  startedAt?: string;
}

export interface DeriveOnboardingInput {
  petId: string;
  hasPet: boolean;
  vaccinesCount: number;
  parasiteTypes: string[];
  feedingPlan: FeedingPlanEntry | null | undefined;
}

const STEP_ORDER: OnboardingStepKey[] = ['profile', 'food', 'vaccine', 'flea', 'dewormer'];

const storeKey = (petId: string) => `petmol_onboarding_v2:${petId}`;
const ACTIVE_FLAG = 'petmol_onboarding_active';

// ── Storage ──────────────────────────────────────────────────────────────────

export function readOnboardingStore(petId: string): OnboardingStore {
  if (typeof window === 'undefined' || !petId) return {};
  try {
    const raw = window.localStorage.getItem(storeKey(petId));
    return raw ? (JSON.parse(raw) as OnboardingStore) : {};
  } catch {
    return {};
  }
}

export function writeOnboardingStore(petId: string, patch: Partial<OnboardingStore>): OnboardingStore {
  if (typeof window === 'undefined' || !petId) return {};
  const next = { ...readOnboardingStore(petId), ...patch };
  try {
    window.localStorage.setItem(storeKey(petId), JSON.stringify(next));
  } catch {
    /* storage cheio / bloqueado — não é fatal */
  }
  return next;
}

/**
 * Flag global lida pelo CoachMark para só aparecer enquanto um onboarding
 * está de fato em andamento (evita dica contextual para usuário veterano).
 */
export function setOnboardingActiveFlag(active: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (active) window.localStorage.setItem(ACTIVE_FLAG, '1');
    else window.localStorage.removeItem(ACTIVE_FLAG);
  } catch {
    /* noop */
  }
}

export function isOnboardingActiveFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ACTIVE_FLAG) === '1';
  } catch {
    return false;
  }
}

// ── Derivação ────────────────────────────────────────────────────────────────

/**
 * "Tem alimentação cadastrada?" — mesma heurística usada no HomePetDashboard
 * (`hasFoodData`), centralizada aqui para não divergir.
 */
export function hasFoodData(plan: FeedingPlanEntry | null | undefined): boolean {
  if (!plan) return false;
  const isNonKibbleDeclared = Boolean(
    plan.no_consumption_control && plan.mode && plan.mode !== 'kibble' && !plan.food_brand && !plan.brand,
  );
  if (isNonKibbleDeclared) return true;
  return Boolean(
    plan.items?.length ||
      plan.food_brand ||
      plan.brand ||
      typeof plan.duration_days === 'number' ||
      plan.estimated_end_date ||
      typeof plan.estimated_days_left === 'number',
  );
}

export function deriveOnboardingProgress(input: DeriveOnboardingInput): OnboardingProgress {
  const store = readOnboardingStore(input.petId);
  const types = input.parasiteTypes;

  const dataProfile = input.hasPet;
  const dataFood = hasFoodData(input.feedingPlan);
  const dataVaccine = input.vaccinesCount > 0;
  const dataFlea = types.some((t) => t === 'flea_tick' || t === 'collar' || t === 'leishmaniasis');
  const dataDewormer = types.some((t) => t === 'dewormer' || t === 'heartworm');

  const stepMap: Record<OnboardingStepKey, OnboardingStepState> = {
    profile: { key: 'profile', done: dataProfile, fromData: dataProfile },
    food: { key: 'food', done: dataFood || store.food != null, fromData: dataFood },
    vaccine: { key: 'vaccine', done: dataVaccine || store.vaccine != null, fromData: dataVaccine },
    flea: { key: 'flea', done: dataFlea || store.flea != null, fromData: dataFlea },
    dewormer: { key: 'dewormer', done: dataDewormer || store.dewormer != null, fromData: dataDewormer },
  };

  const steps = STEP_ORDER.map((k) => stepMap[k]);
  const doneCount = steps.filter((s) => s.done).length;

  return {
    steps,
    doneCount,
    total: steps.length,
    allResolved: doneCount === steps.length,
    dismissed: store.dismissed === true,
    completedShownAt: store.completedShownAt,
    startedAt: store.startedAt,
  };
}

/**
 * O card deve aparecer? Só para quem tem pet, ainda não resolveu tudo e não
 * fechou o card. Usuário veterano com dados completos cai em `allResolved` e
 * nunca vê nada.
 */
export function shouldShowOnboardingCard(progress: OnboardingProgress): boolean {
  return progress.doneCount > 0 && !progress.allResolved && !progress.dismissed;
}

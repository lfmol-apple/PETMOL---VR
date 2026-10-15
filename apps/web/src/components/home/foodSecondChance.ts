/**
 * "Segunda chance" da ração dentro do app. O pedido de ração aparece UMA vez logo após o 1º pet
 * (FoodOnboardingCard); quem escolhe "depois" nunca mais era perguntado — e 113 dessas pessoas voltam ao
 * app em outros dias (15/10/2026). Aqui o pedido volta de forma discreta: no máximo 3 vezes, com pausa de
 * 7 dias entre elas, e só enquanto o pet não tem ração. Função pura + localStorage, testável.
 */
export const SECOND_CHANCE_MAX = 3;
export const SECOND_CHANCE_GAP_DAYS = 7;
const key = (petId: string) => `petmol_food_second_chance:${petId}`;

export interface SecondChanceState { count: number; lastAt: number | null }

export function readSecondChance(petId: string): SecondChanceState {
  try {
    const raw = window.localStorage.getItem(key(petId));
    if (!raw) return { count: 0, lastAt: null };
    const parsed = JSON.parse(raw) as Partial<SecondChanceState>;
    return { count: Number(parsed.count) || 0, lastAt: parsed.lastAt ? Number(parsed.lastAt) : null };
  } catch {
    return { count: 0, lastAt: null };
  }
}

/** Registra que o cartão foi dispensado/usado agora: conta mais 1 e começa a pausa de 7 dias. */
export function recordSecondChance(petId: string, now: number = Date.now()): SecondChanceState {
  const next = { count: readSecondChance(petId).count + 1, lastAt: now };
  try { window.localStorage.setItem(key(petId), JSON.stringify(next)); } catch { /* sem storage: só não lembra */ }
  return next;
}

/** Marca o "depois" do onboarding como a 0ª vez: a 1ª segunda chance só vem depois da pausa. */
export function startSecondChanceClock(petId: string, now: number = Date.now()): void {
  try {
    if (!window.localStorage.getItem(key(petId))) {
      window.localStorage.setItem(key(petId), JSON.stringify({ count: 0, lastAt: now }));
    }
  } catch { /* noop */ }
}

/**
 * Deve mostrar? Só se o pet NÃO tem ração, a pessoa escolheu "depois" no onboarding (nunca para quem
 * declarou "não uso ração"), ainda não passou de 3 vezes e já se passaram 7 dias desde a última.
 */
export function shouldShowSecondChance(args: {
  hasFoodData: boolean;
  onboardingFood: 'later' | 'na' | undefined;
  state: SecondChanceState;
  now?: number;
}): boolean {
  const { hasFoodData, onboardingFood, state, now = Date.now() } = args;
  if (hasFoodData || onboardingFood !== 'later') return false;
  if (state.count >= SECOND_CHANCE_MAX) return false;
  if (state.lastAt == null) return true;
  return now - state.lastAt >= SECOND_CHANCE_GAP_DAYS * 86400000;
}

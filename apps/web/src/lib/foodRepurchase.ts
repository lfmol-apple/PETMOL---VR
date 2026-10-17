// Intenção de recompra: guardada ao tocar em "Comprar" (o tutor sai pra loja)
// e consultada quando ele volta ao app, pra perguntar "Comprou?" e reiniciar o
// controle em um toque. Só no aparelho (localStorage); nunca bloqueia nada.
const KEY = 'petmol_food_repurchase_v1';
const MIN_AWAY_MS = 20_000; // abaixo disso ele nem chegou a sair do app
const EXPIRES_MS = 14 * 24 * 60 * 60 * 1000;
const SNOOZE_MS = 24 * 60 * 60 * 1000;

export type FoodRepurchaseIntent = { petId: string; brand: string; at: number; snoozeUntil?: number };

function read(): FoodRepurchaseIntent | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as FoodRepurchaseIntent;
    if (!v || typeof v.petId !== 'string' || typeof v.at !== 'number') return null;
    return v;
  } catch {
    return null;
  }
}

function write(v: FoodRepurchaseIntent | null) {
  try {
    if (v) window.localStorage.setItem(KEY, JSON.stringify(v));
    else window.localStorage.removeItem(KEY);
  } catch { /* sem storage: o cartão simplesmente não aparece */ }
}

export function markFoodRepurchaseIntent(petId: string, brand: string, now = Date.now()) {
  write({ petId, brand, at: now });
}

export function getPendingFoodRepurchase(petId: string, now = Date.now()): FoodRepurchaseIntent | null {
  const v = read();
  if (!v || v.petId !== petId) return null;
  if (now - v.at > EXPIRES_MS) { write(null); return null; }
  if (now - v.at < MIN_AWAY_MS) return null;
  if (v.snoozeUntil && now < v.snoozeUntil) return null;
  return v;
}

export function snoozeFoodRepurchase(now = Date.now()) {
  const v = read();
  if (v) write({ ...v, snoozeUntil: now + SNOOZE_MS });
}

export function clearFoodRepurchase() {
  write(null);
}

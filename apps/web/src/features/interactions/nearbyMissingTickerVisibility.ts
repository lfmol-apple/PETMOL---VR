'use client';

// Regra de exibição do letreiro (NearbyMissingPetsTicker) — sem isso ele
// ficaria animando toda vez que a Home abre, pelos dias inteiros em que um
// alerta continuar ativo na região. "Isso não pode ficar chato": um
// CONJUNTO NOVO de alertas (qualquer ID nunca visto) sempre acende o
// letreiro; o MESMO conjunto só anima nas primeiras aberturas da Home,
// depois some sozinho — o botão "Pet Sumido" (bolinha vermelha + contagem)
// continua avisando sem limite, é a fonte confiável de sempre.
const STORAGE_KEY = 'petmol_nearby_ticker_seen_v1';
const MAX_SHOWS_PER_SET = 3;

interface TickerState {
  alertIds: string[];
  showCount: number;
}

function readState(): TickerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { alertIds: [], showCount: 0 };
    return JSON.parse(raw) as TickerState;
  } catch {
    return { alertIds: [], showCount: 0 };
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Chamar a cada render, sem efeito colateral. */
export function shouldShowNearbyTicker(currentAlertIds: string[]): boolean {
  if (currentAlertIds.length === 0) return false;
  const state = readState();
  if (!sameSet(state.alertIds, currentAlertIds)) return true; // conjunto novo — sempre mostra
  return state.showCount < MAX_SHOWS_PER_SET;
}

/** Chamar UMA VEZ por abertura da Home em que o letreiro de fato apareceu
 *  (não a cada checagem) — registra mais uma exibição desse conjunto. */
export function registerNearbyTickerShown(currentAlertIds: string[]): void {
  if (currentAlertIds.length === 0) return;
  const state = readState();
  const next: TickerState = sameSet(state.alertIds, currentAlertIds)
    ? { alertIds: currentAlertIds, showCount: state.showCount + 1 }
    : { alertIds: currentAlertIds, showCount: 1 };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* best effort */ }
}

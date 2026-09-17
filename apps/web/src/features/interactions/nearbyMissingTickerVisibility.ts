'use client';

// Regra de exibição do letreiro (NearbyMissingPetsTicker) — sem isso ele
// ficaria animando toda vez que a Home abre, pelos dias inteiros em que um
// alerta continuar ativo na região. "Isso não pode ficar chato" — mas
// também "não podemos deixar de anunciar os pets sumidos": o letreiro NUNCA
// fica em silêncio pra sempre, só espaça as aparições.
//
// Modelo "explosão inicial + retorno periódico": um conjunto novo de
// alertas (qualquer ID nunca visto) sempre acende nas primeiras aberturas;
// depois disso, o MESMO conjunto volta a aparecer a cada N aberturas
// seguintes da Home — "momentos estratégicos de uso do app" — em vez de
// desaparecer de vez. O botão "Pet Sumido" (bolinha vermelha + contagem)
// continua avisando sem nenhuma dessas regras, é a fonte sempre confiável.
// v2: o pisco mudou de posição/estilo no PR #417 (letreiro acima da foto →
// pill no lugar do selo de atenção) — a contagem antiga não pode contar
// contra o desenho novo, senão ele nasce já em silêncio pra quem testou o
// desenho antigo à exaustão.
const STORAGE_KEY = 'petmol_nearby_ticker_seen_v2';
const BURST_SHOWS = 3; // aparece nas 3 primeiras aberturas de um conjunto novo
const PERIODIC_EVERY_OPENS = 5; // depois disso, volta a cada 5 aberturas

interface TickerState {
  alertIds: string[];
  showCount: number;
  openCount: number;
  lastShownAtOpen: number;
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

function emptyState(ids: string[]): TickerState {
  return { alertIds: ids, showCount: 0, openCount: 0, lastShownAtOpen: 0 };
}

// Conjunto diferente do salvo (alerta novo entrou, ou um saiu) = reseta o
// histórico e volta pra "explosão inicial" — informação nova sempre fura.
function readState(currentAlertIds: string[]): TickerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState(currentAlertIds);
    const parsed = JSON.parse(raw) as TickerState;
    if (!sameSet(parsed.alertIds, currentAlertIds)) return emptyState(currentAlertIds);
    return parsed;
  } catch {
    return emptyState(currentAlertIds);
  }
}

/** Chamar a cada render, sem efeito colateral. */
export function shouldShowNearbyTicker(currentAlertIds: string[]): boolean {
  if (currentAlertIds.length === 0) return false;
  const state = readState(currentAlertIds);
  if (state.showCount < BURST_SHOWS) return true;
  const opensSinceShown = state.openCount - state.lastShownAtOpen;
  return opensSinceShown >= PERIODIC_EVERY_OPENS;
}

/** Chamar UMA VEZ por abertura da Home pra esse conjunto (mostrado ou não)
 *  — registra a abertura e, se o letreiro apareceu, marca quando. */
export function registerNearbyTickerHomeOpen(currentAlertIds: string[], wasShown: boolean): void {
  if (currentAlertIds.length === 0) return;
  const state = readState(currentAlertIds);
  const nextOpenCount = state.openCount + 1;
  const next: TickerState = {
    alertIds: currentAlertIds,
    openCount: nextOpenCount,
    showCount: wasShown ? state.showCount + 1 : state.showCount,
    lastShownAtOpen: wasShown ? nextOpenCount : state.lastShownAtOpen,
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* best effort */ }
}

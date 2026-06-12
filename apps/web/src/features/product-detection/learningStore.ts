import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { ProductCategory } from '@/lib/productScanner';

// ── Tipos ──────────────────────────────────────────────────────────────────
export type ScanDecisionSource = 'gtin' | 'ai' | 'parser' | 'fuzzy_match' | 'partial_name' | 'manual';

export interface LearningConfirmPayload {
  barcode?: string;
  name: string;
  brand?: string;
  category?: ProductCategory;
  manufacturer?: string;
  presentation?: string;
  weight?: string;
  species?: string;
  life_stage?: string;
  decision_source: ScanDecisionSource;
  decision_score?: number;
  decision_result?: 'complete' | 'partial' | 'fallback';
  ai_suggested_name?: string;
  ai_confidence?: number;
  probable_name?: string;
  visible_text?: string;
  ocr_raw_text?: string;
  tutor_confirmed?: boolean;
  pet_id?: string;
}

export interface CatalogSearchResult {
  barcode: string;
  name: string;
  brand?: string;
  category?: string;
  weight?: string;
  species?: string;
  life_stage?: string;
  source: string;
  confidence: number;
}

// ── Memória local de correções ─────────────────────────────────────────────
const CORRECTIONS_KEY = 'petmol_product_corrections_v1';
const LEARNING_EVENTS_KEY = 'petmol_product_learning_events_v1';

interface LocalCorrection {
  barcode?: string;
  suggested: string;
  corrected: string;
  category?: string;
  savedAt: string;
}

interface LocalLearningEvent {
  code?: string;
  name: string;
  brand?: string;
  category?: ProductCategory;
  species?: string;
  life_stage?: string;
  weight?: string;
  probable_name?: string;
  visible_text?: string;
  decision_source: ScanDecisionSource;
  decision_score?: number;
  decision_result?: 'complete' | 'partial' | 'fallback';
  ai_suggested_name?: string;
  tutor_confirmed: boolean;
  createdAt: string;
}

export function saveLocalCorrection(correction: Omit<LocalCorrection, 'savedAt'>): void {
  try {
    const raw = localStorage.getItem(CORRECTIONS_KEY);
    const existing: LocalCorrection[] = raw ? (JSON.parse(raw) as LocalCorrection[]) : [];
    const updated = [{ ...correction, savedAt: new Date().toISOString() }, ...existing].slice(0, 300);
    localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(updated));
  } catch { /* silent */ }
}

export function findLocalCorrection(suggested: string, category?: string): string | null {
  try {
    const raw = localStorage.getItem(CORRECTIONS_KEY);
    if (!raw) return null;
    const corrections: LocalCorrection[] = JSON.parse(raw) as LocalCorrection[];
    const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const ns = norm(suggested);
    // Prefer same-category match, fallback to any
    const match =
      corrections.find(c => norm(c.suggested) === ns && (!category || c.category === category)) ??
      corrections.find(c => norm(c.suggested) === ns);
    return match?.corrected ?? null;
  } catch {
    return null;
  }
}

function saveLocalLearningEvent(event: Omit<LocalLearningEvent, 'createdAt'>): void {
  try {
    const raw = localStorage.getItem(LEARNING_EVENTS_KEY);
    const existing: LocalLearningEvent[] = raw ? (JSON.parse(raw) as LocalLearningEvent[]) : [];
    const updated = [{ ...event, createdAt: new Date().toISOString() }, ...existing].slice(0, 500);
    localStorage.setItem(LEARNING_EVENTS_KEY, JSON.stringify(updated));
  } catch {
    // silent
  }
}

// ── Confirmação com aprendizado ────────────────────────────────────────────
export async function submitLearningConfirmation(payload: LearningConfirmPayload): Promise<void> {
  const code = payload.barcode?.replace(/\D/g, '') ?? '';
  saveLocalLearningEvent({
    code: code || undefined,
    name: payload.name,
    brand: payload.brand,
    category: payload.category,
    species: payload.species,
    life_stage: payload.life_stage,
    weight: payload.weight,
    probable_name: payload.probable_name,
    visible_text: payload.visible_text,
    decision_source: payload.decision_source,
    decision_score: payload.decision_score ?? payload.ai_confidence,
    decision_result: payload.decision_result,
    ai_suggested_name: payload.ai_suggested_name,
    tutor_confirmed: payload.tutor_confirmed ?? true,
  });

  // Persistir correção local ANTES da chamada de rede (mesmo offline)
  const userChangedName =
    payload.ai_suggested_name &&
    payload.ai_suggested_name.trim().toLowerCase() !== payload.name.trim().toLowerCase();

  if (userChangedName && payload.ai_suggested_name) {
    saveLocalCorrection({
      barcode: payload.barcode,
      suggested: payload.ai_suggested_name,
      corrected: payload.name,
      category: payload.category,
    });
  }

  const token = getToken();
  if (!token) return;
  if (!code || code.length < 8) return;

  try {
    await fetch(`${API_BASE_URL}/api/product-lookup/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
      signal: AbortSignal.timeout(3500),
      body: JSON.stringify({
        code,
        name: payload.name,
        brand: payload.brand ?? null,
        category: payload.category ?? 'other',
        manufacturer: payload.manufacturer ?? null,
        presentation: payload.presentation ?? null,
        source: payload.decision_source,
        confidence: payload.ai_confidence ?? 1.0,
        ai_suggested_name: userChangedName ? payload.ai_suggested_name : null,
        decision_source: payload.decision_source,
        decision_score: payload.decision_score ?? payload.ai_confidence ?? null,
        decision_result: payload.decision_result ?? null,
        species: payload.species ?? null,
        life_stage: payload.life_stage ?? null,
        weight: payload.weight ?? null,
        probable_name: payload.probable_name ?? null,
        visible_text: payload.visible_text ?? null,
        ocr_raw_text: payload.ocr_raw_text ?? null,
        tutor_confirmed: payload.tutor_confirmed ?? true,
        pet_id: payload.pet_id ?? null,
      }),
    });
  } catch { /* offline — correção local já salva */ }
}

// ── Busca no catálogo próprio ──────────────────────────────────────────────
export async function searchOwnCatalog(
  q: string,
  category?: ProductCategory,
  limit = 5,
): Promise<CatalogSearchResult[]> {
  if (!q.trim() || q.trim().length < 2) return [];
  try {
    const params = new URLSearchParams({ q: q.trim(), limit: String(limit) });
    if (category && category !== 'other') params.set('category', category);
    const res = await fetch(`${API_BASE_URL}/api/products/catalog/search?${params}`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results: CatalogSearchResult[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

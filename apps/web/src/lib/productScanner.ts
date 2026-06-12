'use client';

export type ProductCategory =
  | 'food'
  | 'medication'
  | 'antiparasite'
  | 'dewormer'
  | 'collar'
  | 'hygiene'
  | 'other';

export interface ScannedProduct {
  barcode: string;
  name: string;
  brand?: string;
  weight?: string;
  category: ProductCategory;
  manufacturer?: string;
  presentation?: string;
  concentration?: string;
  found: boolean;
  queued?: boolean;
  queueMessage?: string;
}

const CATEGORY_WORDS: Record<ProductCategory, string[]> = {
  food: ['racao', 'ração', 'food', 'kibble', 'croquette', 'alimento', 'petisco', 'snack'],
  medication: ['medicamento', 'medication', 'remedio', 'remédio', 'comprimido', 'suspensao', 'suspensão', 'mg', 'ml'],
  antiparasite: ['antipulgas', 'antiparasitario', 'antiparasitário', 'flea', 'tick', 'carrapato', 'bravecto', 'nexgard', 'simparica'],
  dewormer: ['vermifugo', 'vermífugo', 'dewormer', 'verme', 'drontal', 'milbemax'],
  collar: ['coleira', 'collar', 'seresto', 'scalibor'],
  hygiene: ['higiene', 'shampoo', 'tapete', 'areia', 'litter', 'lenço', 'lenco'],
  other: [],
};

export function classifyProductText(text: string): ProductCategory {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const category of ['antiparasite', 'dewormer', 'collar', 'medication', 'food', 'hygiene'] as ProductCategory[]) {
    if (CATEGORY_WORDS[category].some(word => normalized.includes(word.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
      return category;
    }
  }
  return 'other';
}

function extractWeight(text: string): string | undefined {
  return text.match(/\b\d+(?:[,.]\d+)?\s?(?:kg|g|ml|l)\b/i)?.[0];
}

function extractConcentration(text: string): string | undefined {
  return text.match(/\b\d+(?:[,.]\d+)?\s?(?:mg|mcg|g|ml)(?:\/\d+(?:[,.]\d+)?\s?(?:ml|kg|g))?\b/i)?.[0];
}

// ── Scan History ─────────────────────────────────────────────────────────────
export interface ScanHistoryEntry {
  barcode?: string;
  product: ScannedProduct;
  petId: string;
  category: ProductCategory;
  confirmedAt: string;
}

const HISTORY_KEY = 'petmol_scan_history_v2';
const MAX_HISTORY = 40;

export function saveToScanHistory(entry: Omit<ScanHistoryEntry, 'confirmedAt'>): void {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const existing: ScanHistoryEntry[] = raw ? (JSON.parse(raw) as ScanHistoryEntry[]) : [];
    // deduplicate: remove same barcode or same name+petId
    const deduped = existing.filter(e => {
      if (entry.barcode && e.barcode === entry.barcode) return false;
      if (e.product.name && e.product.name === entry.product.name && e.petId === entry.petId) return false;
      return true;
    });
    const updated = [{ ...entry, confirmedAt: new Date().toISOString() }, ...deduped].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch { /* silent */ }
}

export function loadScanHistory(petId?: string, category?: ProductCategory): ScanHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as ScanHistoryEntry[];
    return entries.filter(e => {
      if (petId && e.petId !== petId) return false;
      if (category && category !== 'other' && e.category !== category) return false;
      return true;
    });
  } catch {
    return [];
  }
}

export function findHistoryMatch(barcode: string): ScannedProduct | null {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return null;
    const entries = JSON.parse(raw) as ScanHistoryEntry[];
    return entries.find(e => e.barcode === barcode)?.product ?? null;
  } catch {
    return null;
  }
}

export function getSearchSuggestions(query: string, category?: ProductCategory, petId?: string): string[] {
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = normalize(query);
  const results = new Set<string>();

  // 1. History-based (highest priority)
  const history = loadScanHistory(petId, category);
  for (const entry of history) {
    if (entry.product.name && normalize(entry.product.name).includes(q)) {
      results.add(entry.product.name);
    }
  }

  return Array.from(results).slice(0, 8);
}

export async function identifyProductByBarcode(barcode: string): Promise<ScannedProduct> {
  try {
    const { resolveProduct, resolveProductLookup } = await import('@/features/product-detection/resolver');
    const resolved = await resolveProduct(barcode);
    if (resolved) {
      return {
        barcode: resolved.barcode,
        name: resolved.name || `Produto ${barcode}`,
        brand: resolved.brand,
        weight: resolved.weight,
        category: resolved.category,
        manufacturer: resolved.manufacturer ?? resolved.brand,
        presentation: resolved.presentation ?? resolved.weight,
        concentration: resolved.concentration,
        found: true,
      };
    }

    const lookup = await resolveProductLookup(barcode);
    if (lookup?.queued) {
      return {
        barcode: lookup.gtin || barcode,
        name: '',
        category: 'other',
        found: false,
        queued: true,
        queueMessage: 'Produto enviado para fila de catalogação',
      };
    }
  } catch {
    // Camera flow must never block if the lookup pipeline is unavailable.
  }

  return {
    barcode,
    name: '',
    category: 'other',
    found: false,
    queued: false,
  };
}

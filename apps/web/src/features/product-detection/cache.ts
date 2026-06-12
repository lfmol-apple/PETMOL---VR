import type { ResolvedProduct } from './types';

const CACHE_KEY = 'petmol_barcode_cache_v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CacheEntry {
  product: ResolvedProduct;
  savedAt: number;
}

type CacheStore = Record<string, CacheEntry>;

function readStore(): CacheStore {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CacheStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: CacheStore): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch { /* storage full — silent */ }
}

/** Returns the cached product for a barcode, or null if missing / expired. */
export function getLocalProduct(barcode: string): ResolvedProduct | null {
  const store = readStore();
  const entry = store[barcode];
  if (!entry) return null;
  if (Date.now() - entry.savedAt > TTL_MS) {
    delete store[barcode];
    writeStore(store);
    return null;
  }
  return { ...entry.product, source: 'cache' };
}

/** Persists a confirmed product so the next lookup is instant. */
export function saveLocalProduct(barcode: string, product: ResolvedProduct): void {
  const store = readStore();
  store[barcode] = { product, savedAt: Date.now() };
  writeStore(store);
}

/** Removes a cached entry (useful when user rejects a wrong match). */
export function clearLocalProduct(barcode: string): void {
  const store = readStore();
  delete store[barcode];
  writeStore(store);
}

'use client';

import { useEffect } from 'react';

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias — descarta rascunhos muito antigos

interface StoredDraft<T> {
  data: T;
  savedAt: number;
}

export function saveDraft<T>(key: string, data: T): void {
  try {
    const entry: StoredDraft<T> = { data, savedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage indisponível (modo privado, cota esgotada) — falha silenciosa
  }
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as StoredDraft<T>;
    if (Date.now() - entry.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/**
 * Salva automaticamente `data` em localStorage quando `isActive && hasContent`.
 * Não apaga automaticamente — use clearDraft() explicitamente ao salvar ou cancelar.
 */
export function useDraftAutosave<T>(
  key: string | null,
  data: T,
  isActive: boolean,
  hasContent: boolean,
): void {
  useEffect(() => {
    if (!key || !isActive || !hasContent) return;
    saveDraft(key, data);
  }, [key, data, isActive, hasContent]);
}

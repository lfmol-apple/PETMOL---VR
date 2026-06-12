import { useRef, useCallback } from 'react';

interface BarcodeScanOptions {
  onDetected: (barcode: string) => void;
  /** Minimum ms between two fires for the same code (default: 1500) */
  debounceMs?: number;
}

export interface BarcodeScanControls {
  handleCode: (code: string) => void;
  markResolved: () => void;
  reset: () => void;
}

/**
 * Debounced barcode scan hook.
 *
 * - Deduplicates rapid re-reads of the same barcode within debounceMs.
 * - Guards against starting a new resolution while one is in flight.
 * - Call markResolved() when the resolution pipeline has finished.
 * - Call reset() to clear all state (e.g. when the scanner closes).
 */
export function useBarcodeScanDebounce({
  onDetected,
  debounceMs = 1500,
}: BarcodeScanOptions): BarcodeScanControls {
  const lastCodeRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inProgressRef = useRef(false);

  const handleCode = useCallback(
    (code: string) => {
      // Skip if a resolution is already running
      if (inProgressRef.current) return;
      // Skip if this is the same code within the debounce window
      if (lastCodeRef.current === code && timerRef.current) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      lastCodeRef.current = code;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastCodeRef.current = null;
      }, debounceMs);

      inProgressRef.current = true;
      onDetected(code);
    },
    [onDetected, debounceMs],
  );

  const markResolved = useCallback(() => {
    inProgressRef.current = false;
  }, []);

  const reset = useCallback(() => {
    inProgressRef.current = false;
    lastCodeRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { handleCode, markResolved, reset };
}

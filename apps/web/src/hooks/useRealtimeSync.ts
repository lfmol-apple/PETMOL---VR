import { useCallback, useEffect, useRef, useState } from 'react';

type SyncStatus = 'synced' | 'offline' | 'reconnecting';

interface UseRealtimeSyncOptions {
  enabled?: boolean;
  onSync: () => void | Promise<void>;
  debounceMs?: number;
  pollingMs?: number;
}

function shouldSaveData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

export function useRealtimeSync({
  enabled = true,
  onSync,
  debounceMs = 5_000,
  pollingMs = 60_000,
}: UseRealtimeSyncOptions) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [possiblyStale, setPossiblyStale] = useState(false);
  const lastSyncRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSyncRef = useRef(onSync);

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  const runSync = useCallback(async () => {
    if (!enabled) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (shouldSaveData()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncStatus('offline');
      setPossiblyStale(true);
      return;
    }

    setSyncStatus(possiblyStale ? 'reconnecting' : 'synced');
    try {
      await onSyncRef.current();
      lastSyncRef.current = Date.now();
      setPossiblyStale(false);
      setSyncStatus('synced');
    } catch {
      setPossiblyStale(true);
      setSyncStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'reconnecting');
    }
  }, [enabled, possiblyStale]);

  const requestSync = useCallback(() => {
    if (!enabled) return;
    const now = Date.now();
    const elapsed = now - lastSyncRef.current;
    if (elapsed >= debounceMs) {
      void runSync();
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => void runSync(), debounceMs - elapsed);
  }, [debounceMs, enabled, runSync]);

  useEffect(() => {
    if (!enabled) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') requestSync();
    };
    const onOnline = () => {
      setSyncStatus('reconnecting');
      requestSync();
    };
    const onOffline = () => {
      setPossiblyStale(true);
      setSyncStatus('offline');
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) requestSync();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pageshow', onPageShow);

    const interval = setInterval(() => requestSync(), pollingMs);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pageshow', onPageShow);
      clearInterval(interval);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, pollingMs, requestSync]);

  return { syncStatus, possiblyStale, requestSync, setPossiblyStale };
}

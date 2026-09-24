import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const refresh = vi.fn(async () => 'updated');
vi.mock('@/lib/silentLocationRefresh', () => ({ refreshLocationSilently: () => refresh() }));

import { useSilentLocationRefresh } from './useSilentLocationRefresh';

beforeEach(() => { refresh.mockClear(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('useSilentLocationRefresh', () => {
  it('quem compartilha GPS: renova ~3 s depois de abrir e ao voltar pro primeiro plano', () => {
    renderHook(() => useSilentLocationRefresh(true));
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(refresh).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('quem NÃO compartilha: nunca renova', () => {
    renderHook(() => useSilentLocationRefresh(false));
    vi.advanceTimersByTime(10_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refresh).not.toHaveBeenCalled();
  });
});

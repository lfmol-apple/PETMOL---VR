import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOneTimeAsk } from './useOneTimeAsk';

beforeEach(() => localStorage.clear());

describe('useOneTimeAsk', () => {
  it('enabled=true e nunca visto: abre', () => {
    const { result } = renderHook(() => useOneTimeAsk('k1', true));
    expect(result.current.open).toBe(true);
  });

  it('enabled=false (já tem a permissão): nunca abre', () => {
    const { result } = renderHook(() => useOneTimeAsk('k2', false));
    expect(result.current.open).toBe(false);
  });

  it('dismiss marca como visto — não abre de novo nem remontando', () => {
    const { result, unmount } = renderHook(() => useOneTimeAsk('k3', true));
    expect(result.current.open).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.open).toBe(false);
    unmount();

    const { result: result2 } = renderHook(() => useOneTimeAsk('k3', true));
    expect(result2.current.open).toBe(false);
  });

  it('chaves diferentes não interferem entre si', () => {
    const { result: a } = renderHook(() => useOneTimeAsk('k4a', true));
    act(() => a.current.dismiss());
    const { result: b } = renderHook(() => useOneTimeAsk('k4b', true));
    expect(b.current.open).toBe(true);
  });
});

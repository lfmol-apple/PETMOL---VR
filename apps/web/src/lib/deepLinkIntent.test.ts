import { beforeEach, describe, expect, it, vi } from 'vitest';
import { savePendingDeepLink, takePendingDeepLink, withDeepLinkNonce } from './deepLinkIntent';

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe('deep link pendente do push', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', fakeStorage());
  });
  it('salva e consome uma única vez', () => {
    savePendingDeepLink('/home?modal=medication&petId=p1', 1000);
    expect(takePendingDeepLink(300000, 2000)).toBe('/home?modal=medication&petId=p1');
    expect(takePendingDeepLink(300000, 2000)).toBeNull();
  });
  it('ignora destino vencido (mais de 5 min)', () => {
    savePendingDeepLink('/home?modal=medication&petId=p1', 1000);
    expect(takePendingDeepLink(300000, 1000 + 300001)).toBeNull();
  });
  it('sem nada guardado devolve null', () => {
    expect(takePendingDeepLink()).toBeNull();
  });
});

describe('withDeepLinkNonce', () => {
  it('mantém os parâmetros e acrescenta um id único por entrega', () => {
    const a = withDeepLinkNonce('/home?modal=medication&petId=p1', 1);
    const b = withDeepLinkNonce('/home?modal=medication&petId=p1', 2);
    expect(a).toBe('/home?modal=medication&petId=p1&_dl=1');
    expect(a).not.toBe(b);
  });
  it('funciona sem query', () => {
    expect(withDeepLinkNonce('/home', 5)).toBe('/home?_dl=5');
  });
});

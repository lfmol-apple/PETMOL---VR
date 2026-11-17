import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/features/notifications/nativePushService', () => ({ initNativePushDeepLink: vi.fn(), setNativeDeepLinkNavigator: vi.fn() }));
const m = vi.hoisted(() => ({ hasPendingProduct: vi.fn().mockReturnValue(false), openPendingProduct: vi.fn().mockResolvedValue(true) }));
vi.mock('@/features/commerce/pushProductLink', () => m);

import { NativePushBridge } from './NativePushBridge';

describe('REGRA DE OURO: campanha de produto nunca mostra a Home do PETMOL', () => {
  beforeEach(() => { vi.useFakeTimers(); m.hasPendingProduct.mockReturnValue(false); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('cobre a tela com "Abrindo o produto…" enquanto a loja abre e some logo depois', async () => {
    render(<NativePushBridge />);
    expect(screen.queryByTestId('abrindo-produto')).toBeNull();
    act(() => { window.dispatchEvent(new Event('petmol:product-opening')); });
    expect(screen.getByTestId('abrindo-produto').textContent).toContain('Abrindo o produto');
    act(() => { window.dispatchEvent(new Event('petmol:product-opened')); });
    expect(screen.getByTestId('abrindo-produto')).toBeTruthy();       // ainda cobre um instante, enquanto a loja sobe por cima
    act(() => { vi.advanceTimersByTime(1300); });
    expect(screen.queryByTestId('abrindo-produto')).toBeNull();
  });

  it('já cobre ao abrir o app se há produto pendente, e nunca prende a tela (trava de 10 s)', async () => {
    m.hasPendingProduct.mockReturnValue(true);
    render(<NativePushBridge />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId('abrindo-produto')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(10_100); });
    expect(screen.queryByTestId('abrindo-produto')).toBeNull();
  });
});

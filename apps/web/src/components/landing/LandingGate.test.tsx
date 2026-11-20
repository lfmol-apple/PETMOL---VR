import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const replace = vi.fn();
const track = vi.fn();
const mocks = vi.hoisted(() => ({ token: null as string | null, native: false }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => mocks.token }));
vi.mock('@/lib/nativeApp', () => ({ isNativeAppClient: () => mocks.native }));
vi.mock('@/lib/landingEvents', () => ({ trackLandingEvent: (...a: unknown[]) => track(...a) }));
vi.mock('@/components/AppBootSplash', () => ({ AppBootSplash: () => <div data-testid="splash" /> }));

import { LandingGate } from './LandingGate';

beforeEach(() => { mocks.token = null; mocks.native = false; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('LandingGate', () => {
  it('visitante: não redireciona, não cobre a página e registra landing_view uma vez', () => {
    render(<LandingGate />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId('splash')).toBeNull();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0][0]).toBe('landing_view');
  });

  it('logado: vai para /home, mostra a abertura e NÃO conta visita da landing', () => {
    mocks.token = 'jwt';
    render(<LandingGate />);
    expect(replace).toHaveBeenCalledWith('/home');
    expect(screen.getByTestId('splash')).toBeTruthy();
    expect(track).not.toHaveBeenCalled();
  });

  it('app nativo: vai para /home mesmo sem token', () => {
    mocks.native = true;
    render(<LandingGate />);
    expect(replace).toHaveBeenCalledWith('/home');
    expect(track).not.toHaveBeenCalled();
  });

  it('o script inicial usa as mesmas chaves de sessão do app e só esconde a landing', () => {
    const { container } = render(<LandingGate />);
    const js = container.querySelector('script')?.innerHTML ?? '';
    expect(js).toContain('petmol_token');
    expect(js).toContain('petmol_auth');
    expect(js).toContain('PetmolApp');
    expect(container.querySelector('style')?.innerHTML).toContain('visibility:hidden');
  });
});

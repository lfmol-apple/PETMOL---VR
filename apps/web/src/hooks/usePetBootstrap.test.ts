import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
// objeto ESTÁVEL entre renders (como o AuthContext real) — senão o efeito que depende de `tutor` reroda a cada render
const AUTH = vi.hoisted(() => ({ tutor: { email: 'a@b.c' }, token: 'tok', isLoading: false, isAuthenticated: true }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

import { usePetBootstrap } from './usePetBootstrap';
import { invalidateMe } from '@/lib/fetchMe';
import { invalidatePets } from '@/lib/fetchPets';

const PET = { id: 'pet-1', name: 'Rex', species: 'dog', user_id: 'u1' };
let calls: Array<{ url: string; at: number }>;
let release: Record<string, () => void>;

beforeEach(() => {
  invalidateMe(); invalidatePets();
  calls = []; release = {};
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const u = String(url);
    calls.push({ url: u, at: calls.length });
    // /auth/me e /pets só respondem quando o teste manda: prova quem sai antes de quem
    return new Promise<Response>((resolve) => {
      const key = u.endsWith('/auth/me') ? 'me' : u.endsWith('/pets') ? 'pets' : 'other';
      release[key] = () => resolve(new Response(JSON.stringify(key === 'me' ? { id: 'u1', name: 'Tutor' } : key === 'pets' ? [PET] : {}), { status: 200 }));
      if (key === 'other') release[key]();
    });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('usePetBootstrap — /auth/me e /pets em paralelo, sem pedir a lista duas vezes', () => {
  it('/pets sai SEM esperar /auth/me responder', async () => {
    renderHook(() => usePetBootstrap());
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/pets'))).toBe(true));
    // /auth/me ainda não respondeu (nunca chamamos release.me) e mesmo assim /pets já foi pedido
    expect(calls.some((c) => c.url.endsWith('/auth/me'))).toBe(true);
  });

  it('a lista de pets é pedida UMA vez só (os dois pontos do boot dividem a resposta)', async () => {
    const { result } = renderHook(() => usePetBootstrap());
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/pets'))).toBe(true));
    release.me?.(); release.pets?.();
    await waitFor(() => expect(result.current.pets.length).toBe(1));
    expect(calls.filter((c) => c.url.endsWith('/pets'))).toHaveLength(1);
    expect(calls.filter((c) => c.url.endsWith('/auth/me'))).toHaveLength(1);
    expect(result.current.isChecking).toBe(false);
  });

  it('se /auth/me falhar, a lista de pets carrega do mesmo jeito', async () => {
    const { result } = renderHook(() => usePetBootstrap());
    await waitFor(() => expect(release.pets).toBeTypeOf('function'));
    release.pets();                          // só /pets responde; /auth/me continua pendente
    await waitFor(() => expect(result.current.pets.length).toBe(0)).catch(() => {});
    release.me?.();
    await waitFor(() => expect(result.current.pets.length).toBe(1));
  });
});

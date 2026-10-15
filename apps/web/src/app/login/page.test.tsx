import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ value: true }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), isAuthenticated: false, isLoading: false }),
}));
vi.mock('@/lib/nativeApp', () => ({ isNativeAppClient: () => native.value }));
vi.mock('@/components/auth/SocialLoginButtons', () => ({ SocialLoginButtons: () => null }));

import LoginPage from './page';

function openAt(search: string) {
  window.history.replaceState({}, '', `/login${search}`);
  return render(<LoginPage />);
}

describe('/login — primeira abertura do app', () => {
  beforeEach(() => {
    native.value = true;
    window.localStorage.clear();
  });

  it('aparelho novo no app: mostra "Criar minha conta" antes do formulário', async () => {
    openAt('?redirect=%2Fhome');
    await waitFor(() => expect(screen.getByText('Criar minha conta')).toBeTruthy());
    expect(screen.queryByText('Bem-vindo de volta')).toBeNull();
  });

  it('entrada real do app (raiz → /login?redirect=/home?native_start=1): também mostra a escolha', async () => {
    openAt('?redirect=%2Fhome%3Fnative_start%3D1');
    await waitFor(() => expect(screen.getByText('Criar minha conta')).toBeTruthy());
    expect(screen.getByText('Grátis. Sem anúncios.')).toBeTruthy();
  });

  it('redirect para outra tela (link/deep link) não interpõe a escolha', async () => {
    openAt('?redirect=%2Fprofile');
    await waitFor(() => expect(screen.getByText('Bem-vindo de volta')).toBeTruthy());
  });

  it('aparelho que já passou pela entrada: vai direto ao formulário de login', async () => {
    window.localStorage.setItem('petmol_login_seen', '1');
    openAt('');
    await waitFor(() => expect(screen.getByText('Bem-vindo de volta')).toBeTruthy());
    expect(screen.queryByText('Criar minha conta')).toBeNull();
  });

  it('link de convite/recuperação (e-mail na URL): não interpõe a escolha', async () => {
    openAt('?email=a%40b.com');
    await waitFor(() => expect(screen.getByText('Bem-vindo de volta')).toBeTruthy());
  });

  it('na web (fora do app): mantém o login de sempre', async () => {
    native.value = false;
    openAt('');
    await waitFor(() => expect(screen.getByText('Bem-vindo de volta')).toBeTruthy());
  });
});

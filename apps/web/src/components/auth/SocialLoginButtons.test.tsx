import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';

// Os client_id são lidos em escopo de módulo (`process.env...` no topo do
// arquivo) — pra cada teste poder ligar/desligar Google/Apple de forma
// isolada, reimportamos o componente a cada vez (vi.resetModules +
// import dinâmico) depois de ajustar as envs com vi.stubEnv.
// Simula o script já carregado assim que o componente monta — não há rede
// de verdade em teste. onLoad roda num efeito (não durante o render) pra
// não disparar o aviso do React de setState-durante-render. Precisa de
// nome em PascalCase pro eslint (react-hooks/rules-of-hooks) reconhecer
// como componente e aceitar o useEffect lá dentro.
function MockNextScript(props: { onLoad?: () => void }) {
  useEffect(() => { props.onLoad?.(); }, [props]);
  return null;
}
vi.mock('next/script', () => ({ default: MockNextScript }));

const mockIsNativeAppClient = vi.fn(() => false);
vi.mock('@/lib/nativeApp', () => ({ isNativeAppClient: () => mockIsNativeAppClient() }));

const mockLoginWithSocial = vi.fn(async () => {});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ loginWithSocial: mockLoginWithSocial }) }));

async function renderFresh() {
  vi.resetModules();
  const { SocialLoginButtons } = await import('./SocialLoginButtons');
  const onSuccess = vi.fn();
  const onError = vi.fn();
  render(<SocialLoginButtons onSuccess={onSuccess} onError={onError} />);
  return { onSuccess, onError };
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  mockIsNativeAppClient.mockReturnValue(false);
  mockLoginWithSocial.mockClear();
});

describe('SocialLoginButtons', () => {
  it('não renderiza nada sem nenhum client_id configurado', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_APPLE_SERVICES_ID', '');
    await renderFresh();
    expect(screen.queryByText('Continuar com a Apple')).toBeNull();
    expect(screen.queryByText('ou')).toBeNull();
  });

  it('não renderiza nada dentro do app nativo, mesmo com client_id configurado', async () => {
    mockIsNativeAppClient.mockReturnValue(true);
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'google-id');
    vi.stubEnv('NEXT_PUBLIC_APPLE_SERVICES_ID', 'apple-id');
    await renderFresh();
    expect(screen.queryByText('Continuar com a Apple')).toBeNull();
  });

  it('mostra só o botão da Apple quando só o Apple está configurado', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_APPLE_SERVICES_ID', 'apple-id');
    await renderFresh();
    expect(screen.getByText('Continuar com a Apple')).toBeTruthy();
  });

  it('mostra o aviso de Termos/Privacidade junto dos botões', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_APPLE_SERVICES_ID', 'apple-id');
    await renderFresh();
    expect(screen.getByText('Termos')).toBeTruthy();
    expect(screen.getByText('Política de Privacidade')).toBeTruthy();
  });

  it('clicar em "Continuar com a Apple" chama AppleID.auth.signIn, loginWithSocial e onSuccess', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_APPLE_SERVICES_ID', 'apple-id');
    const signIn = vi.fn(async () => ({
      authorization: { id_token: 'apple-id-token' },
      user: { name: { firstName: 'Tutor', lastName: 'Teste' } },
    }));
    (window as unknown as { AppleID: unknown }).AppleID = { auth: { init: vi.fn(), signIn } };

    const { onSuccess } = await renderFresh();
    await act(async () => {
      fireEvent.click(screen.getByText('Continuar com a Apple'));
    });

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(mockLoginWithSocial).toHaveBeenCalledWith('apple', 'apple-id-token', 'Tutor Teste');
    expect(onSuccess).toHaveBeenCalledTimes(1);

    delete (window as unknown as { AppleID?: unknown }).AppleID;
  });

  it('cancelar o popup da Apple (popup_closed) não dispara onError', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_APPLE_SERVICES_ID', 'apple-id');
    const signIn = vi.fn(async () => { throw new Error('popup_closed_by_user'); });
    (window as unknown as { AppleID: unknown }).AppleID = { auth: { init: vi.fn(), signIn } };

    const { onError } = await renderFresh();
    await act(async () => {
      fireEvent.click(screen.getByText('Continuar com a Apple'));
    });

    expect(onError).not.toHaveBeenCalled();
    delete (window as unknown as { AppleID?: unknown }).AppleID;
  });
});

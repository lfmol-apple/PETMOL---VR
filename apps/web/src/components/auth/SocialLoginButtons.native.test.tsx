import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const loginWithSocial = vi.fn();
const platform = { current: 'ios' };
const pluginAvailable = { current: true };
const initialize = vi.fn(async () => undefined);
const login = vi.fn();

vi.mock('next/script', () => ({ default: () => null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ loginWithSocial }) }));
vi.mock('@/lib/nativeApp', () => ({ isNativeAppClient: () => true }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    isPluginAvailable: () => pluginAvailable.current,
    getPlatform: () => platform.current,
  },
}));
vi.mock('@capgo/capacitor-social-login', () => ({ SocialLogin: { initialize, login } }));

async function mount(onSuccess = vi.fn(), onError = vi.fn()) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'web-client.apps.googleusercontent.com');
  vi.stubEnv('NEXT_PUBLIC_APPLE_SERVICES_ID', 'br.com.petmol.web');
  const { SocialLoginButtons } = await import('./SocialLoginButtons');
  render(<SocialLoginButtons onSuccess={onSuccess} onError={onError} />);
  return { onSuccess, onError };
}

beforeEach(() => { platform.current = 'ios'; pluginAvailable.current = true; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); loginWithSocial.mockReset(); initialize.mockClear(); login.mockReset(); });

describe('SocialLoginButtons — dentro do app nativo', () => {
  it('iPhone: mostra Google e Apple', async () => {
    await mount();
    expect(await screen.findByText('Continuar com o Google')).toBeTruthy();
    expect(screen.getByText('Continuar com a Apple')).toBeTruthy();
  });

  it('Android: só Google (a Apple só é exigida no iOS)', async () => {
    platform.current = 'android';
    await mount();
    expect(await screen.findByText('Continuar com o Google')).toBeTruthy();
    expect(screen.queryByText('Continuar com a Apple')).toBeNull();
  });

  it('app antigo sem o plugin: nenhum botão (não quebra)', async () => {
    pluginAvailable.current = false;
    await mount();
    await new Promise((r) => setTimeout(r, 30));
    expect(document.body.textContent).not.toContain('Continuar com');
  });

  it('Google: inicializa com os IDs web+iOS, envia o id_token e entra', async () => {
    login.mockResolvedValue({ provider: 'google', result: { idToken: 'GOOGLE-ID-TOKEN', profile: { givenName: 'Ana', familyName: 'Souza' } } });
    const { onSuccess } = await mount();
    fireEvent.click(await screen.findByText('Continuar com o Google'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
      google: expect.objectContaining({
        webClientId: 'web-client.apps.googleusercontent.com',
        iOSServerClientId: 'web-client.apps.googleusercontent.com',
        iOSClientId: expect.stringContaining('605810387105-ael6'),
      }),
    }));
    expect(loginWithSocial).toHaveBeenCalledWith('google', 'GOOGLE-ID-TOKEN', 'Ana Souza');
  });

  it('Apple: manda o id_token e o nome do 1º login', async () => {
    login.mockResolvedValue({ provider: 'apple', result: { idToken: 'APPLE-ID-TOKEN', profile: { givenName: 'Bia', familyName: 'Lima' } } });
    const { onSuccess } = await mount();
    fireEvent.click(await screen.findByText('Continuar com a Apple'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(loginWithSocial).toHaveBeenCalledWith('apple', 'APPLE-ID-TOKEN', 'Bia Lima');
  });

  it('cancelar a janela do sistema não mostra erro', async () => {
    login.mockRejectedValue(new Error('User cancelled the sign in'));
    const { onError, onSuccess } = await mount();
    fireEvent.click(await screen.findByText('Continuar com o Google'));
    await waitFor(() => expect(login).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(loginWithSocial).not.toHaveBeenCalled();
  });

  it('erro real do servidor aparece para o tutor', async () => {
    login.mockResolvedValue({ provider: 'google', result: { idToken: 'X' } });
    loginWithSocial.mockRejectedValue(new Error('Já existe uma conta com este e-mail. Entre com e-mail e senha.'));
    const { onError } = await mount();
    fireEvent.click(await screen.findByText('Continuar com o Google'));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Já existe uma conta com este e-mail. Entre com e-mail e senha.'));
  });

  it('sem id_token do provedor: erro claro, nada é enviado', async () => {
    login.mockResolvedValue({ provider: 'google', result: { idToken: null } });
    const { onError } = await mount();
    fireEvent.click(await screen.findByText('Continuar com o Google'));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(loginWithSocial).not.toHaveBeenCalled();
  });
});

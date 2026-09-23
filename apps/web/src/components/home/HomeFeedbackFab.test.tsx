import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/v1Metrics', () => ({ trackV1Metric: vi.fn() }));

import { HomeFeedbackFab, SUPPORT_WHATSAPP_URL } from './HomeFeedbackFab';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openSheet = () => fireEvent.click(screen.getByRole('button', { name: /Contar uma ideia ou um problema/ }));

describe('HomeFeedbackFab', () => {
  it('mostra só o botão flutuante até a pessoa tocar', () => {
    render(<HomeFeedbackFab />);
    expect(screen.getByText('Sua opinião')).toBeTruthy();
    expect(screen.queryByText('Sua opinião importa')).toBeNull();
  });

  it('abre a folha acolhedora e envia a mensagem pelo mesmo endpoint do perfil', async () => {
    render(<HomeFeedbackFab />);
    openSheet();
    expect(screen.getByText('Sua opinião importa')).toBeTruthy();
    fireEvent.click(screen.getByText('Algo não funcionou como eu esperava'));
    fireEvent.change(screen.getByPlaceholderText(/Conte do seu jeito/), { target: { value: 'A foto não carregou' } });
    fireEvent.click(screen.getByText('Enviar'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/support\/feedback$/);
    expect(JSON.parse(init.body)).toMatchObject({ category: 'bug', message: 'A foto não carregou', platform: 'web' });
    expect(init.headers.Authorization).toBe('Bearer tok');
    await screen.findByText(/Recebemos, obrigado/);
  });

  it('não envia sem categoria nem mensagem', () => {
    render(<HomeFeedbackFab />);
    openSheet();
    expect(screen.queryByText('Enviar')).toBeNull();          // só aparece depois de escolher o assunto
    fireEvent.click(screen.getByText('Tenho uma dúvida'));
    expect((screen.getByText('Enviar') as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falha de envio avisa com gentileza e aponta o WhatsApp', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    render(<HomeFeedbackFab />);
    openSheet();
    fireEvent.click(screen.getByText('Tenho uma ideia ou sugestão'));
    fireEvent.change(screen.getByPlaceholderText(/Conte do seu jeito/), { target: { value: 'Ideia' } });
    fireEvent.click(screen.getByText('Enviar'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Não conseguimos enviar agora/);
  });

  it('WhatsApp direto aponta para o número (31) 97152-7644', () => {
    render(<HomeFeedbackFab />);
    openSheet();
    const link = screen.getByText(/Prefere conversar/) as HTMLAnchorElement;
    expect(link.href).toBe(SUPPORT_WHATSAPP_URL);
    expect(link.href.startsWith('https://wa.me/5531971527644?text=')).toBe(true);
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import GoInstalarPage from './page';

let searchString = '';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchString),
}));

const fetchMock = vi.fn();

function setUA(ua: string, maxTouchPoints = 0, platform = '') {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true });
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const IPHONE_INSTAGRAM_UA = `${IPHONE_UA} Instagram 302.0.0.23.114`;
const ANDROID_INSTAGRAM_UA = `${ANDROID_UA} Instagram 302.0.0.23.114`;

beforeEach(() => {
  searchString = '';
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('/go/instalar — encaminhamento direto pra loja, sem 2ª propaganda', () => {
  it('iPhone: encaminha sozinho pra App Store, na mesma aba (nunca aba nova)', async () => {
    setUA(IPHONE_UA);
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, replace }, writable: true });
    render(<GoInstalarPage />);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toContain('apps.apple.com');
    const link = screen.getByRole('link', { name: 'Baixar na App Store' });
    expect(link.getAttribute('target')).toBeNull(); // nunca target="_blank" aqui
    expect(link.getAttribute('href')).toContain('apps.apple.com');
  });

  it('Android: encaminha sozinho pro Google Play, na mesma aba', async () => {
    setUA(ANDROID_UA);
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, replace }, writable: true });
    render(<GoInstalarPage />);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toContain('play.google.com');
    expect(screen.getByRole('link', { name: 'Disponível no Google Play' }).getAttribute('target')).toBeNull();
  });

  it('Instagram no iPhone: mesmo comportamento do Safari — encaminha sozinho pra App Store', async () => {
    setUA(IPHONE_INSTAGRAM_UA);
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, replace }, writable: true });
    render(<GoInstalarPage />);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(replace.mock.calls[0][0]).toContain('apps.apple.com');
  });

  it('Instagram no Android: mesmo comportamento do Chrome — encaminha sozinho pro Google Play', async () => {
    setUA(ANDROID_INSTAGRAM_UA);
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, replace }, writable: true });
    render(<GoInstalarPage />);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(replace.mock.calls[0][0]).toContain('play.google.com');
  });

  it('Desktop: NUNCA encaminha sozinho — mostra os dois selos pra escolher', async () => {
    setUA(DESKTOP_UA);
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, replace }, writable: true });
    render(<GoInstalarPage />);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Baixar na App Store/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Disponível no Google Play/ })).toBeTruthy();
  });

  it('plataforma não identificada (UA vazio): mesmo tratamento do desktop — não encaminha sozinho', async () => {
    setUA('');
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, replace }, writable: true });
    render(<GoInstalarPage />);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Baixar na App Store/ })).toBeTruthy();
  });

  it('preserva as UTMs da campanha nos dois links da loja', async () => {
    setUA(DESKTOP_UA);
    searchString = 'utm_source=instagram&utm_campaign=abc123';
    render(<GoInstalarPage />);
    const apple = screen.getByRole('link', { name: /Baixar na App Store/ }).getAttribute('href') || '';
    const google = screen.getByRole('link', { name: /Disponível no Google Play/ }).getAttribute('href') || '';
    expect(google).toContain('utm_source%3Dinstagram');
    expect(apple + google).toContain('abc123');
  });

  it('sem vídeo, sem telefone, sem "grátis" no argumento principal — só marca e o caminho até a loja', () => {
    setUA(IPHONE_UA);
    render(<GoInstalarPage />);
    expect(document.querySelector('video')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Petmol')).toBeTruthy();
  });

  it('registra o clique/visualização (mensuração), sem travar a navegação', async () => {
    setUA(IPHONE_UA);
    render(<GoInstalarPage />);
    await act(async () => { vi.advanceTimersByTime(50); });
    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.event_name).toBe('landing_download_click');
  });
});

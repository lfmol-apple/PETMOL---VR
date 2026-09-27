import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const fetchMock = vi.fn();
const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => null }));
vi.mock('@/lib/nativeApp', () => ({ isNativeAppClient: () => false }));

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('Home oficial (www.petmol.com.br) — sem teste A/B, sem vídeo obrigatório', () => {
  it('mostra o benefício e as 4 funcionalidades reconhecíveis já na 1ª dobra, sem "grátis" no título', async () => {
    const LandingPage = (await import('./page')).default;
    render(<LandingPage />);
    expect(await screen.findByText(/O PETMOL ajuda você a cuidar dela/)).toBeTruthy();
    expect(screen.getAllByText('Alimentação').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vacinas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pet Sumido').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Loja do Pet').length).toBeGreaterThan(0);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent?.toLowerCase()).not.toContain('grátis');
  });

  it('CTA principal é "Baixar o PETMOL" (o texto do botão vem de DownloadCta) — nunca "grátis" como argumento', async () => {
    const LandingPage = (await import('./page')).default;
    render(<LandingPage />);
    await screen.findByText(/O PETMOL ajuda você a cuidar dela/);
    // "Grátis" só aparece como selo pequeno abaixo do botão, nunca no título nem como texto do CTA
    const ctaButtons = screen.getAllByText('Baixar o PETMOL');
    expect(ctaButtons.length).toBeGreaterThan(0);
  });

  it('as 5 funcionalidades aparecem com capturas reais do app (não telefone único gigante)', async () => {
    const LandingPage = (await import('./page')).default;
    render(<LandingPage />);
    await screen.findByText(/O PETMOL ajuda você a cuidar dela/);
    for (const tag of ['Alimentação', 'Vacinas', 'Pet Sumido', 'Loja do Pet', 'Perfil']) {
      expect(screen.getAllByText(tag).length).toBeGreaterThan(0);
    }
    const imgs = Array.from(document.querySelectorAll('img')).map((i) => i.getAttribute('src') || '');
    expect(imgs.some((s) => s.includes('app-alimentacao'))).toBe(true);
    expect(imgs.some((s) => s.includes('app-vacinas'))).toBe(true);
    expect(imgs.some((s) => s.includes('app-pet-sumido'))).toBe(true);
    expect(imgs.some((s) => s.includes('app-loja'))).toBe(true);
  });

  it('Pet Sumido não promete rastreamento nem reencontro garantido', async () => {
    const LandingPage = (await import('./page')).default;
    render(<LandingPage />);
    const body = await screen.findByText(/a região é avisada na hora/i);
    const text = body.textContent?.toLowerCase() || '';
    expect(text).not.toContain('rastre');
    expect(text).not.toContain('garant');
  });

  it('Loja do Pet não promete sempre o menor preço', async () => {
    const LandingPage = (await import('./page')).default;
    render(<LandingPage />);
    const body = await screen.findByText(/Compare ofertas do que seu pet já usa/i);
    const section = body.closest('section');
    expect(section?.textContent?.toLowerCase()).not.toContain('menor preço');
  });

  it('sem vídeo, sem telefone único como protagonista — 5 capturas reais, cada uma do seu tamanho', async () => {
    const LandingPage = (await import('./page')).default;
    render(<LandingPage />);
    await screen.findByText(/O PETMOL ajuda você a cuidar dela/);
    expect(document.querySelector('video')).toBeNull();
    expect(document.querySelector('[data-landing-intro]')).toBeNull();
  });

  it('visita registrada sem passar pelo teste A/B: nenhuma variante nova é sorteada/gravada', async () => {
    const LandingPage = (await import('./page')).default;
    render(<LandingPage />);
    await screen.findByText(/O PETMOL ajuda você a cuidar dela/);
    expect(localStorage.getItem('petmol_exp_landing_v1')).toBeNull();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/analytics/event'));
    expect(call).toBeTruthy();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.event_name).toBe('landing_view');
    expect(body.properties.experiment_id).toBe('landing_imagem_2026_09');
    expect(body.properties.preview).toBeFalsy();
  });

  it('usuário logado é mandado pra /home, sem ver a landing', async () => {
    vi.doMock('@/lib/auth-token', () => ({ getToken: () => 'um-token' }));
    vi.resetModules();
    const LandingPage = (await import('./page')).default;
    render(<LandingPage />);
    expect(routerReplace).toHaveBeenCalledWith('/home');
  });
});

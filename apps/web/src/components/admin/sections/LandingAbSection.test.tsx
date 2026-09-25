import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

import { LandingAbSection } from './LandingAbSection';

const counts = (o: Record<string, number>) => ({
  views: 0, visitors: 0, clicks: 0, clickers: 0, conversion: null, apple_clicks: 0, google_clicks: 0, apple_clickers: 0, google_clickers: 0, ...o,
});
const variant = (o: Record<string, number>, extra = {}) => ({ ...counts(o), by_campaign: [], by_device: [], daily: [], signups_attributed: 0, ...extra });
const payload = (over = {}) => ({
  experiment_id: 'landing_headline_2026_09', period: { since: null, until: null },
  filters: { campaign: null, source: null, os: null, instagram_only: false },
  options: { campaigns: ['set26'], sources: ['instagram'], os: ['ios'] },
  variants: {
    A: variant({ views: 60, visitors: 50, clicks: 6, clickers: 5, conversion: 0.1, apple_clicks: 4, google_clicks: 2 }),
    B: variant({ views: 58, visitors: 48, clicks: 12, clickers: 10, conversion: 0.2083, apple_clicks: 8, google_clicks: 4 }),
  },
  verdict: { status: 'insufficient', leader: null, p_value: 0.2, min_sample: 100 },
  quality: { cross_variant_visitors: 0, note: '' },
  installs: { total: 7, by_campaign: [{ name: 'set26', installs: 7 }], attributable_to_variant: false, reason: 'O app instalado tem armazenamento próprio.' },
  signups_note: 'Cadastros atribuídos = mesmo navegador.',
  ...over,
});
let urls: string[];
beforeEach(() => {
  urls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(String(url)); return { ok: true, json: async () => payload() } as Response; }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Aquisição e Conversão — Landing A/B', () => {
  it('mostra as duas versões lado a lado com conversão, visitantes, cliques e lojas', async () => {
    render(<LandingAbSection filter={{ period_days: 7 }} />);
    expect((await screen.findAllByText('Versão A')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Versão B').length).toBeGreaterThan(0);
    expect(screen.getByText('10,0%')).toBeTruthy();           // conversão A
    expect(screen.getByText('20,8%')).toBeTruthy();           // conversão B
    expect(screen.getByText('5 de 50 visitantes clicaram')).toBeTruthy();
    expect(screen.getByText('4 · 2')).toBeTruthy();           // lojas A (App Store · Play)
    expect(screen.getByText(/Ainda sem veredito/)).toBeTruthy();
  });

  it('instalações aparecem à parte e explicitamente NÃO atribuídas à versão', async () => {
    render(<LandingAbSection filter={{}} />);
    expect(await screen.findByText('Instalações do app — não atribuíveis à versão')).toBeTruthy();
    expect(screen.getByText(/armazenamento próprio/)).toBeTruthy();
  });

  it('filtro "Só Instagram" e o período global vão na consulta ao servidor', async () => {
    render(<LandingAbSection filter={{ period_days: 30 }} />);
    await screen.findAllByText('Versão A');
    expect(urls[0]).toContain('period_days=30');
    fireEvent.click(screen.getByText(/Só Instagram/));
    await waitFor(() => expect(urls.some((u) => u.includes('instagram=true'))).toBe(true));
  });

  it('sem dados: mostra zeros e "—", nunca números inventados', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload({ variants: { A: variant({}), B: variant({}) } }) } as Response)));
    render(<LandingAbSection filter={{}} />);
    await screen.findAllByText('Versão A');
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Sem eventos no período.').length).toBe(2);
  });
});

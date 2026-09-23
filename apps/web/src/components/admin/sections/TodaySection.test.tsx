import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { BriefResponse } from '@/lib/admin/analyticsApi';

const adminGet = vi.fn();
vi.mock('@/lib/admin/analyticsApi', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/analyticsApi')>()),
  adminGet: (...a: unknown[]) => adminGet(...a),
}));

import { TodaySection } from './TodaySection';

const metric = (value: number, prev: number, avg7: number, dPrev: number | null, dAvg: number | null) =>
  ({ label: 'x', value, prev, avg7, delta_prev_pct: dPrev, delta_avg7_pct: dAvg });

function brief(over: Partial<BriefResponse> = {}): BriefResponse {
  return {
    day: '2026-09-23', label: '23/09/2026', is_today: true,
    metrics: {
      downloads: metric(3, 10, 8.5, -70, -64.7), acessos: metric(40, 100, 90, -60, -55.6),
      visitantes: metric(30, 80, 70, null, null), cadastros: metric(2, 4, 3, -50, -33.3),
      pets_novos: metric(1, 3, 2, null, null), ativos: metric(9, 12, 11, -25, -18.2),
      loja_aberturas: metric(5, 0, 0, null, null), loja_cliques: metric(1, 0, 0, null, null),
      sumido_novos: metric(0, 0, 0, null, null), sumido_encontrados: metric(0, 0, 0, null, null),
    },
    funnel: [{ label: 'Acessos', n: 40 }, { label: 'Downloads', n: 3 }],
    campaigns: [], has_campaign_attribution: false, cities: [],
    attention: [{ severity: 'attention', key: 'moderation', message: '2 foto(s) aguardando revisão humana (Moderação).' }],
    suggestion: null, note: 'nota',
    ...over,
  };
}

describe('TodaySection', () => {
  beforeEach(() => adminGet.mockReset());

  it('dia parcial (hoje) mostra referência crua — ontem/média 7d — e NUNCA uma "queda" em %', async () => {
    adminGet.mockResolvedValue(brief());
    render(<TodaySection />);
    await waitFor(() => expect(screen.getByText('Downloads')).toBeTruthy());
    expect(adminGet).toHaveBeenCalledWith('/today');
    expect(screen.getByText(/ontem 10 · média 7d 8,5/)).toBeTruthy();
    expect(screen.queryByText(/-70%/)).toBeNull();
  });

  it('dia fechado mostra a variação em % contra o dia anterior e a média 7d', async () => {
    adminGet.mockResolvedValueOnce(brief()).mockResolvedValue(brief({ is_today: false, label: '22/09/2026' }));
    render(<TodaySection />);
    await waitFor(() => expect(screen.getByText('Downloads')).toBeTruthy());
    fireEvent.click(screen.getByText('Ontem (fechado)'));
    await waitFor(() => expect(screen.getAllByText(/-70% vs dia anterior/).length).toBeGreaterThan(0));
    expect(adminGet).toHaveBeenLastCalledWith('/brief', { day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('"Precisa de você" aparece e o item de moderação é clicável', async () => {
    adminGet.mockResolvedValue(brief());
    const onOpenModeration = vi.fn();
    render(<TodaySection onOpenModeration={onOpenModeration} />);
    const item = await screen.findByText(/aguardando revisão humana/);
    fireEvent.click(item);
    expect(onOpenModeration).toHaveBeenCalled();
  });

  it('sem campanhas com UTM avisa que tudo caiu em direto/orgânico', async () => {
    adminGet.mockResolvedValue(brief({
      campaigns: [{ utm_source: '(direto/orgânico)', utm_medium: '—', utm_campaign: '(direto/orgânico)', downloads: 1, acessos: 4 }],
    }));
    render(<TodaySection />);
    expect(await screen.findByText(/Nenhum tráfego com UTM no dia/)).toBeTruthy();
  });
});

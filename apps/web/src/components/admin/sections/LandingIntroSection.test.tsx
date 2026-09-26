import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
import { LandingIntroSection } from './LandingIntroSection';

const dl = (o = {}) => ({ clicks: 0, clickers: 0, apple: 0, google: 0, auto: 0, ...o });
const payload = (over = {}) => ({
  period: { since: null, until: null }, filters: { campaign: null, source: null, os: null, instagram_only: false },
  by_commercial: [
    { id: 'pet-sumido', label: 'Operação Fuga (Pet Sumido)', poster_visitors: 25, watch_visitors: 20, start_visitors: 19, complete_visitors: 10, skip_visitors: 5, clickers: 4, watch_rate: 0.8, complete_rate: 0.5263, conversion: 0.16 },
    { id: 'racao', label: 'A última porção de ração', poster_visitors: 15, watch_visitors: 10, start_visitors: 9, complete_visitors: 4, skip_visitors: 5, clickers: 2, watch_rate: 0.6667, complete_rate: 0.4444, conversion: 0.1333 },
  ],
  funnel: { poster_visitors: 40, watch_visitors: 30, start_visitors: 28, complete_visitors: 14, skip_visitors: 10, watch_rate: 0.75, start_rate: 0.9333, complete_rate: 0.5, skip_rate: 0.25, started_with_sound: 27 },
  skips: { at_poster: 8, during_video: 2, median_watched_s: 6.2 },
  errors: { total: 1, visitors: 1, by_reason: [{ reason: 'play_rejected', count: 1 }] },
  downloads: { during_video: dl({ clicks: 5, clickers: 4, apple: 3, google: 2 }), after_video: dl({ clicks: 3, clickers: 3, apple: 2, google: 1 }), clickers_total: 6, conversion_of_poster_viewers: 0.15 },
  without_intro: { visitors: 100, clickers: 12, conversion: 0.12, note: 'Público diferente: não um teste controlado.' },
  daily: [{ date: '2026-09-26', poster: 40, watch: 30, complete: 14 }],
  installs_note: 'Clique em download não é instalação.',
  ...over,
});

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload() } as Response))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Comercial na entrada (mobile)', () => {
  it('mostra o funil, pulos, downloads durante/depois e a referência sem introdução', async () => {
    render(<LandingIntroSection filter={{ period_days: 7 }} />);
    expect(await screen.findByText('Viram o pôster')).toBeTruthy();
    expect(screen.getByText('75,0%')).toBeTruthy();                       // assistiram
    expect(screen.getByText('Durante o vídeo')).toBeTruthy();
    expect(screen.getByText('Depois (na landing)')).toBeTruthy();
    expect(screen.getByText('play_rejected:')).toBeTruthy();
    expect(screen.getByText(/não um teste controlado/)).toBeTruthy();
    expect(screen.getByText('Operação Fuga (Pet Sumido)')).toBeTruthy();
    expect(screen.getByText('A última porção de ração')).toBeTruthy();
    expect(screen.getByText(/não é instalação/)).toBeTruthy();
  });

  it('sem dados: zeros e traços, nada inventado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload({
      funnel: { poster_visitors: 0, watch_visitors: 0, start_visitors: 0, complete_visitors: 0, skip_visitors: 0, watch_rate: null, start_rate: null, complete_rate: null, skip_rate: null, started_with_sound: 0 },
      by_commercial: [], errors: { total: 0, visitors: 0, by_reason: [] }, daily: [], without_intro: { visitors: 0, clickers: 0, conversion: null, note: 'x' },
      downloads: { during_video: dl(), after_video: dl(), clickers_total: 0, conversion_of_poster_viewers: null },
    }) } as Response)));
    render(<LandingIntroSection filter={{}} />);
    expect(await screen.findByText('Viram o pôster')).toBeTruthy();
    expect(screen.getByText('Nenhuma falha registrada no período.')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });
});

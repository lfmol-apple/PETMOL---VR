import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ adminApi: vi.fn() }));
vi.mock('@/components/admin/AdminUi', async (orig) => ({ ...(await orig<object>()), adminApi: api.adminApi }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => 't' }));

import { BuscasTab, type SearchItem, type SearchReport } from './BuscasTab';

const item = (o: Partial<SearchItem>): SearchItem => ({
  kind: 'term', label: 'golden adulto', key: 'golden adulto', searches: 5, zero_results: 0, zero_pct: 0, matched_products: 3,
  no_result: false, no_commissionable_link: false, ml_gap: true, commission: { cobasi: true, mercadolivre: false, amazon: null }, ...o,
});
const report = (o: Partial<SearchReport> = {}): SearchReport => {
  const a = item({});
  const b = item({ label: 'scalibor', key: 'scalibor', searches: 4, zero_results: 4, zero_pct: 100, no_result: true, commission: { cobasi: false, mercadolivre: false, amazon: null } });
  return {
    days: 30, min_searches: 3, total_searches: 40, unrecognized_searches: 7, rejected_total: 2, collecting: true,
    rejected_searches: [{ reason: 'contact', label: 'e-mail, endereço de internet ou site', searches: 2 }],
    no_result: [b], no_commissionable_link: [], opportunities: [a, b], items: [a, b],
    retention: { daily_days: 90, monthly_months: 24, monthly_min_searches: 5 }, ...o,
  };
};

describe('aba Buscas', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());

  it('mostra oportunidades, separa sem resultado de sem link e não expõe texto rejeitado', async () => {
    api.adminApi.mockResolvedValue(report());
    render(<BuscasTab />);
    expect((await screen.findAllByText('golden adulto')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('scalibor').length).toBeGreaterThan(0);
    expect(screen.getByText('Buscas sem resultado')).toBeTruthy();
    expect(screen.getByText('Com resultado, sem link comissionável')).toBeTruthy();
    expect(screen.getByText(/Coleta ligada/)).toBeTruthy();
    expect(screen.getByText(/e-mail, endereço de internet ou site \(2\)/)).toBeTruthy();
  });

  it('avisa quando a coleta está desligada e troca o período', async () => {
    api.adminApi.mockResolvedValue(report({ collecting: false, total_searches: 0, items: [], opportunities: [], no_result: [] }));
    render(<BuscasTab />);
    expect(await screen.findByText(/Coleta desligada/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '7 dias' }));
    await waitFor(() => expect(api.adminApi.mock.calls.some(([p, i]) => p === '/search-demand/report' && i.params.days === 7)).toBe(true));
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const adminGet = vi.fn();
vi.mock('@/lib/admin/analyticsApi', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/analyticsApi')>()),
  adminGet: (...a: unknown[]) => adminGet(...a),
}));
vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('./sections', async (orig) => ({
  ...(await orig<typeof import('./sections')>()),
  GeoSection: () => <div>GEO-DECLARADO</div>,
}));

import { LocationsSection, parseBrlInput } from './LocationsSection';

const campaigns = {
  campaigns: [
    { utm_campaign: 'lancamento', utm_source: 'meta', utm_medium: 'cpc', downloads: 10, acessos: 40, visitantes_unicos: 30,
      cadastros: 5, gasto_brl: 200, custo_por_download: 20, custo_por_cadastro: 40, total: 50 },
    { utm_campaign: 'tiktok_teste', utm_source: '—', utm_medium: '—', downloads: 0, acessos: 0, visitantes_unicos: 0,
      cadastros: 0, gasto_brl: 50, custo_por_download: null, custo_por_cadastro: null, total: 0 },
  ],
  campaigns_total: 2, has_any_attribution: true,
  totals: { downloads: 10, cadastros: 5, gasto_brl: 250, custo_por_download: 25, custo_por_cadastro: 50 }, note: 'nota',
};

function route(path: string) {
  if (path === '/campaigns') return Promise.resolve(campaigns);
  if (path === '/campaign-spend') return Promise.resolve({ items: [] });
  if (path === '/location-events') return Promise.resolve({ total: 0, page: 1, page_size: 25, items: [], note: '' });
  if (path === '/locations') return Promise.resolve({
    downloads_today: 0, acessos_today: 0, downloads_campaign: 0, acessos_campaign: 0, total_campaign: 0,
    places: [], places_total: 0, mapped_places: 0, unmapped_places: 0, sort_by: 'downloads',
    window_label: 'w', custom_window: false, note: 'n',
  });
  return Promise.resolve({});
}

describe('parseBrlInput', () => {
  it('entende vírgula, ponto e milhar', () => {
    expect(parseBrlInput('150,50')).toBe(150.5);
    expect(parseBrlInput('150.50')).toBe(150.5);
    expect(parseBrlInput('1.500,50')).toBe(1500.5);
    expect(parseBrlInput('R$ 80')).toBe(80);
    expect(parseBrlInput('')).toBeNaN();
    expect(parseBrlInput('abc')).toBeNaN();
  });
});

describe('LocationsSection — visão de campanhas', () => {
  beforeEach(() => {
    adminGet.mockReset();
    adminGet.mockImplementation((path: string) => route(path));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'x' }) }));
  });

  it('abre em Campanha, com gasto, custo por download/cadastro, e gasto sem retorno visível', async () => {
    render(<LocationsSection filter={{}} />);
    expect(await screen.findByText('lancamento')).toBeTruthy();
    expect(screen.getByText('tiktok_teste')).toBeTruthy();          // gasto sem tráfego continua aparecendo
    expect(screen.getAllByText(/R\$\s*250,00/).length).toBeGreaterThan(0);
  });

  it('lançar gasto valida e posta campanha + valor em reais', async () => {
    render(<LocationsSection filter={{}} />);
    await screen.findByText('lancamento');

    fireEvent.click(screen.getByText('Lançar'));
    expect(await screen.findByText(/Informe a campanha/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Campanha \(utm_campaign\)/), { target: { value: 'lancamento' } });
    fireEvent.change(screen.getByLabelText(/Valor \(R\$\)/), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Lançar'));
    expect(await screen.findByText(/valor maior que zero/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Valor \(R\$\)/), { target: { value: '1.234,50' } });
    fireEvent.click(screen.getByText('Lançar'));
    await waitFor(() => expect(screen.getByText('Gasto lançado.')).toBeTruthy());

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/admin/analytics/campaign-spend');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ utm_campaign: 'lancamento', amount_brl: 1234.5 });
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('a aba "Cadastros (declarado)" mostra o antigo agregado por UF/cidade', async () => {
    render(<LocationsSection filter={{}} />);
    await screen.findByText('lancamento');
    fireEvent.click(screen.getByText('Cadastros (declarado)'));
    expect(screen.getByText('GEO-DECLARADO')).toBeTruthy();
  });

  it('clicar em Downloads/Acessos nos indicadores (sortBy muda) troca pra Estado/Cidade', async () => {
    const { rerender } = render(<LocationsSection filter={{}} sortBy="total" />);
    await screen.findByText('lancamento');
    rerender(<LocationsSection filter={{}} sortBy="downloads" />);
    await waitFor(() => expect(adminGet).toHaveBeenCalledWith('/locations', expect.objectContaining({ sort_by: 'downloads' })));
    expect(screen.queryByText('tiktok_teste')).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// productPricing é a fonte de dados — mockada por completo.
const searchAwinCatalog = vi.fn();
const fetchCommerceOffers = vi.fn();
const fetchPetzDirectLink = vi.fn();

vi.mock('./productPricing', () => ({
  searchAwinCatalog: (...a: unknown[]) => searchAwinCatalog(...a),
  fetchCommerceOffers: (...a: unknown[]) => fetchCommerceOffers(...a),
  fetchPetzDirectLink: (...a: unknown[]) => fetchPetzDirectLink(...a),
  formatBRLPrice: (n: number) => `R$ ${n.toFixed(2)}`,
  merchantLabel: (m: string) => m,
  offerPriceLabel: (o: { price?: number }) => (o.price ? `R$ ${o.price}` : '—'),
  offerOriginLabel: () => null,
  hasReliablePrice: () => true,
}));

vi.mock('@/components/ProductDetectionSheet', () => ({ ProductDetectionSheetGold: () => null }));
vi.mock('@/lib/analytics/click', () => ({ trackClick: vi.fn() }));
vi.mock('@/lib/productScanner', () => ({ identifyProductByBarcode: vi.fn() }));

import { AffiliateCatalogSearch } from './AffiliateCatalogSearch';

const RESULT = {
  gtin: '7897348203858',
  title: 'Ração Golden Fórmula Cães Adultos',
  brand: 'Golden',
  price: 22.5,
  list_price: null,
  image_url: null,
  merchant: 'cobasi',
  offer_count: 2,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('AffiliateCatalogSearch', () => {
  it('layout="fill": ao digitar, busca no catálogo e mostra o produto', async () => {
    searchAwinCatalog.mockResolvedValue([RESULT]);
    fetchCommerceOffers.mockResolvedValue([
      { merchant: 'cobasi', url: 'https://cobasi.com.br/p/x', price: 22.5, link_type: 'affiliate_deep_link', is_available: true },
      { merchant: 'shopee', url: 'https://s.shopee.com.br/x', price: 21.29, link_type: 'affiliate_marketplace_offer', is_available: true },
    ]);
    fetchPetzDirectLink.mockResolvedValue({ available: false, url: null });

    render(<AffiliateCatalogSearch petId="p1" layout="fill" />);

    const input = screen.getByPlaceholderText('Buscar produto...');
    fireEvent.change(input, { target: { value: 'racao golden' } });

    await waitFor(() => expect(searchAwinCatalog).toHaveBeenCalledWith('racao golden', undefined), { timeout: 2000 });
    await waitFor(() => expect(screen.getByText('Ração Golden Fórmula Cães Adultos')).toBeTruthy(), { timeout: 2000 });

    // Cobasi + Shopee aparecem direto no card, sem tocar em "🛒 Lojas".
    await waitFor(() => {
      expect(screen.getByText('Escolha a loja')).toBeTruthy();
      const links = screen.getAllByRole('link');
      const hrefs = links.map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('https://cobasi.com.br/p/x');
      expect(hrefs).toContain('https://s.shopee.com.br/x');
    }, { timeout: 2000 });
    expect(screen.queryByText('🛒 Lojas')).toBeNull();
  });

  it('layout="fill": mostra children até engajar a busca, depois volta ao limpar', async () => {
    searchAwinCatalog.mockResolvedValue([RESULT]);
    fetchCommerceOffers.mockResolvedValue([]);
    fetchPetzDirectLink.mockResolvedValue({ available: false, url: null });

    render(
      <AffiliateCatalogSearch petId="p1" layout="fill">
        <div>COMPRAR DE NOVO</div>
      </AffiliateCatalogSearch>,
    );

    expect(screen.getByText('COMPRAR DE NOVO')).toBeTruthy();

    const input = screen.getByPlaceholderText('Buscar produto...');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ra' } });
    fireEvent.change(input, { target: { value: 'rac' } });
    fireEvent.change(input, { target: { value: 'racao' } });

    await waitFor(() => expect(screen.getByText('Ração Golden Fórmula Cães Adultos')).toBeTruthy(), { timeout: 2000 });
    expect(screen.queryByText('COMPRAR DE NOVO')).toBeNull();

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText('COMPRAR DE NOVO')).toBeTruthy(), { timeout: 2000 });
  });

  it('layout="inline": idem, resultado aparece no fluxo', async () => {
    searchAwinCatalog.mockResolvedValue([RESULT]);
    fetchCommerceOffers.mockResolvedValue([]);
    fetchPetzDirectLink.mockResolvedValue({ available: false, url: null });

    render(<AffiliateCatalogSearch petId="p1" />);
    fireEvent.change(screen.getByPlaceholderText('Buscar produto...'), { target: { value: 'racao golden' } });

    await waitFor(() => expect(screen.getByText('Ração Golden Fórmula Cães Adultos')).toBeTruthy(), { timeout: 2000 });
  });
});

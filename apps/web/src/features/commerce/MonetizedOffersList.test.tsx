import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MonetizedOffersList } from './MonetizedOffersList';

vi.mock('./useCommerceOffers', () => ({
  useCommerceOffers: vi.fn(() => ({ offers: [], loading: false })),
}));
vi.mock('@/lib/analytics/click', () => ({ trackClick: vi.fn(() => Promise.resolve('')) }));
vi.mock('@/lib/v1Metrics', () => ({ trackPartnerClicked: vi.fn() }));

const BASE_PROPS = {
  query: 'Royal Canin Urinary S/O Small Dog 7,5 kg',
  petId: 'pet-1',
  productLabel: 'Royal Canin Urinary',
  source: 'food_sheet',
  ctaType: 'food_buy_direct',
};

describe('MonetizedOffersList — card Amazon (sem preço)', () => {
  it('renderiza o card "Ver na Amazon" sem preço quando não há oferta com preço', () => {
    render(<MonetizedOffersList {...BASE_PROPS} />);

    const link = screen.getByRole('link', { name: 'Ver na Amazon' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('rel', 'sponsored nofollow noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');

    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('https://www.amazon.com.br/s?k=')).toBe(true);
    expect(href).toContain('tag=petmol-20');

    // Nunca preço/imagem da Amazon — só o texto de consulta.
    expect(screen.getByText('Consulte o preço e a disponibilidade na loja')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/amazon/i)).not.toBeInTheDocument();

    // Nunca reivindica "menor preço" para a Amazon.
    expect(screen.queryByText('Menor preço')).not.toBeInTheDocument();
  });

  it('mostra o aviso de associado Amazon uma única vez', () => {
    render(<MonetizedOffersList {...BASE_PROPS} />);
    const notices = screen.getAllByText(/Como associado da Amazon/);
    expect(notices).toHaveLength(1);
  });

  it('não renderiza o card Amazon quando não há termo de busca', () => {
    render(<MonetizedOffersList {...BASE_PROPS} query="" />);
    expect(screen.queryByRole('link', { name: 'Ver na Amazon' })).not.toBeInTheDocument();
  });
});

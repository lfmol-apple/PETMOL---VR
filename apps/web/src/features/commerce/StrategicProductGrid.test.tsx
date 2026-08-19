import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StrategicProductGrid } from './StrategicProductGrid';
import { STRATEGIC_PRODUCTS, getStrategicProductsForSpecies } from './strategicProducts';

const { trackClickMock, trackPartnerClickedMock } = vi.hoisted(() => ({
  trackClickMock: vi.fn(() => Promise.resolve('')),
  trackPartnerClickedMock: vi.fn(),
}));

vi.mock('@/lib/analytics/click', () => ({ trackClick: trackClickMock }));
vi.mock('@/lib/v1Metrics', () => ({ trackPartnerClicked: trackPartnerClickedMock }));

beforeEach(() => {
  trackClickMock.mockClear();
  trackPartnerClickedMock.mockClear();
});

describe('StrategicProductGrid — nunca afirma preço/disponibilidade/desconto', () => {
  it('a página pública mostra toda a curadoria (todos os STRATEGIC_PRODUCTS)', () => {
    render(<StrategicProductGrid products={STRATEGIC_PRODUCTS} source="public_store" />);
    for (const product of STRATEGIC_PRODUCTS) {
      expect(screen.getByText(product.title)).toBeInTheDocument();
    }
  });

  it('nenhum card mostra preço, "menor preço", "melhor oferta" ou afirma estoque', () => {
    render(<StrategicProductGrid products={STRATEGIC_PRODUCTS} source="public_store" />);
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/menor preço/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/melhor oferta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/em estoque/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/disponível agora/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Preço e disponibilidade devem ser confirmados na Amazon.').length).toBe(STRATEGIC_PRODUCTS.length);
  });

  it('todo link Amazon usa rel="sponsored noopener noreferrer" e abre em nova aba', () => {
    render(<StrategicProductGrid products={STRATEGIC_PRODUCTS} source="public_store" />);
    const links = screen.getAllByRole('link', { name: 'Pesquisar na Amazon' });
    expect(links.length).toBe(STRATEGIC_PRODUCTS.length);
    for (const link of links) {
      expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer');
      expect(link).toHaveAttribute('target', '_blank');
      const href = link.getAttribute('href') ?? '';
      expect(href.startsWith('https://www.amazon.com.br/s?k=')).toBe(true);
      expect(href).toContain('tag=petmol-20');
    }
  });

  it('produtos filtrados por espécie de cão não mostram itens só de gato', () => {
    const forDog = getStrategicProductsForSpecies('dog');
    render(<StrategicProductGrid products={forDog} source="pet_store" petId="pet-1" />);
    const catOnly = STRATEGIC_PRODUCTS.find((p) => p.species.length === 1 && p.species[0] === 'cat');
    expect(catOnly).toBeDefined();
    expect(screen.queryByText(catOnly!.title)).not.toBeInTheDocument();
  });
});

describe('StrategicProductGrid — rastreamento distingue public_store de pet_store', () => {
  it('clique na área pública envia source="public_store"', () => {
    render(<StrategicProductGrid products={[STRATEGIC_PRODUCTS[0]]} source="public_store" />);
    screen.getByRole('link', { name: 'Pesquisar na Amazon' }).click();
    expect(trackClickMock).toHaveBeenCalledWith(expect.objectContaining({ source: 'public_store' }));
    expect(trackPartnerClickedMock).toHaveBeenCalledWith(expect.objectContaining({ source: 'public_store' }));
  });

  it('clique na Loja do Pet autenticada envia source="pet_store", nunca "public_store"', () => {
    render(<StrategicProductGrid products={[STRATEGIC_PRODUCTS[0]]} source="pet_store" petId="pet-1" />);
    screen.getByRole('link', { name: 'Pesquisar na Amazon' }).click();
    expect(trackClickMock).toHaveBeenCalledWith(expect.objectContaining({ source: 'pet_store', pet_id: 'pet-1' }));
    expect(trackPartnerClickedMock).toHaveBeenCalledWith(expect.objectContaining({ source: 'pet_store' }));
  });
});

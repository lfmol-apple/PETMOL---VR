import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CabinetStoreSection } from './CabinetStoreSection';
import type { CabinetItem } from '@/lib/cabinetApi';

afterEach(() => cleanup());
const it_ = (id: string, name: string, days_left: number | null, gtin?: string): CabinetItem =>
  ({ id, pet_id: 'p', name, category: 'higiene', days_left, gtin: gtin ?? null });

describe('Loja: produtos guardados', () => {
  it('não mostra nada quando não há produtos', () => {
    const { container } = render(<CabinetStoreSection items={[]} petName="Mia" onBuy={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('lista os produtos do pet com o mais urgente primeiro e compra pela busca (GTIN quando houver, senão o nome)', () => {
    const onBuy = vi.fn();
    render(<CabinetStoreSection items={[it_('a', 'Shampoo', 40), it_('b', 'Gel dental', 2, '7891234567895'), it_('c', 'Bolinha', null)]} petName="Mia" onBuy={onBuy} />);
    expect(screen.getByText('Produtos de Mia')).toBeTruthy();
    const names = screen.getAllByRole('article').map((a) => a.querySelector('p')!.textContent);
    expect(names).toEqual(['Gel dental', 'Shampoo', 'Bolinha']);
    expect(screen.getByText('Acaba em 2 dias')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Comprar' })[0]);
    expect(onBuy).toHaveBeenLastCalledWith('7891234567895', expect.objectContaining({ id: 'b' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Comprar' })[2]);
    expect(onBuy).toHaveBeenLastCalledWith('Bolinha', expect.objectContaining({ id: 'c' }));
  });
});

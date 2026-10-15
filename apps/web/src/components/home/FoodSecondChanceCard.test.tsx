import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/v1Metrics', () => ({ trackV1Metric: vi.fn() }));
import { FoodSecondChanceCard } from './FoodSecondChanceCard';
import { readSecondChance } from './foodSecondChance';

beforeEach(() => window.localStorage.clear());
const props = { petId: 'p1', petName: 'Thor', hasFoodData: false, onboardingFood: 'later' as const };

describe('FoodSecondChanceCard', () => {
  it('"Agora não" some, começa a pausa e avisa a Home para liberar o próximo pedido', () => {
    const onResolved = vi.fn();
    render(<FoodSecondChanceCard {...props} onRegister={vi.fn()} onResolved={onResolved} />);
    expect(screen.getByText('Falta só a ração de Thor')).toBeTruthy();
    fireEvent.click(screen.getByText('Agora não'));
    expect(screen.queryByText('Falta só a ração de Thor')).toBeNull();
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(readSecondChance('p1').count).toBe(1);
  });

  it('"Cadastrar a ração" abre o cadastro e também libera o próximo pedido', () => {
    const onRegister = vi.fn(); const onResolved = vi.fn();
    render(<FoodSecondChanceCard {...props} onRegister={onRegister} onResolved={onResolved} />);
    fireEvent.click(screen.getByText('Cadastrar a ração'));
    expect(onRegister).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('não aparece para quem já tem ração nem para quem declarou "não uso ração"', () => {
    const { container, rerender } = render(<FoodSecondChanceCard {...props} hasFoodData onRegister={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    rerender(<FoodSecondChanceCard {...props} onboardingFood="na" onRegister={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

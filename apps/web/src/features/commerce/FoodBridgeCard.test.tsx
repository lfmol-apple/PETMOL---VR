import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoodBridgeCard, dismissFoodBridge, isFoodBridgeDismissed } from './FoodBridgeCard';

beforeEach(() => window.localStorage.clear());

describe('FoodBridgeCard', () => {
  it('mostra o nome do pet e dispara cadastrar / agora não', () => {
    const onRegister = vi.fn(); const onDismiss = vi.fn();
    render(<FoodBridgeCard petName="Mel" onRegister={onRegister} onDismiss={onDismiss} />);
    expect(screen.getByText(/ração de Mel acabar/)).toBeTruthy();
    fireEvent.click(screen.getByText('Cadastrar a ração'));
    fireEvent.click(screen.getByText('Agora não'));
    expect(onRegister).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('"agora não" esconde por 7 dias, por pet, e depois volta', () => {
    const t0 = 1_800_000_000_000;
    expect(isFoodBridgeDismissed('p1', t0)).toBe(false);
    dismissFoodBridge('p1', t0);
    expect(isFoodBridgeDismissed('p1', t0 + 6 * 86400000)).toBe(true);
    expect(isFoodBridgeDismissed('p1', t0 + 8 * 86400000)).toBe(false);
    expect(isFoodBridgeDismissed('outro-pet', t0 + 1000)).toBe(false);
  });
});

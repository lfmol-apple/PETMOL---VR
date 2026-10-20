import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/backStack', () => ({ useBackHandler: () => undefined }));
vi.mock('@/hooks/useKeyboardSheet', () => ({ useKeyboardSheet: () => ({ current: null }) }));
vi.mock('@/components/ModalPortal', () => ({ ModalPortal: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/FoodControlTab', () => ({ FoodControlTab: () => null }));
vi.mock('@/components/home/ActivationAskSheet', () => ({ ActivationAskSheet: () => null }));
vi.mock('@/components/home/foodSecondChance', () => ({ startSecondChanceClock: vi.fn() }));
vi.mock('@/lib/onboardingProgress', () => ({ writeOnboardingStore: vi.fn() }));
vi.mock('@/lib/v1Metrics', () => ({ trackV1Metric: vi.fn() }));
vi.mock('@/features/interactions/useNotificationPermissionController', () => ({
  useNotificationPermissionController: () => ({ permission: 'granted', requestPermission: vi.fn(), subscribeToPush: vi.fn() }),
}));

import { FoodOnboardingCard } from './FoodOnboardingCard';

afterEach(cleanup);

describe('FoodOnboardingCard — não cobre o cabeçalho', () => {
  it('o passo de ração (abre sozinho) fica ABAIXO do cabeçalho global (z-50): Perfil e ☰ seguem tocáveis', () => {
    render(<FoodOnboardingCard petId="p1" petName="Baby" onDone={vi.fn()} />);
    const dialog = screen.getByRole('dialog') as HTMLElement;
    expect(Number(dialog.style.zIndex)).toBeLessThan(50);
    expect(Number(dialog.style.zIndex)).toBeGreaterThan(0);
  });
});

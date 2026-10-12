import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FoodOnboardingCard } from './FoodOnboardingCard';
import { readOnboardingStore } from '@/lib/onboardingProgress';

// Achado real (12/10/2026, Mission Control): 522 de 910 tutores com pet
// cadastraram o pet e pararam aí, sem configurar alimentação — a tela
// intermediária pedindo vacina+antipulgas+vermífugo+ração de uma vez
// (OnboardingChecklistCard) foi substituída por este passo focado, só
// alimentação. FoodControlTab (que faz o salvamento real) é mockado aqui —
// o que este arquivo testa é a MOLDURA de onboarding (cópia, pular, eventos,
// não repetir), não a lógica de alimentação em si (essa é responsabilidade
// de FoodControlTab, reaproveitada sem alteração).
const trackV1Metric = vi.fn();
vi.mock('@/lib/v1Metrics', () => ({ trackV1Metric: (...args: unknown[]) => trackV1Metric(...args) }));

let capturedOnSaved: (() => void) | null = null;
vi.mock('@/components/FoodControlTab', () => ({
  FoodControlTab: (props: { onSaved?: () => void }) => {
    capturedOnSaved = props.onSaved ?? null;
    return <div data-testid="food-control-tab-stub" />;
  },
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  capturedOnSaved = null;
});

beforeEach(() => {
  trackV1Metric.mockClear();
});

const baseProps = {
  petId: 'pet-123',
  petName: 'Duke',
  petSex: 'male' as const,
  onDone: vi.fn(),
};

describe('FoodOnboardingCard', () => {
  it('mostra o título com o nome real do pet e o artigo certo (masculino)', () => {
    render(<FoodOnboardingCard {...baseProps} onDone={vi.fn()} />);
    expect(screen.getByText('Saiba quando a ração do Duke vai acabar')).toBeTruthy();
  });

  it('usa o artigo feminino pra pet fêmea', () => {
    render(<FoodOnboardingCard {...baseProps} petName="Mel" petSex="female" onDone={vi.fn()} />);
    expect(screen.getByText('Saiba quando a ração da Mel vai acabar')).toBeTruthy();
  });

  it('dispara onboarding_food_step_viewed ao montar', () => {
    render(<FoodOnboardingCard {...baseProps} onDone={vi.fn()} />);
    expect(trackV1Metric).toHaveBeenCalledWith('onboarding_food_step_viewed', { pet_id: 'pet-123' });
  });

  it('renderiza o FoodControlTab real (reaproveita 100% a lógica de alimentação, nada duplicado)', () => {
    render(<FoodOnboardingCard {...baseProps} onDone={vi.fn()} />);
    expect(screen.getByTestId('food-control-tab-stub')).toBeTruthy();
  });

  it('"Fazer depois" grava food:"later" no store, dispara skip e chama onDone — sem bloquear o tutor', () => {
    const onDone = vi.fn();
    render(<FoodOnboardingCard {...baseProps} onDone={onDone} />);
    fireEvent.click(screen.getByText('Fazer depois'));
    expect(readOnboardingStore('pet-123').food).toBe('later');
    expect(trackV1Metric).toHaveBeenCalledWith('onboarding_food_step_skipped', { pet_id: 'pet-123' });
    expect(onDone).toHaveBeenCalledTimes(1);
    // some da tela depois do pulo — não insiste na mesma sessão
    expect(screen.queryByText('Saiba quando a ração do Duke vai acabar')).toBeNull();
  });

  it('quando o FoodControlTab salva (onSaved), dispara completed e chama onDone', () => {
    const onDone = vi.fn();
    render(<FoodOnboardingCard {...baseProps} onDone={onDone} />);
    expect(capturedOnSaved).toBeTruthy();
    act(() => { capturedOnSaved!(); });
    expect(trackV1Metric).toHaveBeenCalledWith('onboarding_food_step_completed', { pet_id: 'pet-123' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('fechar pelo X do cabeçalho conta como "fazer depois" (mesma gravação, não é dado como perdido sem motivo)', () => {
    render(<FoodOnboardingCard {...baseProps} onDone={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(readOnboardingStore('pet-123').food).toBe('later');
    expect(trackV1Metric).toHaveBeenCalledWith('onboarding_food_step_skipped', { pet_id: 'pet-123' });
  });

  it('pet já com "later" salvo não deveria nem ser montado pelo pai — mas se for, não quebra (idempotente)', () => {
    window.localStorage.setItem('petmol_onboarding_v2:pet-123', JSON.stringify({ food: 'later' }));
    render(<FoodOnboardingCard {...baseProps} onDone={vi.fn()} />);
    // o componente em si não decide "se deve aparecer" — isso é do pai
    // (home/page.tsx, via hasFoodData + readOnboardingStore); aqui só
    // confirma que montar de novo não corrompe o valor já salvo.
    expect(readOnboardingStore('pet-123').food).toBe('later');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
  deriveOnboardingProgress,
  hasFoodData,
  readOnboardingStore,
  shouldShowOnboardingCard,
  writeOnboardingStore,
  type DeriveOnboardingInput,
} from './onboardingProgress';

const PET = 'pet-1';

function baseInput(overrides: Partial<DeriveOnboardingInput> = {}): DeriveOnboardingInput {
  return {
    petId: PET,
    hasPet: true,
    vaccinesCount: 0,
    parasiteTypes: [],
    feedingPlan: null,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('hasFoodData', () => {
  it('false para plano nulo ou vazio', () => {
    expect(hasFoodData(null)).toBe(false);
    expect(hasFoodData({})).toBe(false);
  });

  it('true quando há marca, itens ou previsão', () => {
    expect(hasFoodData({ food_brand: 'Golden' })).toBe(true);
    expect(hasFoodData({ items: [{ label: 'x' }] })).toBe(true);
    expect(hasFoodData({ estimated_days_left: 12 })).toBe(true);
  });

  it('true quando o tutor declarou alimentação caseira', () => {
    expect(hasFoodData({ no_consumption_control: true, mode: 'homemade' })).toBe(true);
  });
});

describe('deriveOnboardingProgress — usuário novo', () => {
  it('só o perfil concluído logo após criar o pet', () => {
    const p = deriveOnboardingProgress(baseInput());
    expect(p.doneCount).toBe(1);
    expect(p.total).toBe(5);
    expect(p.allResolved).toBe(false);
    expect(p.steps.find((s) => s.key === 'profile')?.done).toBe(true);
    expect(shouldShowOnboardingCard(p)).toBe(true);
  });

  it('sem pet nada aparece', () => {
    const p = deriveOnboardingProgress(baseInput({ hasPet: false }));
    expect(p.doneCount).toBe(0);
    expect(shouldShowOnboardingCard(p)).toBe(false);
  });
});

describe('deriveOnboardingProgress — dado real', () => {
  it('vacina real conclui o passo', () => {
    const p = deriveOnboardingProgress(baseInput({ vaccinesCount: 1 }));
    const step = p.steps.find((s) => s.key === 'vaccine')!;
    expect(step.done).toBe(true);
    expect(step.fromData).toBe(true);
  });

  it('flea_tick e collar contam para "pulgas e carrapatos"', () => {
    expect(deriveOnboardingProgress(baseInput({ parasiteTypes: ['flea_tick'] })).steps.find((s) => s.key === 'flea')?.done).toBe(true);
    expect(deriveOnboardingProgress(baseInput({ parasiteTypes: ['collar'] })).steps.find((s) => s.key === 'flea')?.done).toBe(true);
  });

  it('dewormer real conclui o vermífugo', () => {
    expect(deriveOnboardingProgress(baseInput({ parasiteTypes: ['dewormer'] })).steps.find((s) => s.key === 'dewormer')?.done).toBe(true);
  });

  it('dado real ganha de declaração "depois"', () => {
    writeOnboardingStore(PET, { vaccine: 'later' });
    const step = deriveOnboardingProgress(baseInput({ vaccinesCount: 2 })).steps.find((s) => s.key === 'vaccine')!;
    expect(step.done).toBe(true);
    expect(step.fromData).toBe(true);
  });
});

describe('deriveOnboardingProgress — declarações e retomada', () => {
  it('"agora não" resolve o passo sem dado real', () => {
    writeOnboardingStore(PET, { food: 'later', flea: 'none', dewormer: 'unknown' });
    const p = deriveOnboardingProgress(baseInput());
    expect(p.steps.find((s) => s.key === 'food')?.done).toBe(true);
    expect(p.steps.find((s) => s.key === 'food')?.fromData).toBe(false);
    expect(p.doneCount).toBe(4); // profile + food + flea + dewormer
  });

  it('conclui quando tudo resolvido (dado + declaração)', () => {
    writeOnboardingStore(PET, { food: 'na', vaccine: 'unknown' });
    const p = deriveOnboardingProgress(baseInput({ parasiteTypes: ['flea_tick', 'dewormer'] }));
    expect(p.allResolved).toBe(true);
    expect(shouldShowOnboardingCard(p)).toBe(false);
  });

  it('card some depois de dispensado', () => {
    writeOnboardingStore(PET, { dismissed: true });
    const p = deriveOnboardingProgress(baseInput({ vaccinesCount: 1 }));
    expect(shouldShowOnboardingCard(p)).toBe(false);
  });

  it('store persiste e mescla patches', () => {
    writeOnboardingStore(PET, { food: 'later' });
    writeOnboardingStore(PET, { startedAt: '2026-08-30T00:00:00Z' });
    expect(readOnboardingStore(PET)).toEqual({ food: 'later', startedAt: '2026-08-30T00:00:00Z' });
  });
});

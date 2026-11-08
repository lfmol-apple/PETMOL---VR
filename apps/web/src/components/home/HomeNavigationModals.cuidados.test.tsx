import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/backStack', () => ({ useBackHandler: () => undefined }));
vi.mock('@/lib/I18nContext', () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock('@/components/ModalPortal', () => ({ ModalPortal: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/home/PetShopsNearbySheet', () => ({ PetShopsNearbySheet: () => null }));
vi.mock('@/lib/featureFlags', () => ({ MEDICATIONS_ENABLED: false }));

import { HomeNavigationModals } from './HomeNavigationModals';

afterEach(cleanup);

function open(species: string) {
  render(
    <HomeNavigationModals
      currentPet={{ pet_id: 'p1', pet_name: 'Baby', species } as never}
      showHealthOptionsModal
      onCloseHealthOptionsModal={vi.fn()}
      onOpenHealthOptionsModal={vi.fn()}
      alertVaccinesValue={false}
      alertParasitesValue={false}
      alertMedicationValue={false}
      onOpenHealthTab={vi.fn()}
      onStartEventRegistration={vi.fn()}
    />,
  );
}

describe('Cuidados — com o card de Banho e Tosa (de volta, além da banheirinha)', () => {
  it('cão: Vermífugo, Antipulgas, Coleira, Banho e Tosa e PetShops (5 cards: o último ocupa a linha toda)', () => {
    open('dog');
    ['Vermífugo', 'Antipulgas', 'Coleira', 'Banho e Tosa', 'PetShops'].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    const petshops = screen.getByText('PetShops').closest('button')!;
    expect(petshops.className).toContain('col-span-2');
    expect(screen.getByText('Banho e Tosa').closest('button')!.className).not.toContain('col-span-2');
  });
  it('gato: sem Coleira; Banho e Tosa presente (4 cards, grade par, ninguém ocupa a linha toda)', () => {
    open('cat');
    expect(screen.queryByText('Coleira')).toBeNull();
    expect(screen.getByText('Banho e Tosa')).toBeTruthy();
    expect(screen.getByText('PetShops').closest('button')!.className).not.toContain('col-span-2');
  });
  it('tocar em Banho e Tosa fecha o Cuidados e abre o sheet de banho e tosa', () => {
    const onClose = vi.fn();
    const onOpenGrooming = vi.fn();
    render(
      <HomeNavigationModals
        currentPet={{ pet_id: 'p1', pet_name: 'Baby', species: 'dog' } as never}
        showHealthOptionsModal
        onCloseHealthOptionsModal={onClose}
        onOpenHealthOptionsModal={vi.fn()}
        alertVaccinesValue={false}
        alertParasitesValue={false}
        alertMedicationValue={false}
        onOpenHealthTab={vi.fn()}
        onStartEventRegistration={vi.fn()}
        onOpenGrooming={onOpenGrooming}
      />,
    );
    fireEvent.click(screen.getByText('Banho e Tosa'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenGrooming).toHaveBeenCalledTimes(1);
  });
});

describe('Cuidados — espécies sem vacina/parasita (coelho, cavalo…)', () => {
  it.each(['rabbit', 'cavalo'])('%s: sem Vermífugo/Antipulgas/Coleira; ficam Banho e Tosa e PetShops', (sp) => {
    open(sp);
    ['Vermífugo', 'Antipulgas', 'Coleira'].forEach((l) => expect(screen.queryByText(l)).toBeNull());
    expect(screen.getByText('Banho e Tosa')).toBeTruthy();
    expect(screen.getByText('PetShops')).toBeTruthy();
  });
});

describe('Cuidados — Banho e Tosa por espécie', () => {
  it.each(['fish', 'bird', 'hamster'])('%s: sem Banho e Tosa (só PetShops)', (sp) => {
    open(sp);
    expect(screen.queryByText('Banho e Tosa')).toBeNull();
    expect(screen.getByText('PetShops')).toBeTruthy();
  });
});

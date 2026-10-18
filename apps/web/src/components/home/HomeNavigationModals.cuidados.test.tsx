import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/backStack', () => ({ useBackHandler: () => undefined }));
vi.mock('@/lib/I18nContext', () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock('@/components/ModalPortal', () => ({ ModalPortal: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/home/PetShopsNearbySheet', () => ({ PetShopsNearbySheet: () => null }));
vi.mock('@/lib/featureFlags', () => ({ MEDICATIONS_ENABLED: false }));

import { HomeNavigationModals } from './HomeNavigationModals';

afterEach(cleanup);

function open(species: 'dog' | 'cat') {
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

describe('Cuidados — sem o card de Banho e Tosa (a banheirinha assumiu)', () => {
  it('cão: Vermífugo, Antipulgas, Coleira e PetShops; sem Banho e Tosa', () => {
    open('dog');
    ['Vermífugo', 'Antipulgas', 'Coleira', 'PetShops'].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    expect(screen.queryByText('Banho e Tosa')).toBeNull();
  });
  it('gato: número ímpar de cards — o último (PetShops) ocupa a linha toda', () => {
    open('cat');
    expect(screen.queryByText('Banho e Tosa')).toBeNull();
    expect(screen.queryByText('Coleira')).toBeNull();
    const petshops = screen.getByText('PetShops').closest('button')!;
    expect(petshops.className).toContain('col-span-2');
    const vermifugo = screen.getByText('Vermífugo').closest('button')!;
    expect(vermifugo.className).not.toContain('col-span-2');
  });
});

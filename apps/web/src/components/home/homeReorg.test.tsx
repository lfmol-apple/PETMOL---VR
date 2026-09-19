import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/lib/I18nContext';
import { AppleControlButtons } from '@/components/AppleControlButtons';
import { HomeNavigationModals } from '@/components/home/HomeNavigationModals';

vi.mock('@/features/healthPlan/config', () => ({
  HEALTH_PLAN_ENABLED: false,
  HEALTH_PLAN_COUPON: '',
  resolveHealthPlanCtaUrl: () => null,
}));

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe('Home — reorganização (Plano de Saúde / PetShops / Fale com o PETMOL)', () => {
  it('AppleControlButtons: Plano de Saúde desativado pro 1.0; sem PetShops nem Fale com o Petmol', () => {
    const { container } = renderWithI18n(
      <AppleControlButtons
        onHealthClick={() => {}}
        onVaccinesClick={() => {}}
        petName="Baby"
        petSex="male"
        onPetSumidoClick={() => {}}
      />,
    );
    // Plano de Saúde desativado pro 1.0 (19/09/2026, HEALTH_PLAN_CARD_ENABLED
    // em lib/featureFlags.ts) — card "Em breve" não tinha função nenhuma por
    // trás e só gerava expectativa sem entrega (achado da auditoria final).
    expect(screen.queryByText('Plano de saúde para o Baby')).toBeNull();
    expect(screen.queryByText('Em breve')).toBeNull();
    // saíram da Home
    expect(screen.queryByText('PetShops perto de você')).toBeNull();
    expect(screen.queryByText('Fale com o Petmol')).toBeNull();
    expect(screen.queryByText('Sugestão, elogio ou problema')).toBeNull();
    // Pet Sumido continua
    expect(screen.getByText('Pet Sumido')).toBeTruthy();
    // nada de Petlove / "seguro"
    const txt = (container.textContent || '').toLowerCase();
    expect(txt).not.toContain('petlove');
    expect(txt).not.toContain('seguro');
  });

  it('HomeNavigationModals: "PetShops perto de você" agora está dentro de Cuidados', () => {
    renderWithI18n(
      <HomeNavigationModals
        currentPet={{ pet_id: 'p1', pet_name: 'Baby', species: 'dog' } as never}
        showHealthOptionsModal
        onCloseHealthOptionsModal={() => {}}
        onOpenHealthOptionsModal={() => {}}
        alertVaccinesValue={false}
        alertParasitesValue={false}
        alertMedicationValue={false}
        onOpenHealthTab={() => {}}
        onStartEventRegistration={() => {}}
      />,
    );
    expect(screen.getByText('Cuidados')).toBeTruthy();
    // "PetShops" agora é mais um card dentro do grid de Cuidados
    expect(screen.getByText('PetShops')).toBeTruthy();
    expect(screen.getByText('Perto de você')).toBeTruthy();
  });
});

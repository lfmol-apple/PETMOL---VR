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
  it('AppleControlButtons: Plano de Saúde entre os cards e Pet Sumido; sem PetShops nem Fale com o Petmol', () => {
    const { container } = renderWithI18n(
      <AppleControlButtons
        onHealthClick={() => {}}
        onVaccinesClick={() => {}}
        petName="Baby"
        petSex="male"
        onPetSumidoClick={() => {}}
      />,
    );
    // bloco Plano de Saúde presente (versão neutra)
    expect(screen.getByText('Plano de saúde para o Baby')).toBeTruthy();
    expect(screen.getByText('Em breve')).toBeTruthy();
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

    // ordem: Plano de Saúde aparece ANTES de "Pet Sumido" no DOM
    const html = container.innerHTML;
    expect(html.indexOf('Plano de saúde para')).toBeGreaterThan(-1);
    expect(html.indexOf('Plano de saúde para')).toBeLessThan(html.indexOf('Pet Sumido'));
  });

  it('HomeNavigationModals: "PetShops perto de você" agora está dentro de Cuidados', () => {
    renderWithI18n(
      <HomeNavigationModals
        currentPet={{ pet_id: 'p1', pet_name: 'Baby', species: 'dog' } as never}
        showHealthOptionsModal
        onCloseHealthOptionsModal={() => {}}
        onOpenHealthOptionsModal={() => {}}
        showEventTypeModal={false}
        onOpenEventTypeModal={() => {}}
        onCloseEventTypeModal={() => {}}
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

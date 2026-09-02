import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const cfg = {
  HEALTH_PLAN_ENABLED: false,
  HEALTH_PLAN_COUPON: '',
  resolveHealthPlanCtaUrl: vi.fn((): string | null => null),
};
vi.mock('@/features/healthPlan/config', () => ({
  get HEALTH_PLAN_ENABLED() { return cfg.HEALTH_PLAN_ENABLED; },
  get HEALTH_PLAN_COUPON() { return cfg.HEALTH_PLAN_COUPON; },
  resolveHealthPlanCtaUrl: () => cfg.resolveHealthPlanCtaUrl(),
}));

import { PetHealthPlanCard } from './PetHealthPlanCard';

describe('PetHealthPlanCard', () => {
  beforeEach(() => {
    cfg.HEALTH_PLAN_ENABLED = false;
    cfg.HEALTH_PLAN_COUPON = '';
    cfg.resolveHealthPlanCtaUrl.mockReturnValue(null);
  });

  it('DESATIVADO: mostra "Em breve", sem CTA, sem parceiro, sem cupom, sem "seguro"', () => {
    const { container } = render(<PetHealthPlanCard petName="Baby" petSex="male" />);
    expect(screen.getByText('Em breve')).toBeTruthy();
    expect(screen.getByText('Plano de saúde para o Baby')).toBeTruthy();
    expect(container.querySelector('a')).toBeNull(); // nenhum link clicável
    const txt = container.textContent || '';
    expect(txt.toLowerCase()).not.toContain('petlove');
    expect(txt.toLowerCase()).not.toContain('seguro');
    expect(txt).not.toContain('Publicidade');
    expect(txt).not.toContain('Cupom');
  });

  it('sem nome do pet: título genérico', () => {
    render(<PetHealthPlanCard />);
    expect(screen.getByText('Plano de saúde para seu pet')).toBeTruthy();
  });

  it('pet fêmea: usa artigo "a"', () => {
    render(<PetHealthPlanCard petName="Nine" petSex="female" />);
    expect(screen.getByText('Plano de saúde para a Nine')).toBeTruthy();
  });

  it('ATIVADO com URL: mostra CTA para a URL e o rótulo "Publicidade • Parceria"', () => {
    cfg.HEALTH_PLAN_ENABLED = true;
    cfg.resolveHealthPlanCtaUrl.mockReturnValue('https://exemplo.com/afiliado');
    const { container } = render(<PetHealthPlanCard petName="Baby" petSex="male" />);
    const link = container.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://exemplo.com/afiliado');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('sponsored');
    expect(screen.getByText('Publicidade • Parceria')).toBeTruthy();
    expect(screen.queryByText('Em breve')).toBeNull();
  });

  it('ATIVADO com cupom: exibe o cupom', () => {
    cfg.HEALTH_PLAN_ENABLED = true;
    cfg.HEALTH_PLAN_COUPON = 'ABC123';
    cfg.resolveHealthPlanCtaUrl.mockReturnValue('https://exemplo.com/afiliado');
    render(<PetHealthPlanCard petName="Baby" />);
    expect(screen.getByText('ABC123')).toBeTruthy();
  });
});

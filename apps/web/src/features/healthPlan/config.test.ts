import { describe, expect, it } from 'vitest';
import {
  HEALTH_PLAN_AFFILIATE_URL,
  HEALTH_PLAN_COUPON,
  HEALTH_PLAN_ENABLED,
  HEALTH_PLAN_GO_PATH,
  resolveHealthPlanCtaUrl,
} from './config';

describe('healthPlan/config — estado inicial DESATIVADO', () => {
  it('a integração começa desligada e sem valores comerciais', () => {
    expect(HEALTH_PLAN_ENABLED).toBe(false);
    expect(HEALTH_PLAN_AFFILIATE_URL).toBe('');
    expect(HEALTH_PLAN_COUPON).toBe('');
  });

  it('desativado: resolveHealthPlanCtaUrl() é null (nenhum redirecionamento)', () => {
    expect(resolveHealthPlanCtaUrl()).toBeNull();
  });

  it('a rota própria de rastreamento está reservada mas não é usada ainda', () => {
    expect(HEALTH_PLAN_GO_PATH).toBe('/go/petlove-saude');
  });
});

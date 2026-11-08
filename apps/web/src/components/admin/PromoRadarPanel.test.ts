import { describe, expect, it } from 'vitest';
import { phaseOf } from './PromoRadarPanel';

describe('phaseOf (fase da campanha no painel)', () => {
  const p = { startsOn: '2026-11-11', endsOn: '2026-11-13' };
  it('no ar, em breve (até 7 dias), agendada e encerrada', () => {
    expect(phaseOf(p, '2026-11-12')).toBe('live');
    expect(phaseOf(p, '2026-11-11')).toBe('live');
    expect(phaseOf(p, '2026-11-13')).toBe('live');
    expect(phaseOf(p, '2026-11-08')).toBe('soon');
    expect(phaseOf(p, '2026-11-04')).toBe('soon');
    expect(phaseOf(p, '2026-11-03')).toBe('later');
    expect(phaseOf(p, '2026-11-14')).toBe('past');
  });
});

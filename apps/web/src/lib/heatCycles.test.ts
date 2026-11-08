import { describe, expect, it } from 'vitest';
import {
  addDays, averageIntervalDays, estimatedDueDate, heatButtonState, heatDayNumber, heatTrackingApplies,
  inPostHeatWatch, isLongHeat, predictNextHeat, type HeatCycle,
} from './heatCycles';

const c = (started_on: string, ended_on: string | null = null, mated_on: string | null = null): HeatCycle =>
  ({ id: started_on, pet_id: 'p', started_on, ended_on, mated_on, notes: null });

describe('heatTrackingApplies', () => {
  it('só fêmea não castrada, cão ou gato', () => {
    expect(heatTrackingApplies({ sex: 'female', neutered: false, species: 'dog' })).toBe(true);
    expect(heatTrackingApplies({ sex: 'female', neutered: undefined, species: 'cat' })).toBe(true);
    expect(heatTrackingApplies({ sex: 'female', neutered: true, species: 'dog' })).toBe(false);
    expect(heatTrackingApplies({ sex: 'male', neutered: false, species: 'dog' })).toBe(false);
    expect(heatTrackingApplies({ sex: 'female', neutered: false, species: 'rabbit' })).toBe(false);
    expect(heatTrackingApplies({ sex: undefined, neutered: false, species: 'dog' })).toBe(false);
  });
});

describe('previsão do próximo cio (só cadelas)', () => {
  const hist = [c('2025-01-10', '2025-01-24'), c('2025-07-12', '2025-07-26'), c('2026-01-08', '2026-01-22')];

  it('média dos intervalos entre inícios → data estimada', () => {
    const avg = averageIntervalDays(hist)!;
    expect(avg.samples).toBe(2);
    expect(avg.days).toBe(Math.round((183 + 180) / 2));
    const p = predictNextHeat(hist, 'dog', '2026-05-01')!;
    expect(p.nextOn).toBe(addDays('2026-01-08', avg.days));
    expect(p.daysUntil).toBeGreaterThan(0);
  });
  it('com um só cio registrado não há previsão', () => {
    expect(predictNextHeat([c('2026-01-08', '2026-01-22')], 'dog', '2026-05-01')).toBeNull();
  });
  it('gata nunca recebe previsão', () => {
    expect(predictNextHeat(hist, 'cat', '2026-05-01')).toBeNull();
  });
  it('cio em andamento não tem previsão', () => {
    expect(predictNextHeat([...hist, c('2026-07-01')], 'dog', '2026-07-05')).toBeNull();
  });
  it('intervalos implausíveis (registro esquecido) são ignorados', () => {
    const odd = [c('2025-01-10', '2025-01-24'), c('2025-02-05', '2025-02-15'), c('2025-08-10', '2025-08-24')];
    // 2025-01-10→02-05 = 26 dias (ignorado); 02-05→08-10 = 186 (vale)
    expect(averageIntervalDays(odd)!.days).toBe(186);
  });
});

describe('estado do botão', () => {
  const hist = [c('2025-01-10', '2025-01-24'), c('2025-07-12', '2025-07-26'), c('2026-01-08', '2026-01-22')];
  it('em cio → in_heat', () => {
    expect(heatButtonState([c('2026-07-01')], 'dog', '2026-07-03')).toBe('in_heat');
  });
  it('cio chegando (≤14 dias) → soon; longe → idle', () => {
    const p = predictNextHeat(hist, 'dog', '2026-05-01')!;
    expect(heatButtonState(hist, 'dog', addDays(p.nextOn, -10))).toBe('soon');
    expect(heatButtonState(hist, 'dog', addDays(p.nextOn, -60))).toBe('idle');
  });
  it('gata fora do cio fica neutra', () => {
    expect(heatButtonState(hist, 'cat', '2026-05-01')).toBe('idle');
  });
});

describe('avisos de cuidado', () => {
  it('dia do cio em andamento começa no 1', () => {
    expect(heatDayNumber(c('2026-07-01'), '2026-07-01')).toBe(1);
    expect(heatDayNumber(c('2026-07-01'), '2026-07-10')).toBe(10);
  });
  it('cio longo só quando em andamento e passou de 28 dias', () => {
    expect(isLongHeat(c('2026-06-01'), '2026-06-20')).toBe(false);
    expect(isLongHeat(c('2026-06-01'), '2026-07-05')).toBe(true);
    expect(isLongHeat(c('2026-06-01', '2026-06-15'), '2026-07-05')).toBe(false);
  });
  it('janela pós-cio: de 14 a 63 dias depois do FIM do último cio', () => {
    const h = [c('2026-05-01', '2026-05-15')];
    expect(inPostHeatWatch(h, '2026-05-20')).toBe(false);
    expect(inPostHeatWatch(h, '2026-06-05')).toBe(true);
    expect(inPostHeatWatch(h, '2026-09-01')).toBe(false);
    expect(inPostHeatWatch([c('2026-05-01')], '2026-06-05')).toBe(false);
  });
  it('parto estimado: cadela 63 dias, gata 65, outras nada', () => {
    expect(estimatedDueDate('2026-03-01', 'dog')).toBe('2026-05-03');
    expect(estimatedDueDate('2026-03-01', 'cat')).toBe('2026-05-05');
    expect(estimatedDueDate('2026-03-01', 'rabbit')).toBeNull();
    expect(estimatedDueDate(null, 'dog')).toBeNull();
  });
});

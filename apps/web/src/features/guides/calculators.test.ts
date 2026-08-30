import { describe, expect, it } from 'vitest';
import {
  bagDuration,
  compareRations,
  formatBRL,
  formatDays,
  monthlyCost,
  parsePositiveNumber,
} from './calculators';

describe('parsePositiveNumber', () => {
  it('aceita vírgula e ponto como separador decimal', () => {
    expect(parsePositiveNumber('7,5', 'x')).toEqual({ ok: true, value: 7.5 });
    expect(parsePositiveNumber('7.5', 'x')).toEqual({ ok: true, value: 7.5 });
  });
  it('rejeita vazio, zero, negativo e não-número', () => {
    expect(parsePositiveNumber('', 'o peso').ok).toBe(false);
    expect(parsePositiveNumber('   ', 'o peso').ok).toBe(false);
    expect(parsePositiveNumber('0', 'o peso').ok).toBe(false);
    expect(parsePositiveNumber('-3', 'o peso').ok).toBe(false);
    expect(parsePositiveNumber('abc', 'o peso').ok).toBe(false);
  });
  it('a mensagem de erro cita o campo', () => {
    expect(parsePositiveNumber('', 'o consumo diário').error).toContain('o consumo diário');
  });
});

describe('bagDuration — quanto tempo dura um saco de ração', () => {
  it('o exemplo do guia: 7,5 kg a 200 g/dia = 37,5 dias', () => {
    const r = bagDuration({ bagKg: 7.5, dailyGrams: 200 });
    expect(r.days).toBeCloseTo(37.5, 5);
    expect(r.weeks).toBeCloseTo(37.5 / 7, 5);
  });
  it('15 kg a 300 g/dia = 50 dias', () => {
    expect(bagDuration({ bagKg: 15, dailyGrams: 300 }).days).toBe(50);
  });
});

describe('monthlyCost — custo mensal de ração', () => {
  it('15 kg por R$ 300, 300 g/dia', () => {
    const r = monthlyCost({ bagPrice: 300, bagKg: 15, dailyGrams: 300 });
    expect(r.costPerKg).toBe(20);
    expect(r.costPerDay).toBeCloseTo(6, 5);
    expect(r.costPer30Days).toBeCloseTo(180, 5);
    expect(r.bagDurationDays).toBe(50);
  });
});

describe('compareRations — comparar duas rações pelo custo diário', () => {
  it('a ração "mais cara" por saco pode custar menos por mês', () => {
    const r = compareRations(
      { label: 'A', bagPrice: 210, bagKg: 15, dailyGrams: 350 },
      { label: 'B', bagPrice: 270, bagKg: 15, dailyGrams: 240 },
    );
    expect(r.a.costPerDay).toBeCloseTo(4.9, 5);
    expect(r.b.costPerDay).toBeCloseTo(4.32, 5);
    expect(r.cheaperLabel).toBe('B');
    expect(r.monthlyDifference).toBeCloseTo(Math.abs(4.9 * 30 - 4.32 * 30), 4);
  });
  it('empate exato de custo por dia → cheaperLabel null', () => {
    const r = compareRations(
      { label: 'A', bagPrice: 100, bagKg: 10, dailyGrams: 200 },
      { label: 'B', bagPrice: 200, bagKg: 20, dailyGrams: 200 },
    );
    expect(r.cheaperLabel).toBeNull();
    expect(r.monthlyDifference).toBe(0);
  });
  it('usa rótulo padrão quando o nome vem vazio', () => {
    const r = compareRations(
      { label: '', bagPrice: 100, bagKg: 10, dailyGrams: 100 },
      { label: '', bagPrice: 100, bagKg: 10, dailyGrams: 200 },
    );
    expect(r.a.label).toBe('Ração A');
    expect(r.b.label).toBe('Ração B');
  });
});

describe('formatação', () => {
  it('formatDays arredonda e pluraliza', () => {
    expect(formatDays(1)).toBe('1 dia');
    expect(formatDays(37.5)).toBe('37,5 dias');
    expect(formatDays(30)).toBe('30 dias');
  });
  it('formatBRL usa o formato brasileiro', () => {
    expect(formatBRL(6)).toBe('R$ 6,00');
    expect(formatBRL(187.333)).toBe('R$ 187,33');
  });
});

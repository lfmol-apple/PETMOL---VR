import { describe, expect, it } from 'vitest';
import { spStartOfToday, spYesterdayRange, fmtSpDate, fmtSpDateTime, fmtSpDay, parseInstant, spDayBounds } from './spTime';

describe('spTime — fronteiras de dia em America/Sao_Paulo, nunca no fuso do navegador', () => {
  it('meia-noite de SP é 03:00 UTC (SP = UTC-3, sem horário de verão) quando o instante já é tarde em SP', () => {
    // 2026-09-23T14:30:00Z = 11:30 em SP — mesmo dia calendário nos dois fusos
    const now = new Date('2026-09-23T14:30:00Z');
    const start = spStartOfToday(now);
    expect(start.toISOString()).toBe('2026-09-23T03:00:00.000Z');
  });

  it('vira o dia em SP ANTES de virar em UTC — instante de madrugada UTC ainda é "ontem" em SP', () => {
    // 2026-09-23T02:00:00Z = 2026-09-22T23:00:00 em SP — ainda dia 22 lá,
    // mesmo já sendo dia 23 em UTC. Um cálculo ingênuo (truncar a data UTC)
    // erraria isso por um dia inteiro.
    const now = new Date('2026-09-23T02:00:00Z');
    const start = spStartOfToday(now);
    expect(start.toISOString()).toBe('2026-09-22T03:00:00.000Z');
  });

  it('spYesterdayRange devolve [ontem 00:00, hoje 00:00) em SP', () => {
    const now = new Date('2026-09-23T14:30:00Z');
    const { start, end } = spYesterdayRange(now);
    expect(start.toISOString()).toBe('2026-09-22T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-23T03:00:00.000Z');
  });

  it('fmtSpDate formata em DD/MM/AAAA, no fuso de SP', () => {
    // 2026-01-01T01:30:00Z = 2025-12-31T22:30:00 em SP — ano anterior
    expect(fmtSpDate(new Date('2026-01-01T01:30:00Z'))).toBe('31/12/2025');
    expect(fmtSpDate(new Date('2026-09-23T14:30:00Z'))).toBe('23/09/2026');
  });
});

describe('formatação de horários da API — sempre São Paulo, com qualquer fuso no navegador', () => {
  it('texto SEM fuso é UTC (coluna sem timezone), não hora local do navegador', () => {
    // 22:00 UTC = 19:00 em SP. Lido como "hora local", o painel mostraria 22:00.
    expect(fmtSpDateTime('2026-09-23T22:00:00')).toBe('23/09/2026 19:00');
    expect(fmtSpDateTime('2026-09-23 22:00:00')).toBe('23/09/2026 19:00');
    expect(fmtSpDateTime('2026-09-23T22:00:00.123456')).toBe('23/09/2026 19:00');
  });

  it('texto com Z ou offset dá o mesmo instante', () => {
    expect(fmtSpDateTime('2026-09-23T22:00:00Z')).toBe('23/09/2026 19:00');
    expect(fmtSpDateTime('2026-09-23T22:00:00+00:00')).toBe('23/09/2026 19:00');
    expect(fmtSpDateTime('2026-09-23T19:00:00-03:00')).toBe('23/09/2026 19:00');
  });

  it('vira o dia em SP antes de UTC e mostra segundos quando pedido', () => {
    expect(fmtSpDateTime('2026-09-24T02:30:15Z', { seconds: true })).toBe('23/09/2026 23:30:15');
    expect(fmtSpDay('2026-09-24T02:30:15Z')).toBe('23/09/2026');
    expect(fmtSpDateTime('2026-09-24T02:30:15Z', { shortYear: true })).toBe('23/09/26 23:30');
  });

  it('data pura (AAAA-MM-DD) é dia de calendário: não sofre conversão de fuso', () => {
    expect(fmtSpDay('2020-01-01')).toBe('01/01/2020');
    expect(fmtSpDay('2020-01-01', { shortYear: true })).toBe('01/01/20');
  });

  it('vazio ou inválido vira travessão', () => {
    expect(fmtSpDateTime(null)).toBe('—');
    expect(fmtSpDateTime('lixo')).toBe('—');
    expect(fmtSpDay(undefined)).toBe('—');
  });

  it('parseInstant devolve instantes corretos', () => {
    expect(parseInstant('2026-09-23T22:00:00')!.toISOString()).toBe('2026-09-23T22:00:00.000Z');
    expect(parseInstant('2026-09-23T22:00:00Z')!.toISOString()).toBe('2026-09-23T22:00:00.000Z');
    expect(parseInstant('')).toBeNull();
  });

  it('spDayBounds: o dia escolhido é o dia de SP (00:00:00 a 23:59:59), não o do navegador', () => {
    const b = spDayBounds('2026-09-23')!;
    expect(b.start.toISOString()).toBe('2026-09-23T03:00:00.000Z');
    expect(b.end.toISOString()).toBe('2026-09-24T02:59:59.000Z');
    expect(spDayBounds('23/09/2026')).toBeNull();
  });
});

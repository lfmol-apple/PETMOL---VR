import { describe, expect, it } from 'vitest';
import { spStartOfToday, spYesterdayRange, fmtSpDate } from './spTime';

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

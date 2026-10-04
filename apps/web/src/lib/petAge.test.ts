import { describe, expect, it } from 'vitest';
import { ageGroupFromBirthDate } from './petAge';

const TODAY = new Date(2026, 9, 4); // 04/10/2026

describe('ageGroupFromBirthDate', () => {
  it('menos de 1 ano é filhote', () => {
    expect(ageGroupFromBirthDate('2026-03-01', TODAY)).toBe('puppy');
  });

  it('exatamente 1 ano já é adulto', () => {
    expect(ageGroupFromBirthDate('2025-10-04', TODAY)).toBe('adult');
  });

  it('6 anos e 11 meses ainda é adulto', () => {
    expect(ageGroupFromBirthDate('2019-11-01', TODAY)).toBe('adult');
  });

  it('7 anos completos já é idoso', () => {
    expect(ageGroupFromBirthDate('2019-10-04', TODAY)).toBe('senior');
  });

  it('aniversário ainda não chegou neste ano — não conta o ano corrente', () => {
    // nasceu há "quase 7 anos" (6 anos e 11 meses) — não vira idoso antes da hora
    expect(ageGroupFromBirthDate('2019-11-10', TODAY)).toBe('adult');
  });

  it('data vazia ou inválida devolve string vazia', () => {
    expect(ageGroupFromBirthDate('', TODAY)).toBe('');
    expect(ageGroupFromBirthDate('lixo', TODAY)).toBe('');
  });

  it('data no futuro devolve string vazia (não deveria acontecer, mas não quebra)', () => {
    expect(ageGroupFromBirthDate('2027-01-01', TODAY)).toBe('');
  });
});

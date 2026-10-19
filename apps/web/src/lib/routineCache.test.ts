import { beforeEach, describe, expect, it } from 'vitest';
import { readRoutineCache, writeRoutineCache } from './routineCache';

beforeEach(() => localStorage.clear());

describe('routineCache', () => {
  it('guarda e lê o último estado por chave', () => {
    writeRoutineCache('banho_p1', 'scheduled');
    writeRoutineCache('banho_p2', 'overdue');
    expect(readRoutineCache<string>('banho_p1')).toBe('scheduled');
    expect(readRoutineCache<string>('banho_p2')).toBe('overdue');
    expect(readRoutineCache('inexistente')).toBeNull();
  });
  it('null apaga', () => {
    writeRoutineCache('walk_p1', { enabled: true });
    writeRoutineCache('walk_p1', null);
    expect(readRoutineCache('walk_p1')).toBeNull();
  });
  it('JSON quebrado não derruba', () => {
    localStorage.setItem('petmol_rotina_cache_v1_x', '{oops');
    expect(readRoutineCache('x')).toBeNull();
  });
});

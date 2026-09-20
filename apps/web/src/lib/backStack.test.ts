import { describe, expect, it, vi } from 'vitest';
import { registerBackHandler, runTopBackHandler } from './backStack';

describe('backStack', () => {
  it('sem overlay aberto → false (Voltar segue o fluxo normal)', () => {
    expect(runTopBackHandler()).toBe(false);
  });
  it('fecha só o overlay do topo, na ordem inversa da abertura', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = registerBackHandler(a);
    const offB = registerBackHandler(b);
    expect(runTopBackHandler()).toBe(true);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    offB();
    expect(runTopBackHandler()).toBe(true);
    expect(a).toHaveBeenCalledTimes(1);
    offA();
    expect(runTopBackHandler()).toBe(false);
  });
  it('desregistrar um overlay do meio não afeta os demais', () => {
    const a = vi.fn(); const b = vi.fn(); const c = vi.fn();
    const offA = registerBackHandler(a); const offB = registerBackHandler(b); const offC = registerBackHandler(c);
    offB();
    runTopBackHandler();
    expect(c).toHaveBeenCalledTimes(1);
    offC();
    runTopBackHandler();
    expect(a).toHaveBeenCalledTimes(1);
    offA();
  });
});

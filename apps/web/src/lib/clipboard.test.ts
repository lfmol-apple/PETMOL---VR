import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

describe('copyText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error limpeza
    delete navigator.clipboard;
  });

  it('usa navigator.clipboard quando disponível', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await expect(copyText('PETTMOL')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('PETTMOL');
  });

  it('cai no execCommand quando navigator.clipboard falha', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const exec = vi.fn().mockReturnValue(true);
    document.execCommand = exec as typeof document.execCommand;

    await expect(copyText('PETTMOL')).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('retorna false quando nada funciona, sem lançar', async () => {
    // @ts-expect-error sem clipboard
    delete navigator.clipboard;
    // @ts-expect-error execCommand ausente
    delete document.execCommand;

    await expect(copyText('PETTMOL')).resolves.toBe(false);
  });
});

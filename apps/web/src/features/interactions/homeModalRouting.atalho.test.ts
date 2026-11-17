import { describe, expect, it } from 'vitest';
import { resolveHomeDeepLinkDestination } from './homeModalRouting';

describe('deep link da Home — atalho "Mantenha o PETMOL gratuito"', () => {
  it('?modal=atalho abre o atalho da campanha', () => {
    expect(resolveHomeDeepLinkDestination('atalho', null)).toEqual({ kind: 'free-shortcut' });
  });

  it('não muda os outros destinos', () => {
    expect(resolveHomeDeepLinkDestination('loja', null)).toEqual({ kind: 'shopping' });
    expect(resolveHomeDeepLinkDestination('food', null)).not.toEqual({ kind: 'free-shortcut' });
  });
});

import { describe, expect, it } from 'vitest';
import { resolveHomeDeepLinkDestination } from './homeModalRouting';

describe('deep link da Home — Lojas (notificações de oferta/cupom do admin)', () => {
  it('?modal=loja (e apelidos) abre a Loja do Pet', () => {
    for (const modal of ['loja', 'lojas', 'shopping', 'store']) {
      expect(resolveHomeDeepLinkDestination(modal, null)).toEqual({ kind: 'shopping' });
    }
  });

  it('os destinos antigos continuam iguais', () => {
    expect(resolveHomeDeepLinkDestination('food', null)).not.toEqual({ kind: 'shopping' });
    expect(resolveHomeDeepLinkDestination(null, null)).toBeNull();
  });
});

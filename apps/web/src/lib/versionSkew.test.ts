import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimReloadForVersion, hasReloadedForVersion } from './versionSkew';

describe('versionSkew — livro-razão compartilhado de reload por versão', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('primeira reclamação de uma versão tem sucesso e marca como reclamada', () => {
    expect(hasReloadedForVersion('sha-a')).toBe(false);
    expect(claimReloadForVersion('sha-a')).toBe(true);
    expect(hasReloadedForVersion('sha-a')).toBe(true);
  });

  it('segunda reclamação da MESMA versão falha — é o mecanismo anti-loop', () => {
    expect(claimReloadForVersion('sha-b')).toBe(true);
    expect(claimReloadForVersion('sha-b')).toBe(false);
    expect(claimReloadForVersion('sha-b')).toBe(false);
  });

  it('coordena BuildVersionGate e ChunkReloadGuard: quem chega primeiro reclama, o outro recua', () => {
    // Simula BuildVersionGate reclamando primeiro.
    const buildVersionGateClaimed = claimReloadForVersion('sha-c');
    // ChunkReloadGuard tenta a mesma versão logo em seguida.
    const chunkGuardClaimed = claimReloadForVersion('sha-c');
    expect(buildVersionGateClaimed).toBe(true);
    expect(chunkGuardClaimed).toBe(false);
  });

  it('versões diferentes são independentes', () => {
    expect(claimReloadForVersion('sha-d')).toBe(true);
    expect(claimReloadForVersion('sha-e')).toBe(true);
  });

  describe('fail-safe quando sessionStorage não está disponível', () => {
    let originalGetItem: typeof Storage.prototype.getItem;
    let originalSetItem: typeof Storage.prototype.setItem;

    beforeEach(() => {
      originalGetItem = Storage.prototype.getItem;
      originalSetItem = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage bloqueado (modo privado)');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage bloqueado (modo privado)');
      });
    });

    afterEach(() => {
      Storage.prototype.getItem = originalGetItem;
      Storage.prototype.setItem = originalSetItem;
    });

    it('claimReloadForVersion NUNCA devolve true sem conseguir gravar a marca — não autoriza reload', () => {
      // Antes desta correção o código antigo seguia e recarregava mesmo
      // sem conseguir gravar; isso pode causar loop infinito se o erro
      // persistir. O comportamento fail-safe é recusar o reload.
      expect(claimReloadForVersion('sha-sem-storage')).toBe(false);
    });

    it('hasReloadedForVersion trata "não sei" como "já recarregado" (lado seguro)', () => {
      expect(hasReloadedForVersion('sha-sem-storage')).toBe(true);
    });
  });
});

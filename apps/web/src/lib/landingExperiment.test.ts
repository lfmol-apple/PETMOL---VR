import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetLandingVariantMemo, EXPERIMENT_ID, getLandingVariant, secureRandomVariant } from './landingExperiment';

beforeEach(() => {
  localStorage.clear();
  document.cookie = 'petmol_lp_variant=; max-age=0; path=/';
  __resetLandingVariantMemo();
});
afterEach(() => vi.restoreAllMocks());

describe('atribuição da variante A/B', () => {
  it('sorteia 50/50: com bytes pares dá A, ímpares dá B (distribuição uniforme sobre 1 bit)', () => {
    const counts = { A: 0, B: 0 };
    for (let i = 0; i < 2000; i++) {
      vi.spyOn(crypto, 'getRandomValues').mockImplementationOnce(((arr: Uint8Array) => { arr[0] = i % 256; return arr; }) as never);
      counts[secureRandomVariant()]++;
    }
    expect(counts.A).toBe(1000);
    expect(counts.B).toBe(1000);
  });

  it('a variante sorteada persiste (localStorage + cookie) e não muda ao atualizar a página', () => {
    const first = getLandingVariant({ random: () => 'B' });
    expect(first).toMatchObject({ variant: 'B', preview: false, persisted: true });
    expect(JSON.parse(localStorage.getItem('petmol_exp_landing_v1')!)).toMatchObject({ experiment_id: EXPERIMENT_ID, variant: 'B' });
    expect(document.cookie).toContain('petmol_lp_variant=B');

    __resetLandingVariantMemo(); // "atualizou a página": memória zerada, armazenamento permanece
    const again = getLandingVariant({ random: () => 'A' }); // mesmo que o sorteio desse A, mantém B
    expect(again.variant).toBe('B');
  });

  it('se só o cookie sobreviveu, mantém a variante e regrava o localStorage', () => {
    document.cookie = 'petmol_lp_variant=A; path=/';
    const v = getLandingVariant({ random: () => 'B' });
    expect(v.variant).toBe('A');
    expect(JSON.parse(localStorage.getItem('petmol_exp_landing_v1')!).variant).toBe('A');
  });

  it('valor gravado de OUTRO experimento é ignorado (sorteia de novo)', () => {
    localStorage.setItem('petmol_exp_landing_v1', JSON.stringify({ experiment_id: 'antigo', variant: 'B' }));
    expect(getLandingVariant({ random: () => 'A' }).variant).toBe('A');
  });

  it('pré-visualização (?ab=B) mostra a versão pedida SEM gravar nada e marca preview', () => {
    const v = getLandingVariant({ search: '?ab=b' });
    expect(v).toEqual({ variant: 'B', preview: true, persisted: false });
    expect(localStorage.getItem('petmol_exp_landing_v1')).toBeNull();
    expect(document.cookie).not.toContain('petmol_lp_variant');
  });

  it('mensagem por anúncio (forcePreview) não entra na estatística e não sorteia', () => {
    const v = getLandingVariant({ forcePreview: true, random: () => 'B' });
    expect(v.preview).toBe(true);
    expect(localStorage.getItem('petmol_exp_landing_v1')).toBeNull();
  });

  it('sem armazenamento (navegação privada): continua funcionando e mantém a mesma variante na página', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    const v = getLandingVariant({ random: () => 'B' });
    expect(v.variant).toBe('B');
    expect(v.persisted).toBe(false);
    expect(getLandingVariant({ random: () => 'A' }).variant).toBe('B'); // memo: não alterna durante a página
  });
});

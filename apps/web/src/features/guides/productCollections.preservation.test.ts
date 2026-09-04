import { describe, expect, it } from 'vitest';
import { AMAZON_BR_TRACKING_ID, PRODUCT_COLLECTIONS, getProductsForGuide } from './productCollections';

/**
 * Trava de regressão: os links de afiliado da Amazon fornecidos pelo usuário
 * são PRESERVADOS BYTE A BYTE. Nenhuma tarefa futura pode reescrevê-los para
 * amazon.com.br/dp/..., anexar ?tag= à mão, trocar o Tracking ID ou remover
 * um produto sem que este teste acuse.
 *
 * Se um link mudar de propósito (novo SiteStripe do usuário), atualize o mapa
 * abaixo DE PROPÓSITO, no mesmo commit, com o link novo verbatim.
 */

// asin -> affiliateUrl exato, como recebido do usuário (Fase 2).
const EXPECTED: Record<string, string> = {
  B07PZWDZT9: 'https://link.amazon/B01UyCiQH',
  B0GRD1KQH1: 'https://link.amazon/B00HsnF63',
  B07WRS2BQ5: 'https://link.amazon/B0iuJIVms',
  B0GR1LMXWC: 'https://link.amazon/B05WurfJl',
  B08CSG5734: 'https://link.amazon/B02jNloAn',
  B07WRS2V22: 'https://link.amazon/B03D6LBlL',
  B07HFFX8V9: 'https://link.amazon/B02fgXjb1',
  B07YP1K82Z: 'https://link.amazon/B0iUSOJSU',
  B07YXF387Y: 'https://link.amazon/B0cXybH8t',
  B084T6QCH6: 'https://link.amazon/B09OopcMD',
  B0CKWBJ2CR: 'https://link.amazon/B04grvCKY',
  B07HFFL237: 'https://link.amazon/B0b33wgTH',
  B0BWQ5VHJQ: 'https://link.amazon/B077pwP4y',
  B0BWQ3L95W: 'https://link.amazon/B01Fx5g91',
  B0BYWGBPHH: 'https://link.amazon/B0gLSEx8Q',
  B08T1TYQ71: 'https://link.amazon/B0j0cmH80',
  B07XQ7M2P7: 'https://link.amazon/B0cqEJpNZ',
  B0CTKQ8J6K: 'https://link.amazon/B07OsvcKc',
  B09DR4BDJB: 'https://link.amazon/B0iT8urc1',
  B0DW1M6J73: 'https://link.amazon/B08kuId4B',
};

const ALL_ITEMS = PRODUCT_COLLECTIONS.flatMap((c) => c.items);

describe('preservação dos links de afiliado Amazon (regressão)', () => {
  it('o Tracking ID Amazon Brasil não mudou', () => {
    expect(AMAZON_BR_TRACKING_ID).toBe('amazonpetmol-20');
  });

  it('continuam sendo exatamente os 20 produtos, um ASIN cada', () => {
    expect(ALL_ITEMS).toHaveLength(20);
    expect(new Set(ALL_ITEMS.map((i) => i.asin)).size).toBe(20);
  });

  it('cada affiliateUrl bate byte a byte com o link original do usuário', () => {
    for (const item of ALL_ITEMS) {
      expect(EXPECTED[item.asin], `ASIN ${item.asin} não está no mapa esperado`).toBeDefined();
      expect(item.affiliateUrl, `link do ASIN ${item.asin}`).toBe(EXPECTED[item.asin]);
    }
    // e o mapa não tem sobras (nenhum produto foi removido)
    for (const asin of Object.keys(EXPECTED)) {
      expect(ALL_ITEMS.some((i) => i.asin === asin), `ASIN ${asin} sumiu do catálogo`).toBe(true);
    }
  });

  it('nenhum link foi transformado em URL longa da Amazon nem recebeu parâmetro à mão', () => {
    for (const item of ALL_ITEMS) {
      expect(item.affiliateUrl).toMatch(/^https:\/\/link\.amazon\/[A-Za-z0-9]+$/);
      expect(item.affiliateUrl).not.toContain('amazon.com.br');
      expect(item.affiliateUrl).not.toContain('/dp/');
      expect(item.affiliateUrl.toLowerCase()).not.toContain('tag=');
    }
  });

  it('getProductsForGuide devolve no máximo 3 e só produtos com relação editorial real', () => {
    const tapete = getProductsForGuide('como-escolher-tapete-higienico-cachorro');
    expect(tapete.length).toBeGreaterThan(0);
    expect(tapete.length).toBeLessThanOrEqual(3);
    for (const p of tapete) {
      expect(p.relatedGuideSlug).toBe('como-escolher-tapete-higienico-cachorro');
      expect(EXPECTED[p.asin]).toBe(p.affiliateUrl);
    }
    // guia sem produto relacionado não inventa vitrine
    expect(getProductsForGuide('quanto-custa-alimentar-cachorro-por-mes')).toEqual([]);
  });
});

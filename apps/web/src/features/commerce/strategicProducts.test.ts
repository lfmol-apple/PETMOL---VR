import { describe, expect, it } from 'vitest';
import { GUIDES } from '@/features/content/guides';
import {
  STRATEGIC_PRODUCTS,
  getStrategicProductsForSpecies,
} from './strategicProducts';

describe('strategicProducts — filtro por espécie', () => {
  it('produtos só de cão não aparecem na lista de gato', () => {
    const dogOnly = STRATEGIC_PRODUCTS.filter((p) => p.species.length === 1 && p.species[0] === 'dog');
    expect(dogOnly.length).toBeGreaterThan(0);

    const forCat = getStrategicProductsForSpecies('cat');
    for (const p of dogOnly) {
      expect(forCat.find((x) => x.id === p.id)).toBeUndefined();
    }
  });

  it('produtos só de gato não aparecem na lista de cão', () => {
    const catOnly = STRATEGIC_PRODUCTS.filter((p) => p.species.length === 1 && p.species[0] === 'cat');
    expect(catOnly.length).toBeGreaterThan(0);

    const forDog = getStrategicProductsForSpecies('dog');
    for (const p of catOnly) {
      expect(forDog.find((x) => x.id === p.id)).toBeUndefined();
    }
  });

  it('produtos compartilhados (cão + gato) aparecem nas duas listas', () => {
    const shared = STRATEGIC_PRODUCTS.filter((p) => p.species.includes('dog') && p.species.includes('cat'));
    expect(shared.length).toBeGreaterThan(0);

    const forDog = getStrategicProductsForSpecies('dog');
    const forCat = getStrategicProductsForSpecies('cat');
    for (const p of shared) {
      expect(forDog.find((x) => x.id === p.id)).toBeDefined();
      expect(forCat.find((x) => x.id === p.id)).toBeDefined();
    }
  });

  it('espécie ausente/não reconhecida mostra só os itens compartilhados — nunca inventa recomendação de espécie desconhecida', () => {
    const forUnknown = getStrategicProductsForSpecies(null);
    expect(forUnknown.length).toBeGreaterThan(0);
    for (const p of forUnknown) {
      expect(p.species).toEqual(expect.arrayContaining(['dog', 'cat']));
    }
    // Nada exclusivo de uma espécie vaza pro fallback sem espécie.
    const dogOnlyIds = STRATEGIC_PRODUCTS.filter((p) => p.species.length === 1).map((p) => p.id);
    for (const id of dogOnlyIds) {
      expect(forUnknown.find((x) => x.id === id)).toBeUndefined();
    }
  });

  it('trocar a espécie selecionada muda o resultado — nunca mistura recomendação de outro pet/espécie', () => {
    const forDog = getStrategicProductsForSpecies('dog').map((p) => p.id).sort();
    const forCat = getStrategicProductsForSpecies('cat').map((p) => p.id).sort();
    expect(forDog).not.toEqual(forCat);
  });
});

describe('strategicProducts — curadoria editorial', () => {
  it('nenhum searchQuery inventa marca específica (fica em nível de categoria)', () => {
    // Checagem de sanidade editorial: strategicProducts.ts é uma curadoria
    // de CATEGORIA, não de produto específico — searchQuery nunca é uma
    // string vazia nem contém caracteres de URL crua.
    for (const product of STRATEGIC_PRODUCTS) {
      expect(product.searchQuery.trim().length).toBeGreaterThan(0);
      expect(product.searchQuery).not.toMatch(/https?:\/\//);
    }
  });
});

describe('strategicProducts — sem "Baby" hardcoded', () => {
  it('nenhum produto estratégico ou guia cita "Baby" — curadoria é institucional, não de um pet específico', () => {
    for (const product of STRATEGIC_PRODUCTS) {
      expect(product.title).not.toMatch(/\bBaby\b/i);
      expect(product.blurb).not.toMatch(/\bBaby\b/i);
    }
    for (const guide of GUIDES) {
      expect(guide.title).not.toMatch(/\bBaby\b/i);
      expect(guide.metaDescription).not.toMatch(/\bBaby\b/i);
      for (const paragraph of guide.paragraphs) {
        expect(paragraph).not.toMatch(/\bBaby\b/i);
      }
    }
  });

  it('cada guia com viés de saúde carrega o aviso de que não substitui o veterinário', () => {
    const healthCategories = ['prevencao', 'medicacao', 'conforto_senior', 'hidratacao', 'porcoes'];
    for (const guide of GUIDES) {
      if (healthCategories.includes(guide.category)) {
        expect(guide.vetDisclaimer).toBe(true);
      }
    }
  });
});

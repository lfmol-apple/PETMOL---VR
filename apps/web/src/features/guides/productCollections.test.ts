import { describe, expect, it } from 'vitest';
import {
  AMAZON_BR_TRACKING_ID,
  PRODUCT_COLLECTIONS,
} from './productCollections';
import { getGuideBySlug } from './index';

const ALL_ITEMS = PRODUCT_COLLECTIONS.flatMap((c) => c.items);

const FORBIDDEN = [
  /melhor\b/i,
  /imperd[ií]vel/i,
  /n[º°]\s*1/i,
  /campe[ãa]o de vendas/i,
  /mais vendido/i,
  /recomendado pela amazon/i,
  /garantid[oa]/i,
  /produto perfeito/i,
  /oferta/i,
  /aproveite/i,
  /[uú]ltimas unidades/i,
  /comprar agora/i,
  /R\$\s?\d/,
  /\d+\s*estrela/i,
  /\d+\s*avalia/i,
  /\d+\s*review/i,
  /desconto/i,
];

describe('produtos selecionados pelo PETMOL — Fase 2 Amazon Brasil', () => {
  it('são exatamente 20 produtos', () => {
    expect(ALL_ITEMS).toHaveLength(20);
  });

  it('cada ASIN aparece uma única vez', () => {
    const asins = ALL_ITEMS.map((i) => i.asin);
    expect(new Set(asins).size).toBe(20);
    for (const a of asins) expect(a).toMatch(/^[A-Z0-9]{10}$/);
  });

  it('cada link de afiliado aparece uma única vez e é um link.amazon/* preservado', () => {
    const urls = ALL_ITEMS.map((i) => i.affiliateUrl);
    expect(new Set(urls).size).toBe(20);
    for (const u of urls) expect(u).toMatch(/^https:\/\/link\.amazon\/[A-Za-z0-9]+$/);
  });

  it('nenhum link foi reescrito para amazon.com.br/dp/ nem recebeu ?tag= à mão', () => {
    for (const i of ALL_ITEMS) {
      expect(i.affiliateUrl).not.toContain('amazon.com.br');
      expect(i.affiliateUrl).not.toContain('/dp/');
      expect(i.affiliateUrl).not.toContain('tag=');
    }
  });

  it('todo produto tem name, editorialNote e merchant amazon-br', () => {
    for (const i of ALL_ITEMS) {
      expect(i.name.trim().length).toBeGreaterThan(3);
      expect(i.editorialNote.trim().length).toBeGreaterThan(10);
      expect(i.merchant).toBe('amazon-br');
    }
  });

  it('name e editorialNote não usam preço, rating, review nem superlativo de venda', () => {
    for (const i of ALL_ITEMS) {
      for (const re of FORBIDDEN) {
        expect(`${i.name} ${i.editorialNote}`, `${i.asin}: ${i.name}`).not.toMatch(re);
      }
    }
  });

  it('relatedGuideSlug, quando presente, aponta para um guia real', () => {
    for (const i of ALL_ITEMS) {
      if (i.relatedGuideSlug) {
        expect(getGuideBySlug(i.relatedGuideSlug), i.relatedGuideSlug).toBeDefined();
      }
    }
  });

  it('o Tracking ID Amazon Brasil é o correto', () => {
    expect(AMAZON_BR_TRACKING_ID).toBe('amazonpetmol-20');
  });

  it('cobre os 5 núcleos e nenhum produto duplicado entre núcleos', () => {
    expect(PRODUCT_COLLECTIONS.map((c) => c.id)).toEqual([
      'caes',
      'gatos',
      'alimentacao',
      'casa-e-higiene',
      'passeio-e-viagem',
    ]);
    const seen = new Set<string>();
    for (const c of PRODUCT_COLLECTIONS) {
      for (const i of c.items) {
        expect(seen.has(i.asin)).toBe(false);
        seen.add(i.asin);
      }
    }
  });
});

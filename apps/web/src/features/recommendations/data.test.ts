import { describe, expect, it } from 'vitest';
import {
  AMAZON_REQUIRED_STATEMENT,
  RECOMMENDATIONS,
  RECOMMENDATION_CATEGORIES,
  destinationOf,
  getPopulatedCategories,
  getRecommendationsNeedingMetadata,
} from './data';

/** The 24 links that existed before batch 3 — must be present, byte-for-byte,
 *  unchanged, in the same relative order. */
const LINKS_BEFORE_BATCH_3 = [
  'https://amzn.to/3Uzcsf4', 'https://amzn.to/3SmPhUL', 'https://amzn.to/4gGI8qi',
  'https://amzn.to/4cXWj9l', 'https://amzn.to/4x6HXuG', 'https://amzn.to/4cplcKW',
  'https://amzn.to/4qR9sqC', 'https://amzn.to/4yge3VH', 'https://amzn.to/4gwMD8b',
  'https://amzn.to/46zcuWZ', 'https://amzn.to/4qV30Pu', 'https://amzn.to/3SN1ORt',
  'https://amzn.to/4yiLVkX', 'https://amzn.to/4gKkNUH', 'https://amzn.to/4i36zk9',
  'https://amzn.to/46ldoqh', 'https://amzn.to/4iHq6qo', 'https://amzn.to/4iIjtnL',
  'https://amzn.to/4qMsUVk', 'https://amzn.to/4i7f6CE', 'https://amzn.to/4gP5bzl',
  'https://amzn.to/3SkGtyI', 'https://amzn.to/3UsMtGd', 'https://amzn.to/4x5Qs9o',
];

/**
 * The official Special Links exactly as delivered (batch 1 = 11, batch 2 = +13 = 24) by the PETMOL Amazon
 * Associates account (order preserved). This array is the contract: the data
 * source must render these strings verbatim, with nothing added or rebuilt.
 */
const OFFICIAL_LINKS = [
  // batch 1
  'https://amzn.to/3Uzcsf4',
  'https://amzn.to/3SmPhUL',
  'https://amzn.to/4gGI8qi',
  'https://amzn.to/4cXWj9l',
  'https://amzn.to/4x6HXuG',
  'https://amzn.to/4cplcKW',
  'https://amzn.to/4qR9sqC',
  'https://amzn.to/4yge3VH',
  'https://amzn.to/4gwMD8b',
  'https://amzn.to/46zcuWZ',
  'https://amzn.to/4qV30Pu',
  // batch 2
  'https://amzn.to/3SN1ORt',
  'https://amzn.to/4yiLVkX',
  'https://amzn.to/4gKkNUH',
  'https://amzn.to/4i36zk9',
  'https://amzn.to/46ldoqh',
  'https://amzn.to/4iHq6qo',
  'https://amzn.to/4iIjtnL',
  'https://amzn.to/4qMsUVk',
  'https://amzn.to/4i7f6CE',
  'https://amzn.to/4gP5bzl',
  'https://amzn.to/3SkGtyI',
  'https://amzn.to/3UsMtGd',
  'https://amzn.to/4x5Qs9o',
  // batch 3
  'https://amzn.to/4qQ9tep',
  'https://amzn.to/4x6LaKK',
  'https://amzn.to/46GyY8t',
  'https://amzn.to/4yfE8V0',
  'https://amzn.to/3T3zWIV',
  'https://amzn.to/4xC7CfM',
  'https://amzn.to/4cmmRkv',
  'https://amzn.to/4A9hkIn',
  'https://amzn.to/4iGLk7U',
];

describe('recommendations data — official Amazon Special Links', () => {
  it('has exactly 33 recommendations', () => {
    expect(RECOMMENDATIONS).toHaveLength(33);
  });

  it('renders the 33 official amzn.to links verbatim, in order, with no manipulation', () => {
    expect(RECOMMENDATIONS.map((r) => r.affiliateUrl)).toEqual(OFFICIAL_LINKS);
  });

  it('every affiliate URL is an https amzn.to short link', () => {
    for (const r of RECOMMENDATIONS) {
      const u = new URL(r.affiliateUrl);
      expect(u.protocol).toBe('https:');
      expect(u.hostname).toBe('amzn.to');
    }
  });

  it('no affiliate URL carries a manual tag / query / rebuilt path', () => {
    for (const r of RECOMMENDATIONS) {
      const u = new URL(r.affiliateUrl);
      // SiteStripe short links are bare: https://amzn.to/<code>
      expect(u.search).toBe('');
      expect(u.hash).toBe('');
      expect(r.affiliateUrl).not.toMatch(/[?&]tag=/);
      expect(r.affiliateUrl).not.toMatch(/amazon\.com/);
      expect(r.affiliateUrl).not.toMatch(/\/dp\//);
    }
  });

  it('no two recommendations share the same Special Link (33 distinct)', () => {
    const links = RECOMMENDATIONS.map((r) => r.affiliateUrl);
    expect(new Set(links).size).toBe(33);
  });

  it('every recommendation has a stable id and a real category', () => {
    const catIds = new Set(RECOMMENDATION_CATEGORIES.map((c) => c.id));
    const ids = new Set<string>();
    for (const r of RECOMMENDATIONS) {
      expect(r.id).toMatch(/^rec-\d{2}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(catIds.has(r.category)).toBe(true);
      expect(r.title.trim().length).toBeGreaterThan(0);
      expect(r.blurb.trim().length).toBeGreaterThan(0);
    }
  });

  it('carries no price, rating or review-count data anywhere', () => {
    const blob = JSON.stringify(RECOMMENDATIONS).toLowerCase();
    expect(blob).not.toMatch(/\$\s?\d/);
    expect(blob).not.toMatch(/\bR\$\s?\d/);
    expect(blob).not.toMatch(/\b\d[.,]\d\s*(stars?|estrelas?|rating)\b/);
    expect(blob).not.toMatch(/\b\d+\s*reviews?\b/);
    expect(blob).not.toMatch(/best price|melhor preço|in stock|free shipping/);
  });

  it('flags — and does not invent metadata for — links that could not be identified', () => {
    const pending = getRecommendationsNeedingMetadata();
    // rec-01 / rec-03 (same /dp/ ASIN) and rec-08 could not be resolved to a
    // named product without fetching the product page.
    expect(pending.map((r) => r.id).sort()).toEqual(['rec-01', 'rec-03', 'rec-08']);
    for (const r of pending) {
      expect(r.title).not.toMatch(/B0[A-Z0-9]{8}/); // no ASIN leaked as a title
    }
  });

  it('keeps every pre-batch-3 Special Link intact, byte-for-byte, in order', () => {
    expect(RECOMMENDATIONS.slice(0, 24).map((r) => r.affiliateUrl)).toEqual(LINKS_BEFORE_BATCH_3);
  });

  it('batch 3 (rec-25..rec-33) are all product links, none flagged unresolved', () => {
    const b3 = RECOMMENDATIONS.filter((r) => Number(r.id.slice(4)) >= 25);
    expect(b3).toHaveLength(9);
    for (const r of b3) {
      expect(destinationOf(r)).toBe('product');
      expect(r.needsEditorialMetadata).toBeUndefined();
    }
  });

  it('destinationOf defaults to "product" and only returns known values', () => {
    for (const r of RECOMMENDATIONS) {
      expect(['product', 'collection']).toContain(destinationOf(r));
    }
  });

  it('only surfaces categories that actually have picks', () => {
    const populated = getPopulatedCategories().map((c) => c.id);
    for (const id of populated) {
      expect(RECOMMENDATIONS.some((r) => r.category === id)).toBe(true);
    }
  });

  it('exposes the exact Amazon Associates statement', () => {
    expect(AMAZON_REQUIRED_STATEMENT).toBe(
      'As an Amazon Associate I earn from qualifying purchases.',
    );
  });
});

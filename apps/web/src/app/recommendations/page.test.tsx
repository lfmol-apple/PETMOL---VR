import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import RecommendationsPage, { metadata } from './page';
import { isPublic } from '../../middleware';
import sitemap from '../sitemap';
import { RECOMMENDATIONS } from '@/features/recommendations/data';

const OFFICIAL_LINKS = RECOMMENDATIONS.map((r) => r.affiliateUrl);

describe('/recommendations — public English Amazon Associates page', () => {
  it('is a public route (no login redirect)', () => {
    expect(isPublic('/recommendations')).toBe(true);
    expect(isPublic('/recommendations/')).toBe(true);
  });

  it('is listed in the sitemap', async () => {
    const urls = (await sitemap()).map((e) => new URL(e.url).pathname);
    expect(urls).toContain('/recommendations');
    // /guias must still be there — this page does not replace it
    expect(urls).toContain('/guias');
  });

  it('has English, canonical metadata', () => {
    expect(metadata.title).toBe('PETMOL Recommendations | Products We Like');
    expect(String(metadata.description)).toMatch(/curated products/i);
    expect((metadata.alternates as { canonical: string }).canonical).toMatch(
      /\/recommendations$/,
    );
    expect((metadata.openGraph as { locale?: string })?.locale).toBe('en_US');
  });

  it('renders all 11 Special Links exactly as provided, once each', () => {
    const { container } = render(<RecommendationsPage />);
    const hrefs = Array.from(container.querySelectorAll('a[href^="https://amzn.to/"]')).map(
      (a) => a.getAttribute('href'),
    );
    expect(hrefs.sort()).toEqual([...OFFICIAL_LINKS].sort());
    expect(new Set(hrefs).size).toBe(11);
  });

  it('every Amazon link is target=_blank with rel sponsored nofollow noopener noreferrer', () => {
    const { container } = render(<RecommendationsPage />);
    const links = container.querySelectorAll('a[href^="https://amzn.to/"]');
    expect(links.length).toBe(11);
    links.forEach((a) => {
      expect(a.getAttribute('target')).toBe('_blank');
      const rel = (a.getAttribute('rel') || '').split(/\s+/);
      expect(rel).toEqual(expect.arrayContaining(['sponsored', 'nofollow', 'noopener', 'noreferrer']));
    });
  });

  it('shows the exact required Amazon Associate disclosure', () => {
    const { container } = render(<RecommendationsPage />);
    expect(container.textContent).toContain(
      'As an Amazon Associate I earn from qualifying purchases.',
    );
    expect(container.textContent?.toLowerCase()).toContain('affiliate (paid) links');
  });

  it('does not present itself as an official Amazon store', () => {
    const { container } = render(<RecommendationsPage />);
    const text = (container.textContent || '').toLowerCase();
    // forbidden self-labels from the brief
    expect(text).not.toContain('official amazon store');
    expect(text).not.toContain('petmol amazon store');
    // "amazon store" only ever allowed inside an explicit negation
    const storeHits = text.match(/.{0,12}amazon store/g) || [];
    for (const hit of storeHits) expect(hit).toMatch(/not (an? )?/);
  });

  it('renders no prices, ratings or review counts', () => {
    const { container } = render(<RecommendationsPage />);
    const text = container.textContent || '';
    expect(text).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/\bR\$\s?\d/);
    expect(text).not.toMatch(/\b\d[.,]\d\s*(stars?|rating)/i);
    expect(text).not.toMatch(/\b\d+\s*reviews?\b/i);
  });

  it('CTA text is "View on Amazon"', () => {
    const { container } = render(<RecommendationsPage />);
    const links = container.querySelectorAll('a[href^="https://amzn.to/"]');
    links.forEach((a) => expect(a.textContent).toMatch(/View on Amazon/));
  });
});

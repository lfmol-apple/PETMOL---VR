import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const track = vi.fn();
const mocks = vi.hoisted(() => ({ native: false }));
vi.mock('@/lib/landingEvents', () => ({ trackLandingEvent: (...a: unknown[]) => track(...a) }));
vi.mock('@/lib/nativeApp', () => ({ isNativeAppClient: () => mocks.native }));

import { ORG_ID, WEBSITE_ID, siteJsonLd } from './SiteJsonLd';
import { SocialLinks } from './landing/SocialLinks';
import { BRAND_INSTAGRAM_URL, BRAND_YOUTUBE_URL } from '@/lib/brandProfiles';

afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.native = false; });

describe('dados estruturados da marca', () => {
  it('uma única Organization e um único WebSite, ligados por @id, com os perfis oficiais em sameAs', () => {
    const g = siteJsonLd()['@graph'] as Array<Record<string, unknown>>;
    expect(g.filter((n) => n['@type'] === 'Organization')).toHaveLength(1);
    expect(g.filter((n) => n['@type'] === 'WebSite')).toHaveLength(1);
    const org = g.find((n) => n['@type'] === 'Organization')!;
    expect(org['@id']).toBe(ORG_ID);
    expect(org.sameAs).toEqual([BRAND_INSTAGRAM_URL, BRAND_YOUTUBE_URL]);
    const site = g.find((n) => n['@type'] === 'WebSite')!;
    expect(site['@id']).toBe(WEBSITE_ID);
    expect(site.publisher).toEqual({ '@id': ORG_ID });
    expect(site.inLanguage).toBe('pt-BR');
  });
  it('usa as URLs oficiais exatas', () => {
    expect(BRAND_INSTAGRAM_URL).toBe('https://www.instagram.com/pettmol/');
    expect(BRAND_YOUTUBE_URL).toBe('https://www.youtube.com/@petmolinstitucional');
  });
});

describe('SocialLinks', () => {
  it('mostra os dois links oficiais, abre em nova aba com rel seguro e mede o clique', () => {
    render(<SocialLinks placement="home-rodape" />);
    const ig = screen.getByRole('link', { name: 'Instagram' });
    expect(ig.getAttribute('href')).toBe(BRAND_INSTAGRAM_URL);
    expect(ig.getAttribute('target')).toBe('_blank');
    expect(ig.getAttribute('rel')).toContain('noopener');
    fireEvent.click(screen.getByRole('link', { name: 'YouTube' }));
    expect(track).toHaveBeenCalledWith('social_link_click', { network: 'youtube', placement: 'home-rodape' });
  });
  it('não aparece dentro do app nativo', () => {
    mocks.native = true;
    render(<SocialLinks placement="x" />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

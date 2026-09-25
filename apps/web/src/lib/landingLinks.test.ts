import { describe, expect, it } from 'vitest';
import { APP_STORE_BASE, GOOGLE_PLAY_BASE, appStoreUrl, googlePlayUrl } from './landingLinks';
import { detectInAppBrowser, LANDING_COPY, readLandingContext } from './landingContext';

describe('links das lojas', () => {
  it('Google Play: mantém o link oficial e acrescenta o referrer com a UTM do anúncio', () => {
    const u = googlePlayUrl('hero', { utm_source: 'instagram', utm_medium: 'paid', utm_campaign: 'sem-isso', utm_content: 'video1' });
    expect(u.startsWith(GOOGLE_PLAY_BASE + '&referrer=')).toBe(true);
    const ref = decodeURIComponent(u.split('&referrer=')[1]);
    expect(ref).toContain('utm_source=instagram');
    expect(ref).toContain('utm_medium=paid');
    expect(ref).toContain('utm_campaign=sem-isso');
    expect(ref).toContain('utm_content=video1');
    expect(ref).toContain('utm_term=hero');
  });
  it('Google Play sem UTM na URL: usa valores padrão e nunca deixa lixo/valores perigosos no referrer', () => {
    const ref = decodeURIComponent(googlePlayUrl('barra', { utm_source: 'a&b=<script>' }).split('&referrer=')[1]);
    expect(ref).toContain('utm_medium=landing');
    expect(ref).not.toMatch(/[<>]/);
    expect(ref.split('&').every((p) => /^utm_(source|medium|campaign|content|term)=[A-Za-z0-9_.\-~]+$/.test(p))).toBe(true);
  });
  it('App Store: sem token o link é exatamente o oficial; com token leva pt e ct', () => {
    expect(appStoreUrl('hero', {}, '')).toBe(APP_STORE_BASE);
    expect(appStoreUrl('hero', { utm_campaign: 'sem-isso' }, 'TOKEN123')).toBe(`${APP_STORE_BASE}?pt=TOKEN123&ct=sem-isso_hero`);
  });
});

describe('contexto da visita', () => {
  const IG_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/21F90 Instagram 330.0.0.20.107';
  it('reconhece o navegador interno do Instagram e do Facebook', () => {
    expect(detectInAppBrowser(IG_IOS)).toBe('instagram');
    expect(detectInAppBrowser('Mozilla/5.0 [FBAN/FBIOS;FBAV/450.0]')).toBe('facebook');
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) Safari/604.1')).toBe('none');
  });
  it('lê a variação (?c=), a UTM e a presença do fbclid (sem guardar o valor)', () => {
    const c = readLandingContext('?c=sem-isso&utm_source=instagram&utm_campaign=set26&fbclid=abc', IG_IOS);
    expect(c).toMatchObject({ variant: 'sem-isso', iab: 'instagram', hasFbclid: true });
    expect(c.campaign.utm_source).toBe('instagram');
    expect(JSON.stringify(c)).not.toContain('abc');
  });
  it('variação desconhecida ou ausente cai na mensagem padrão', () => {
    expect(readLandingContext('?c=xyz', '').variant).toBe('default');
    expect(readLandingContext('', '').variant).toBe('default');
    expect(LANDING_COPY.default.title.join(' ')).toContain('conhece');
  });
});

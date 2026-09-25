/**
 * Contexto da visita à landing: de onde veio (anúncio do Instagram/Facebook abre a página no
 * navegador interno do app), qual variação de mensagem o anúncio pede (?c=) e os parâmetros de
 * campanha (UTM) — usados para casar a mensagem com o anúncio e medir os cliques.
 */
import type { CampaignParams } from './landingLinks';

export type InAppBrowser = 'instagram' | 'facebook' | 'none';
export type LandingVariant = 'default' | 'vacina' | 'racao' | 'sumido' | 'sem-isso';

export function detectInAppBrowser(ua: string): InAppBrowser {
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'facebook';
  return 'none';
}

const VARIANTS: LandingVariant[] = ['vacina', 'racao', 'sumido', 'sem-isso'];

export interface LandingContext {
  variant: LandingVariant;
  iab: InAppBrowser;
  campaign: CampaignParams;
  hasFbclid: boolean;
}

export function readLandingContext(search: string, ua: string): LandingContext {
  const q = new URLSearchParams(search);
  const c = (q.get('c') || '').toLowerCase();
  const pick = (k: string) => q.get(k) || undefined;
  return {
    variant: (VARIANTS as string[]).includes(c) ? (c as LandingVariant) : 'default',
    iab: detectInAppBrowser(ua),
    campaign: { utm_source: pick('utm_source'), utm_medium: pick('utm_medium'), utm_campaign: pick('utm_campaign'), utm_content: pick('utm_content') },
    hasFbclid: q.has('fbclid'),
  };
}

export interface LandingCopy { title: string[]; subtitle: string }

/** Só promessas que o app cumpre hoje (alertas de vacina/ração/higiene e Pet Sumido). */
export const LANDING_COPY: Record<LandingVariant, LandingCopy> = {
  default: {
    title: ['O PETMOL', 'conhece', 'o seu pet.'],
    subtitle: 'Acompanha a alimentação, as vacinas, os remédios e a proteção — e mostra o que vem a seguir, na hora certa.',
  },
  vacina: {
    title: ['Nunca mais esqueça', 'a vacina do seu pet.'],
    subtitle: 'O PETMOL guarda cada data — vacinas, vermífugo, antipulgas e remédios — e avisa antes do prazo.',
  },
  racao: {
    title: ['A ração vai acabar?', 'O PETMOL avisa antes.'],
    subtitle: 'Você diz quanto tem em casa. O PETMOL calcula quanto dura e lembra a tempo de repor.',
  },
  sumido: {
    title: ['Seu pet sumiu?', 'Alerte quem está por perto.'],
    subtitle: 'O Pet Sumido envia um alerta geolocalizado para a comunidade da sua região, na hora.',
  },
  'sem-isso': {
    title: ['Como eu vivia', 'sem isso?'],
    subtitle: 'Vacinas, ração e o alerta de Pet Sumido na palma da sua mão. Grátis e sem anúncios.',
  },
};

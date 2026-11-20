import { SITE_URL } from '@/lib/siteUrl';
import { BRAND_SAME_AS } from '@/lib/brandProfiles';

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/**
 * Identidade do PETMOL para o Google: UMA Organization e UM WebSite (com @id estável), ligados entre si. Os perfis oficiais
 * entram em `sameAs` só para ajudar a associar a marca — não é fator de posicionamento. Montado na home; os guias referenciam
 * a mesma Organization pelo mesmo @id (sem criar outra entidade).
 */
export function siteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORG_ID,
        name: 'PETMOL',
        url: SITE_URL,
        logo: `${SITE_URL}/icons/icon-512.png`,
        sameAs: [...BRAND_SAME_AS],
      },
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        name: 'PETMOL',
        url: SITE_URL,
        inLanguage: 'pt-BR',
        publisher: { '@id': ORG_ID },
      },
    ],
  };
}

export function SiteJsonLd() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()) }} />;
}

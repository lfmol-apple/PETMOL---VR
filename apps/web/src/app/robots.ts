import { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

/**
 * Conteúdo público (/, /guias, /guias/*, /sobre, /politica-editorial,
 * /transparencia, /achei-um-pet, /pet-perdido/*, /emergency, legais) fica
 * indexável. Áreas autenticadas, administrativas, de API e páginas
 * pessoais/tokenizadas ficam fora do índice — não devem aparecer em busca
 * e não agregam valor de SEO.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/home',
        '/home/',
        '/profile',
        '/register-pet',
        '/check-up',
        '/documents/',
        '/saude/',
        '/cuidar/',
        '/e/',
        '/auth/',
        '/login',
        '/webhook',
        '/go/',
        '/handoff/',
        '/share-target',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

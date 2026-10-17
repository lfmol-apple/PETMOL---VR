/**
 * Endereço público do site para metadados (Open Graph, sitemap, robots, JSON-LD, links absolutos).
 *
 * Em produção `NEXT_PUBLIC_SITE_URL` NÃO é definida no build — e não deve ser: ela também liga o redirecionamento
 * de domínio do middleware, que causou o apagão de 23/09/2026. Sem ela, o código caía em `http://localhost:3000`
 * e o sitemap.xml, o og:image e o og:url saíam apontando para localhost (achado em 17/10/2026).
 * Agora o reserva, só em produção, é o endereço real; em desenvolvimento continua localhost.
 */
export const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.NODE_ENV === 'production' ? 'https://www.petmol.com.br' : 'http://localhost:3000');

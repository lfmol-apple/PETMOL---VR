// A página pública de lojas (/loja) segue desativada — decisão comercial.
export const PUBLIC_STORE_PAGE_ENABLED = false;

// Área editorial pública (/guias, /guias/[slug]) — DESATIVADA temporariamente
// (set. 2026). O conteúdo e as rotas continuam no código, intactos: só
// retornam notFound() enquanto a flag estiver `false`, e somem do sitemap.
// Decisão: enquanto a página pública de conteúdo é a /recommendations
// (Amazon Associates US, em inglês), os /guias ficam pausados. Voltam quando
// começar o trabalho de Amazon Brasil — basta reativar as duas flags abaixo.
export const PUBLIC_GUIDES_PAGE_ENABLED = false;
export const PUBLIC_GUIDE_DETAIL_PAGE_ENABLED = false;

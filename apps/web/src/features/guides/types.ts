/**
 * Modelo de conteúdo dos Guias PETMOL (/guias, /guias/[slug]).
 *
 * Fonte central e única do conteúdo editorial público. Cada guia é um
 * objeto tipado — sem CMS externo, sem markdown solto, sem `any`. O
 * sitemap, o índice, os JSON-LD e o linking interno são todos derivados
 * daqui.
 *
 * Regra editorial: o guia tem que ser útil mesmo se todo link comercial
 * for removido. Nada de review falso, preço inventado, "mais vendido",
 * "escolha do editor" sem critério, ou citação de estudo que não existe.
 */

export type GuideCategoryId =
  | 'alimentacao'
  | 'compras-inteligentes'
  | 'higiene'
  | 'casa-e-conforto'
  | 'passeio-e-transporte'
  | 'primeiros-cuidados'
  | 'gatos';

export interface GuideCategory {
  id: GuideCategoryId;
  label: string;
  /** Frase curta pro topo da página de categoria / chip. */
  description: string;
  icon: string;
}

/** Bloco de conteúdo — renderizado como HTML semântico, sem `dangerouslySetInnerHTML`. */
export type GuideBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string; id: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; tone: 'info' | 'vet' | 'tip'; text: string }
  | {
      type: 'table';
      caption?: string;
      headers: string[];
      rows: string[][];
    }
  | { type: 'checklist'; title?: string; items: string[] }
  /** Caixa "Leia também" no meio do corpo — links internos para outros guias PETMOL. */
  | { type: 'links'; title?: string; items: { slug: string; label: string }[] }
  /** Âncora pra montar a ferramenta interativa (calculadora) daquele guia. */
  | { type: 'tool'; tool: GuideToolId };

export type GuideToolId =
  | 'duracao-saco-racao'
  | 'custo-mensal-racao'
  | 'comparar-racoes-custo-diario';

export interface GuideSource {
  label: string;
  /** Entidade/publicação — órgão público, universidade, entidade veterinária, fabricante (só specs). */
  publisher: string;
  url: string;
}

export interface GuideFaqItem {
  question: string;
  answer: string;
}

export interface Guide {
  slug: string;
  title: string;
  /** H1 curto quando o `title` é longo demais pra caber bem. Opcional. */
  headline?: string;
  category: GuideCategoryId;
  /** <meta name="description">, card do índice e og:description. Única por guia. */
  description: string;
  /** Resumo editorial exibido logo abaixo do H1 (a "resposta rápida"). */
  summary: string;
  /** ISO date. */
  publishedAt: string;
  /** ISO date — "atualizado em". */
  updatedAt: string;
  /** Minutos — calculado uma vez a partir do corpo, gravado aqui pra ser estável. */
  readingTimeMinutes: number;
  /** Caminho de imagem em /public, quando houver asset original adequado. Sem isso, o hero é uma arte gerada. */
  hero?: string;
  heroAlt?: string;
  blocks: GuideBlock[];
  /** Ferramenta interativa embutida (também referenciada por um bloco `tool`). */
  tool?: GuideToolId;
  faq?: GuideFaqItem[];
  sources?: GuideSource[];
  /** Slugs de outros guias PETMOL — linking interno editorial, não SEO. */
  relatedSlugs: string[];
  /** true quando o assunto tangencia saúde — mostra o aviso de veterinário. */
  vetContext?: boolean;
  /** Palavras-chave para a busca editorial interna. Não são meta keywords. */
  searchTerms?: string[];
}

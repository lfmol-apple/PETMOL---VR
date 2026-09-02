/**
 * "Produtos selecionados pelo PETMOL" — núcleos editoriais dos Guias.
 *
 * FASE 1 (agora): só os núcleos, como blocos editoriais. NÃO há produtos,
 * NÃO há links, NÃO há preço/rating/review — nada de dado da Amazon.
 *
 * FASE 2 (depois, em tarefa separada): pesquisa real de produtos Amazon
 * Brasil e preenchimento de `items`. Os links de afiliado da Amazon Brasil
 * devem usar EXCLUSIVAMENTE o Tracking ID abaixo. Nada de link inventado.
 */

/** Tracking ID da conta Amazon Associates Brasil do PETMOL. Reservado para
 *  a Fase 2 — ainda NÃO usado em nenhum link. */
export const AMAZON_BR_TRACKING_ID = 'amazonpetmol-20';

export type ProductCollectionId =
  | 'caes'
  | 'gatos'
  | 'alimentacao'
  | 'casa-e-higiene'
  | 'passeio-e-viagem';

/** Um produto recomendado — a forma que a Fase 2 vai preencher. Por ora,
 *  `items` fica sempre vazio e nada disto é renderizado. */
export interface ProductPick {
  /** nome do produto (sem "mais vendido", sem superlativo) */
  name: string;
  /** resumo editorial curto — por que ajuda na rotina, sem promessa */
  editorialNote: string;
  /** guia relacionado, quando fizer sentido no linking editorial */
  relatedGuideSlug?: string;
  /** link de afiliado — só Fase 2, sempre com AMAZON_BR_TRACKING_ID */
  affiliateUrl?: string;
  /** loja de origem do link (hoje só 'amazon-br' está previsto) */
  merchant?: 'amazon-br';
}

export interface ProductCollection {
  id: ProductCollectionId;
  label: string;
  icon: string;
  /** descrição curta do núcleo — o tipo de item que vai aparecer aqui */
  description: string;
  items: ProductPick[];
}

export const PRODUCT_COLLECTIONS: readonly ProductCollection[] = Object.freeze([
  {
    id: 'caes',
    label: 'Cães',
    icon: '🐶',
    description: 'Brinquedos, camas, tapetes higiênicos e acessórios para a rotina.',
    items: [],
  },
  {
    id: 'gatos',
    label: 'Gatos',
    icon: '🐱',
    description: 'Areia, caixas, arranhadores, fontes e itens de enriquecimento.',
    items: [],
  },
  {
    id: 'alimentacao',
    label: 'Alimentação',
    icon: '🍖',
    description: 'Conteúdos e escolhas relacionadas à alimentação e petiscos.',
    items: [],
  },
  {
    id: 'casa-e-higiene',
    label: 'Casa e higiene',
    icon: '🧼',
    description: 'Escovas, organização e itens para manter a casa mais prática com pets.',
    items: [],
  },
  {
    id: 'passeio-e-viagem',
    label: 'Passeio e viagem',
    icon: '🚗',
    description: 'Peitorais, guias e soluções para deslocamento e transporte.',
    items: [],
  },
]);

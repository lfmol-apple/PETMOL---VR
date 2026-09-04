/**
 * "Produtos selecionados pelo PETMOL" — núcleos editoriais dos Guias.
 *
 * FASE 2: os 20 produtos abaixo foram confirmados resolvendo os links
 * `link.amazon/*` fornecidos pelo usuário até a página real da Amazon.com.br
 * (ASIN via canonical + <title>). Cada `affiliateUrl` é o link curto do
 * usuário, PRESERVADO EXATAMENTE — o Tracking ID `amazonpetmol-20` já vem
 * embutido nele (nunca reescrever para amazon.com.br/dp/... nem anexar
 * ?tag= à mão). Sem preço, rating, review ou desconto — nada disso é
 * consultado nem armazenado.
 */

/** Tracking ID da conta Amazon Associates Brasil do PETMOL. Já vem dentro de
 *  cada `affiliateUrl` (link SiteStripe do usuário); mantido aqui como
 *  referência única e para conferência. NUNCA montar link à mão com ele. */
export const AMAZON_BR_TRACKING_ID = 'amazonpetmol-20';

export type ProductCollectionId =
  | 'caes'
  | 'gatos'
  | 'alimentacao'
  | 'casa-e-higiene'
  | 'passeio-e-viagem';

export interface ProductPick {
  /** nome editorial limpo — fiel ao produto real, sem título-keyword da
   *  Amazon. Nunca inventar tamanho / quantidade / sabor / variante. */
  name: string;
  /** resumo editorial curto — para que serve na rotina, sem promessa,
   *  sem superlativo, sem alegação veterinária. */
  editorialNote: string;
  /** ASIN da Amazon.com.br — só rastreabilidade/auditoria, não é exibido. */
  asin: string;
  /** link de afiliado do usuário, EXATAMENTE como recebido (link.amazon/*). */
  affiliateUrl: string;
  merchant: 'amazon-br';
  /** slug de um guia PETMOL de fato relacionado — só quando existir mesmo. */
  relatedGuideSlug?: string;
}

export interface ProductCollection {
  id: ProductCollectionId;
  label: string;
  icon: string;
  /** descrição curta do núcleo — o tipo de item que aparece aqui */
  description: string;
  items: ProductPick[];
}

const TAPETE_GUIDE = 'como-escolher-tapete-higienico-cachorro';

/**
 * Produtos que se relacionam com um guia específico (via `relatedGuideSlug`),
 * para o bloco contextual no fim de `/guias/[slug]`. Limitado a `max` itens —
 * é um apoio ao conteúdo, não uma vitrine. Retorna [] quando não há relação
 * editorial de verdade.
 */
export function getProductsForGuide(slug: string, max = 3): ProductPick[] {
  const matches: ProductPick[] = [];
  for (const collection of PRODUCT_COLLECTIONS) {
    for (const item of collection.items) {
      if (item.relatedGuideSlug === slug) matches.push(item);
    }
  }
  return matches.slice(0, max);
}

export const PRODUCT_COLLECTIONS: readonly ProductCollection[] = Object.freeze([
  {
    id: 'caes',
    label: 'Cães',
    icon: '🐶',
    description: 'Brinquedos, camas, tapetes higiênicos e acessórios para a rotina.',
    items: [
      {
        name: 'Petlike Ultrapads — tapete higiênico 80 × 60 cm, 30 unidades',
        editorialNote:
          'Tapete higiênico descartável para a rotina de cães que fazem as necessidades dentro de casa. Com aroma lavanda.',
        asin: 'B07PZWDZT9',
        affiliateUrl: 'https://link.amazon/B01UyCiQH',
        merchant: 'amazon-br',
        relatedGuideSlug: TAPETE_GUIDE,
      },
      {
        name: 'Blue Super — tapete higiênico 82 × 60 cm, Kit 3 (30 unidades)',
        editorialNote:
          'Tapete higiênico ultra absorvente em kit maior, para quem repõe com frequência.',
        asin: 'B0GRD1KQH1',
        affiliateUrl: 'https://link.amazon/B00HsnF63',
        merchant: 'amazon-br',
        relatedGuideSlug: TAPETE_GUIDE,
      },
      {
        name: 'Chalesco — tapete higiênico 90 × 60 cm, 50 unidades',
        editorialNote:
          'Tapete higiênico maior, com base antivazamento e controle de odor, para cães de porte médio.',
        asin: 'B07WRS2BQ5',
        affiliateUrl: 'https://link.amazon/B0iuJIVms',
        merchant: 'amazon-br',
        relatedGuideSlug: TAPETE_GUIDE,
      },
      {
        name: 'GoodPad — tapete higiênico 60 × 60 cm, 50 unidades',
        editorialNote:
          'Tapete higiênico quadrado, formato compacto para espaços menores.',
        asin: 'B0GR1LMXWC',
        affiliateUrl: 'https://link.amazon/B05WurfJl',
        merchant: 'amazon-br',
        relatedGuideSlug: TAPETE_GUIDE,
      },
      {
        name: 'Confort Pads — tapete higiênico 60 × 55 cm, 30 unidades',
        editorialNote:
          'Tapete higiênico em tamanho padrão para a rotina diária.',
        asin: 'B08CSG5734',
        affiliateUrl: 'https://link.amazon/B02jNloAn',
        merchant: 'amazon-br',
        relatedGuideSlug: TAPETE_GUIDE,
      },
      {
        name: 'Chalesco — brinquedo de pelúcia "Macaco" para cães',
        editorialNote:
          'Pelúcia para brincadeiras de morder e buscar, para momentos de interação com o tutor.',
        asin: 'B07WRS2V22',
        affiliateUrl: 'https://link.amazon/B03D6LBlL',
        merchant: 'amazon-br',
        relatedGuideSlug: 'brinquedos-para-caes-como-escolher-com-seguranca',
      },
    ],
  },
  {
    id: 'gatos',
    label: 'Gatos',
    icon: '🐱',
    description: 'Areia, caixas, arranhadores, fontes e itens de enriquecimento.',
    items: [
      {
        name: 'Pipicat Classic — granulado sanitário, 4 kg',
        editorialNote: 'Granulado sanitário para a caixa de gatos, com controle de odor.',
        asin: 'B07HFFX8V9',
        affiliateUrl: 'https://link.amazon/B02fgXjb1',
        merchant: 'amazon-br',
      },
      {
        name: 'Viva Verde — areia sanitária biodegradável, grãos finos, 4 kg',
        editorialNote:
          'Areia higiênica biodegradável de grãos finos para a rotina da caixa de gatos.',
        asin: 'B07YP1K82Z',
        affiliateUrl: 'https://link.amazon/B0iUSOJSU',
        merchant: 'amazon-br',
      },
      {
        name: 'Viva Verde — areia sanitária biodegradável, grãos mistos, 4 kg',
        editorialNote:
          'Versão de grãos mistos da linha biodegradável, para quem prefere granulometria maior.',
        asin: 'B07YXF387Y',
        affiliateUrl: 'https://link.amazon/B0cXybH8t',
        merchant: 'amazon-br',
      },
      {
        name: 'Pipicat Ultra Dry — areia higiênica, 4 kg',
        editorialNote: 'Areia sanitária com foco em absorção rápida para a caixa de gatos.',
        asin: 'B084T6QCH6',
        affiliateUrl: 'https://link.amazon/B09OopcMD',
        merchant: 'amazon-br',
      },
      {
        name: 'Great Pets — areia biodegradável de milho e mandioca, fina, 3,8 kg',
        editorialNote:
          'Areia higiênica vegetal de granulometria fina para a caixa de gatos.',
        asin: 'B0CKWBJ2CR',
        affiliateUrl: 'https://link.amazon/B04grvCKY',
        merchant: 'amazon-br',
      },
      {
        name: 'Pipicat Floral — granulado sanitário, 4 kg',
        editorialNote: 'Mesma linha do granulado Classic, com fragrância floral.',
        asin: 'B07HFFL237',
        affiliateUrl: 'https://link.amazon/B0b33wgTH',
        merchant: 'amazon-br',
      },
    ],
  },
  {
    id: 'alimentacao',
    label: 'Alimentação',
    icon: '🍖',
    description: 'Conteúdos e escolhas relacionadas à alimentação e petiscos.',
    items: [
      {
        name: 'Dreamies — petisco de carne para gatos adultos, 150 g',
        editorialNote: 'Petisco para oferecer ocasionalmente como recompensa a gatos adultos.',
        asin: 'B0BWQ5VHJQ',
        affiliateUrl: 'https://link.amazon/B077pwP4y',
        merchant: 'amazon-br',
      },
      {
        name: 'Whiskas Temptations Anti Bola de Pelo — gatos adultos, 80 g',
        editorialNote:
          'Petisco para gatos adultos, da linha voltada ao acúmulo de pelo. Dar ocasionalmente.',
        asin: 'B0BWQ3L95W',
        affiliateUrl: 'https://link.amazon/B01Fx5g91',
        merchant: 'amazon-br',
      },
      {
        name: 'Golden Gourmet — alimento para gatos filhotes, frango, caixa com 20 × 70 g',
        editorialNote: 'Alimento para gatos filhotes, sabor frango, em caixa fechada.',
        asin: 'B0BYWGBPHH',
        affiliateUrl: 'https://link.amazon/B0gLSEx8Q',
        merchant: 'amazon-br',
      },
      {
        name: 'Friskies — ração úmida para gatos adultos, salmão ao molho, 15 sachês de 85 g',
        editorialNote: 'Alimento úmido em sachê para gatos adultos, sabor salmão, em pacote com 15 unidades.',
        asin: 'B08T1TYQ71',
        affiliateUrl: 'https://link.amazon/B0j0cmH80',
        merchant: 'amazon-br',
      },
      {
        name: 'Pedigree Biscrok Multi — cães adultos, 1 kg',
        editorialNote: 'Biscoito para cães adultos, para dar entre as refeições ou em treinos.',
        asin: 'B07XQ7M2P7',
        affiliateUrl: 'https://link.amazon/B0cqEJpNZ',
        merchant: 'amazon-br',
      },
      {
        name: 'Keldog Bifinho — mix de cereais e maçã, 500 g',
        editorialNote: 'Bifinho macio para cães, útil como recompensa em treino e passeio.',
        asin: 'B0CTKQ8J6K',
        affiliateUrl: 'https://link.amazon/B07OsvcKc',
        merchant: 'amazon-br',
      },
    ],
  },
  {
    id: 'casa-e-higiene',
    label: 'Casa e higiene',
    icon: '🧼',
    description: 'Escovas, organização e itens para manter a casa mais prática com pets.',
    items: [
      {
        name: 'WAP Elimina Odores Pet — spray 500 ml (cereja e avelã)',
        editorialNote:
          'Spray neutralizador de odores para ambientes e superfícies onde o pet circula.',
        asin: 'B09DR4BDJB',
        affiliateUrl: 'https://link.amazon/B0iT8urc1',
        merchant: 'amazon-br',
      },
    ],
  },
  {
    id: 'passeio-e-viagem',
    label: 'Passeio e viagem',
    icon: '🚗',
    description: 'Peitorais, guias e soluções para deslocamento e transporte.',
    items: [
      {
        name: 'Refil de saquinhos para cata-caca — 8 rolos, 160 saquinhos biodegradáveis',
        editorialNote: 'Refil de saquinhos biodegradáveis para recolher as fezes no passeio.',
        asin: 'B0DW1M6J73',
        affiliateUrl: 'https://link.amazon/B08kuId4B',
        merchant: 'amazon-br',
      },
    ],
  },
]);

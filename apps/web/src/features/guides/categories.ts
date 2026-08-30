import type { GuideCategory, GuideCategoryId } from './types';

/**
 * Taxonomia dos Guias PETMOL. Independente das categorias de
 * `strategicProducts.ts` (aquela é curadoria de produto pra /loja; esta
 * organiza conteúdo editorial).
 */
export const GUIDE_CATEGORIES: Record<GuideCategoryId, GuideCategory> = {
  alimentacao: {
    id: 'alimentacao',
    label: 'Alimentação',
    description: 'Escolher, medir e guardar a ração — e entender o custo real de alimentar um cão.',
    icon: '🥣',
  },
  'compras-inteligentes': {
    id: 'compras-inteligentes',
    label: 'Compras inteligentes',
    description: 'Comparar produtos pet por custo real de uso, não só pelo preço da etiqueta.',
    icon: '🧮',
  },
  higiene: {
    id: 'higiene',
    label: 'Higiene',
    description: 'Tapete higiênico, limpeza e a rotina que evita bagunça e cheiro em casa.',
    icon: '🧼',
  },
  'casa-e-conforto': {
    id: 'casa-e-conforto',
    label: 'Casa e conforto',
    description: 'Cama, comedouro, bebedouro e os itens que definem o espaço do cão dentro de casa.',
    icon: '🛏️',
  },
  'passeio-e-transporte': {
    id: 'passeio-e-transporte',
    label: 'Passeio e transporte',
    description: 'Coleira, peitoral, caixa de transporte e viagem de carro com o cão.',
    icon: '🧳',
  },
  'primeiros-cuidados': {
    id: 'primeiros-cuidados',
    label: 'Primeiros cuidados',
    description: 'O básico pra quem acabou de adotar: o que comprar primeiro e o que pode esperar.',
    icon: '🐾',
  },
};

export const GUIDE_CATEGORY_ORDER: GuideCategoryId[] = [
  'alimentacao',
  'compras-inteligentes',
  'passeio-e-transporte',
  'casa-e-conforto',
  'higiene',
  'primeiros-cuidados',
];

export function getGuideCategory(id: GuideCategoryId): GuideCategory {
  return GUIDE_CATEGORIES[id];
}

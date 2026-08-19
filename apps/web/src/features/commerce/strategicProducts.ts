/**
 * Fonte editorial única de "produtos estratégicos" — a curadoria por trás
 * de /loja (público) e da seção de recomendações da Loja do Pet
 * (autenticado). Nenhuma das duas telas mantém catálogo próprio: as duas
 * leem esta lista e só diferem em COMO filtram/renderizam (ver
 * StrategicProductGrid.tsx).
 *
 * Cada item é uma INTENÇÃO DE BUSCA editorial, não uma oferta confirmada —
 * sem PA-API/Creators API (credenciais Amazon ainda não emitidas, ver
 * docs/AFFILIATES.md), então nunca há preço, imagem, ASIN ou nota real
 * aqui. `searchQuery` vira uma URL de busca Amazon com tag=petmol-20 via
 * buildAmazonSearchUrl — nunca um link de produto específico inventado.
 *
 * Curadoria alinhada às funções reais do app (alimentação, prevenção,
 * transporte, medicação, porções, hidratação, conforto sênior) — de
 * propósito NÃO é um catálogo genérico de brinquedo/fantasia/enfeite.
 */

export type StrategicProductSpecies = 'dog' | 'cat';

export type StrategicProductCategory =
  | 'alimentacao'
  | 'prevencao'
  | 'transporte'
  | 'medicacao'
  | 'porcoes'
  | 'hidratacao'
  | 'conforto_senior';

export interface StrategicProduct {
  id: string;
  /** Nome exibido no card — descreve a categoria de produto, nunca uma marca/ASIN específico. */
  title: string;
  category: StrategicProductCategory;
  /** Espécies pra quem esse item é relevante — ['dog','cat'] = compartilhado, aparece pros dois. */
  species: StrategicProductSpecies[];
  /** Vira a query da busca Amazon (buildAmazonSearchUrl) — nome de categoria, nunca marca específica inventada. */
  searchQuery: string;
  icon: string;
  /** Uma frase curta explicando por que esse item importa — não é descrição de produto da Amazon. */
  blurb: string;
  /** Slug do guia relacionado em /guias, quando existir. */
  guideSlug?: string;
}

export const STRATEGIC_PRODUCT_CATEGORIES: Record<StrategicProductCategory, { label: string; icon: string }> = {
  alimentacao: { label: 'Alimentação', icon: '🥣' },
  prevencao: { label: 'Prevenção', icon: '🛡️' },
  transporte: { label: 'Transporte', icon: '🧳' },
  medicacao: { label: 'Organização de medicamentos', icon: '💊' },
  porcoes: { label: 'Controle de porções', icon: '⚖️' },
  hidratacao: { label: 'Hidratação', icon: '💧' },
  conforto_senior: { label: 'Conforto de pets idosos', icon: '🛏️' },
};

export const STRATEGIC_PRODUCTS: StrategicProduct[] = [
  {
    id: 'comedouro-lento',
    title: 'Comedouro lento (anti-engasgo)',
    category: 'alimentacao',
    species: ['dog', 'cat'],
    searchQuery: 'comedouro lento pet anti engasgo',
    icon: '🥣',
    blurb: 'Reduz a velocidade da refeição — ajuda quem come rápido demais e engasga ou vomita depois.',
    guideSlug: 'controlar-porcoes-sem-culpa',
  },
  {
    id: 'balanca-cozinha',
    title: 'Balança de cozinha (gramas)',
    category: 'porcoes',
    species: ['dog', 'cat'],
    searchQuery: 'balança de cozinha digital gramas',
    icon: '⚖️',
    blurb: 'Pesar a porção em gramas é mais preciso que "meia xícara" — evita ração acabando antes ou depois do previsto.',
    guideSlug: 'controlar-porcoes-sem-culpa',
  },
  {
    id: 'pote-hermetico-racao',
    title: 'Pote hermético para ração',
    category: 'alimentacao',
    species: ['dog', 'cat'],
    searchQuery: 'pote hermetico racao pet',
    icon: '🫙',
    blurb: 'Mantém a ração fresca depois de aberta e longe de umidade/insetos — sacos abertos perdem qualidade rápido.',
    guideSlug: 'guia-racao-armazenamento',
  },
  {
    id: 'coleira-antiparasitaria',
    title: 'Coleira antiparasitária',
    category: 'prevencao',
    species: ['dog', 'cat'],
    searchQuery: 'coleira antipulgas carrapatos pet',
    icon: '📿',
    blurb: 'Proteção contínua contra pulgas e carrapatos — complementa (não substitui) o antiparasitário oral/tópico.',
    guideSlug: 'prevencao-pulgas-carrapatos',
  },
  {
    id: 'escova-antipulgas',
    title: 'Pente/escova antipulgas',
    category: 'prevencao',
    species: ['dog', 'cat'],
    searchQuery: 'pente antipulgas para pet',
    icon: '🪮',
    blurb: 'Detecção precoce — passar semanalmente ajuda a notar pulgas/carrapatos antes de virar infestação.',
    guideSlug: 'prevencao-pulgas-carrapatos',
  },
  {
    id: 'caixa-transporte',
    title: 'Caixa de transporte',
    category: 'transporte',
    species: ['dog', 'cat'],
    searchQuery: 'caixa de transporte para pet',
    icon: '🧳',
    blurb: 'Obrigatória pra viagens seguras de carro/avião e recomendada pra qualquer ida ao veterinário.',
    guideSlug: 'transporte-seguro-veterinario',
  },
  {
    id: 'cinto-seguranca-pet',
    title: 'Cinto de segurança para pet',
    category: 'transporte',
    species: ['dog'],
    searchQuery: 'cinto de seguranca para cachorro carro',
    icon: '🚗',
    blurb: 'Prende o pet no banco do carro — reduz risco de acidente e de o pet atrapalhar quem dirige.',
    guideSlug: 'transporte-seguro-veterinario',
  },
  {
    id: 'organizador-medicamentos',
    title: 'Organizador de comprimidos semanal',
    category: 'medicacao',
    species: ['dog', 'cat'],
    searchQuery: 'organizador de comprimidos semanal pet',
    icon: '💊',
    blurb: 'Separar a semana toda de uma vez reduz esquecimento — útil pra tratamentos contínuos ou vários pets.',
    guideSlug: 'organizar-medicamentos-tratamento-continuo',
  },
  {
    id: 'seringa-dosadora',
    title: 'Seringa dosadora sem agulha',
    category: 'medicacao',
    species: ['dog', 'cat'],
    searchQuery: 'seringa dosadora oral pet sem agulha',
    icon: '💉',
    blurb: 'Facilita medicação líquida/xarope na dose certa — muito mais preciso que "olhômetro" na colher.',
    guideSlug: 'organizar-medicamentos-tratamento-continuo',
  },
  {
    id: 'fonte-agua-pet',
    title: 'Fonte de água para pet',
    category: 'hidratacao',
    species: ['dog', 'cat'],
    searchQuery: 'fonte de agua bebedouro pet',
    icon: '💧',
    blurb: 'Água corrente estimula pets (principalmente gatos) a beber mais — ajuda quem bebe pouco naturalmente.',
    guideSlug: 'hidratacao-pets-tips',
  },
  {
    id: 'bebedouro-gato',
    title: 'Bebedouro antiformiga',
    category: 'hidratacao',
    species: ['cat'],
    searchQuery: 'bebedouro pet antiformiga',
    icon: '🐜',
    blurb: 'Base com barreira d\'água impede formigas de chegar na comida/água — comum em casas térreas.',
    guideSlug: 'hidratacao-pets-tips',
  },
  {
    id: 'cama-ortopedica',
    title: 'Cama ortopédica (espuma memória)',
    category: 'conforto_senior',
    species: ['dog', 'cat'],
    searchQuery: 'cama ortopedica pet espuma memoria',
    icon: '🛏️',
    blurb: 'Alivia pressão nas articulações — indicada pra pets idosos ou com artrose/displasia.',
    guideSlug: 'conforto-pets-idosos',
  },
  {
    id: 'rampa-pet',
    title: 'Rampa de acesso',
    category: 'conforto_senior',
    species: ['dog', 'cat'],
    searchQuery: 'rampa de acesso para pet sofa cama',
    icon: '🪜',
    blurb: 'Evita saltos que machucam articulações de pets idosos ou com mobilidade reduzida.',
    guideSlug: 'conforto-pets-idosos',
  },
];

export function getStrategicProductsForSpecies(species: StrategicProductSpecies | null): StrategicProduct[] {
  if (!species) {
    // Espécie ausente/não reconhecida (ex: 'bird', 'other', ou pet sem
    // espécie definida): mostra só os itens compartilhados entre cão e
    // gato — nunca inventa recomendação específica pra uma espécie que
    // não sabemos qual é.
    return STRATEGIC_PRODUCTS.filter((p) => p.species.includes('dog') && p.species.includes('cat'));
  }
  return STRATEGIC_PRODUCTS.filter((p) => p.species.includes(species));
}

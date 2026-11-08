/**
 * Pet Taxonomy - Species and Product Categories
 * Defines the pet universe for search validation
 */

export type PetSpecies = 'dog' | 'cat' | 'bird' | 'fish' | 'rabbit' | 'hamster' | 'other';

export type ProductCategory =
  | 'food'           // Ração, alimento
  | 'treats'         // Petiscos, snacks
  | 'litter'         // Areia higiênica
  | 'pee_pad'        // Tapete higiênico
  | 'flea_tick'      // Antipulgas, carrapatos
  | 'toys'           // Brinquedos
  | 'hygiene'        // Banho, tosa, higiene
  | 'accessories'    // Coleiras, camas, tigelas
  | 'pharmacy_pet';  // Suplementos, vitaminas (não medicamentos)

export interface CategoryLabel {
  id: ProductCategory;
  icon: string;
  'pt-BR': string;
  'en': string;
  'es': string;
  'fr': string;
  'it': string;
}

export const PRODUCT_CATEGORIES: CategoryLabel[] = [
  {
    id: 'food',
    icon: '🍖',
    'pt-BR': 'Ração',
    'en': 'Food',
    'es': 'Comida',
    'fr': 'Nourriture',
    'it': 'Cibo',
  },
  {
    id: 'treats',
    icon: '🦴',
    'pt-BR': 'Petiscos',
    'en': 'Treats',
    'es': 'Golosinas',
    'fr': 'Friandises',
    'it': 'Snack',
  },
  {
    id: 'litter',
    icon: '🧻',
    'pt-BR': 'Areia Higiênica',
    'en': 'Cat Litter',
    'es': 'Arena para Gatos',
    'fr': 'Litière',
    'it': 'Lettiera',
  },
  {
    id: 'pee_pad',
    icon: '📄',
    'pt-BR': 'Tapete Higiênico',
    'en': 'Pee Pads',
    'es': 'Pañales',
    'fr': 'Tapis Hygiéniques',
    'it': 'Traverse',
  },
  {
    id: 'flea_tick',
    icon: '🐜',
    'pt-BR': 'Antipulgas',
    'en': 'Flea & Tick',
    'es': 'Antipulgas',
    'fr': 'Antipuces',
    'it': 'Antipulci',
  },
  {
    id: 'toys',
    icon: '🎾',
    'pt-BR': 'Brinquedos',
    'en': 'Toys',
    'es': 'Juguetes',
    'fr': 'Jouets',
    'it': 'Giocattoli',
  },
  {
    id: 'hygiene',
    icon: '🧼',
    'pt-BR': 'Higiene',
    'en': 'Grooming',
    'es': 'Higiene',
    'fr': 'Hygiène',
    'it': 'Igiene',
  },
  {
    id: 'accessories',
    icon: '🎒',
    'pt-BR': 'Acessórios',
    'en': 'Accessories',
    'es': 'Accesorios',
    'fr': 'Accessoires',
    'it': 'Accessori',
  },
  {
    id: 'pharmacy_pet',
    icon: '💊',
    'pt-BR': 'Suplementos',
    'en': 'Supplements',
    'es': 'Suplementos',
    'fr': 'Suppléments',
    'it': 'Integratori',
  },
];

export interface SpeciesLabel {
  id: PetSpecies;
  icon: string;
  'pt-BR': string;
  'en': string;
  'es': string;
  'fr': string;
  'it': string;
}

export const PET_SPECIES: SpeciesLabel[] = [
  {
    id: 'dog',
    icon: '🐕',
    'pt-BR': 'Cão',
    'en': 'Dog',
    'es': 'Perro',
    'fr': 'Chien',
    'it': 'Cane',
  },
  {
    id: 'cat',
    icon: '🐈',
    'pt-BR': 'Gato',
    'en': 'Cat',
    'es': 'Gato',
    'fr': 'Chat',
    'it': 'Gatto',
  },
  {
    id: 'bird',
    icon: '🦜',
    'pt-BR': 'Pássaro',
    'en': 'Bird',
    'es': 'Pájaro',
    'fr': 'Oiseau',
    'it': 'Uccello',
  },
  {
    id: 'fish',
    icon: '🐠',
    'pt-BR': 'Peixe',
    'en': 'Fish',
    'es': 'Pez',
    'fr': 'Poisson',
    'it': 'Pesce',
  },
  {
    id: 'rabbit',
    icon: '🐇',
    'pt-BR': 'Coelho',
    'en': 'Rabbit',
    'es': 'Conejo',
    'fr': 'Lapin',
    'it': 'Coniglio',
  },
  {
    id: 'hamster',
    icon: '🐹',
    'pt-BR': 'Hamster',
    'en': 'Hamster',
    'es': 'Hámster',
    'fr': 'Hamster',
    'it': 'Criceto',
  },
  {
    id: 'other',
    icon: '🐾',
    'pt-BR': 'Outro',
    'en': 'Other',
    'es': 'Otro',
    'fr': 'Autre',
    'it': 'Altro',
  },
];

// Blocked terms (non-pet queries) - global + locale-specific
export const BLOCKED_TERMS: Record<string, string[]> = {
  global: ['celular', 'iphone', 'notebook', 'escada', 'cadeira', 'mesa'],
  'pt-BR': ['roupa', 'sapato', 'tênis', 'livro'],
  'en': ['phone', 'laptop', 'chair', 'table', 'clothing'],
  'es': ['ropa', 'zapato', 'libro', 'teléfono'],
  'fr': ['vêtement', 'chaussure', 'livre', 'téléphone'],
  'it': ['abbigliamento', 'scarpa', 'libro', 'telefono'],
};

// Pet-signal terms (help detect pet intent)
export const PET_SIGNALS: Record<string, string[]> = {
  'pt-BR': ['ração', 'petisco', 'cão', 'cachorro', 'gato', 'pet', 'animal', 'coleira', 'areia'],
  'en': ['food', 'treat', 'dog', 'cat', 'pet', 'animal', 'collar', 'litter'],
  'es': ['comida', 'golosina', 'perro', 'gato', 'mascota', 'animal', 'collar'],
  'fr': ['nourriture', 'friandise', 'chien', 'chat', 'animal', 'collier', 'litière'],
  'it': ['cibo', 'snack', 'cane', 'gatto', 'animale', 'collare', 'lettiera'],
};

/** Nomes comuns digitados no campo livre de "Outro" → emoji (sem acento, minúsculo). */
const COMMON_ANIMAL_EMOJI: Array<[RegExp, string]> = [
  [/\b(cavalo|egua|potro|pônei|ponei|pony)\b/, '🐴'],
  [/\b(porco|porquinho|leitao|suino)\b/, '🐷'],
  [/\b(jacare|crocodilo)\b/, '🐊'],
  [/\b(tartaruga|jabuti|cagado)\b/, '🐢'],
  [/\b(cobra|serpente|piton|jiboia)\b/, '🐍'],
  [/\b(lagarto|iguana|camaleao|lagartixa|gecko)\b/, '🦎'],
  [/\b(ovelha|carneiro|cordeiro)\b/, '🐑'],
  [/\b(cabra|bode)\b/, '🐐'],
  [/\b(vaca|boi|bezerro|touro)\b/, '🐮'],
  [/\b(galinha|galo|frango|pinto)\b/, '🐔'],
  [/\b(pato|marreco|ganso)\b/, '🦆'],
  [/\b(papagaio|periquito|calopsita|canario|arara|passaro|ave)\b/, '🦜'],
  [/\b(cobaia|porquinho da india|hamster|gerbil)\b/, '🐹'],
  [/\b(rato|camundongo|ratinho|chinchila|esquilo)\b/, '🐭'],
  [/\b(sapo|ra|perereca)\b/, '🐸'],
  [/\b(aranha|tarantula)\b/, '🕷️'],
  [/\b(cachorro|cao|cachorra)\b/, '🐶'],
  [/\b(gato|gata|gatinho)\b/, '🐱'],
  [/\b(coelho|coelha)\b/, '🐇'],
  [/\b(peixe|betta|goldfish)\b/, '🐠'],
];

/** Emoji de reserva do pet (quando não há foto). Espécie ausente = cão (comportamento legado);
 *  espécies conhecidas usam o ícone da taxonomia; texto livre reconhece nomes comuns (cavalo, porco,
 *  jacaré…) e, sem reconhecer, vira 🐾 — nunca um cachorro por engano. */
export function petSpeciesEmoji(species?: string | null): string {
  if (!species || species === 'dog') return '🐶';
  if (species === 'cat') return '🐱';
  const known = PET_SPECIES.find((s) => s.id === species)?.icon;
  if (known) return known;
  const norm = species.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  for (const [re, emoji] of COMMON_ANIMAL_EMOJI) if (re.test(norm)) return emoji;
  return '🐾';
}

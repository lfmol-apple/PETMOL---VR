import type { ProductCategory } from './types';

// Ordered most-specific first so that e.g. antiparasite matches before medication.
const RULES: Array<{ words: string[]; category: ProductCategory }> = [
  {
    words: [
      'antipulgas', 'antiparasit', 'bravecto', 'nexgard', 'simparica',
      'frontline', 'advantage', 'revolution', 'comfortis', 'credelio',
      'vectra', 'flea', 'tick', 'carrapato',
    ],
    category: 'antiparasite',
  },
  {
    words: [
      'vermifugo', 'vermifugo', 'drontal', 'milbemax', 'panacur',
      'canex', 'selemax', 'dewormer', 'verme',
    ],
    category: 'dewormer',
  },
  {
    words: ['coleira', 'collar', 'seresto', 'scalibor', 'foresto', 'bolfo'],
    category: 'collar',
  },
  {
    words: [
      'comprimido', 'suspensao', 'injetavel', 'cloridrato', 'fosfato',
      'sulfato', 'medicamento', 'remedio', ' mg/', 'mcg', 'antibiotico',
      'antiflamatorio', 'corticoide',
    ],
    category: 'medication',
  },
  {
    words: [
      'racao', 'alimento', 'petisco', 'snack', 'kibble', 'croquette',
      'dog food', 'cat food', 'royal canin', 'hills', 'purina', 'premier pet',
      'farmina', 'orijen', 'acana', 'eukanuba', 'guabi', 'magnus',
    ],
    category: 'food',
  },
  {
    words: [
      'shampoo', 'higiene', 'tapete higienico', 'areia sanitaria',
      'lenco umedecido', 'limpeza', 'sabonete', 'condicionador',
    ],
    category: 'hygiene',
  },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function classifyProduct(name: string): ProductCategory {
  const n = normalize(name);
  for (const rule of RULES) {
    if (rule.words.some(w => n.includes(normalize(w)))) {
      return rule.category;
    }
  }
  return 'other';
}

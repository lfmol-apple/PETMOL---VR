/**
 * O que o app oferece de cuidado por espécie (decisão do dono, 08/11/2026: "nada que não se aplique ao bicho").
 *
 * Vacinas e antiparasitários do PETMOL são protocolos de CÃO e GATO. Para coelho, pássaro, cavalo etc. eles não se
 * aplicam — então somem das telas e da "régua de cuidados" (senão o bicho ficaria "pendente" para sempre).
 * Espécie ausente = cão (comportamento legado de pets antigos). A coleira antiparasitária é só de cães.
 */
export interface SpeciesCare {
  vaccines: boolean;
  dewormer: boolean;
  fleaTick: boolean;
  collar: boolean;
  /** Lembrete de passeio: só cão e gato (os demais não passeiam, ou não dá para presumir). */
  walk: boolean;
  /** Banho e Tosa (banheirinha na foto e card em Cuidados): não faz sentido para peixe, pássaro e hamster. */
  grooming: boolean;
}

import { petSpeciesEmoji } from '@/lib/petTaxonomy';

const NO_BATH = new Set(['fish', 'bird', 'hamster']);

export function speciesCare(species?: string | null): SpeciesCare {
  if (!species || species === 'dog') {
    return { vaccines: true, dewormer: true, fleaTick: true, collar: true, walk: true, grooming: true };
  }
  if (species === 'cat') {
    return { vaccines: true, dewormer: true, fleaTick: true, collar: false, walk: true, grooming: true };
  }
  return { vaccines: false, dewormer: false, fleaTick: false, collar: false, walk: false, grooming: !NO_BATH.has(species) };
}

/** Só cão e gato têm o protocolo completo de vacina/parasita. */
export function hasDogCatCare(species?: string | null): boolean {
  return speciesCare(species).vaccines;
}

const SPECIES_NOUN: Record<string, string> = {
  dog: 'cachorro', cat: 'gato', rabbit: 'coelho', bird: 'pássaro', hamster: 'hamster', fish: 'peixe',
};

/** Como falar do bicho em frases e buscas ("cachorro", "coelho", texto livre do tutor, ou "pet"). */
export function speciesNoun(species?: string | null): string {
  if (!species) return 'cachorro';
  if (SPECIES_NOUN[species]) return SPECIES_NOUN[species];
  if (species === 'other') return 'pet';
  return species.trim() || 'pet';
}

/** Rótulo com inicial maiúscula para telas ("Cachorro", "Coelho", "Furão"). `dogWord` troca só a palavra do cão ("Cão"). */
export function speciesLabel(species?: string | null, dogWord = 'Cachorro'): string {
  if (!species || species === 'dog') return dogWord;
  const n = speciesNoun(species);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Emoji do cartaz de pet perdido: cão 🐕 e gato 🐈 como sempre; outros bichos usam o ícone da espécie (🐾 se desconhecido). */
export function speciesPosterEmoji(species?: string | null): string {
  if (!species || species === 'dog') return '🐕';
  if (species === 'cat') return '🐈';
  return petSpeciesEmoji(species);
}

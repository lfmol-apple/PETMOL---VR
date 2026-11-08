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
}

const NONE: SpeciesCare = { vaccines: false, dewormer: false, fleaTick: false, collar: false };

export function speciesCare(species?: string | null): SpeciesCare {
  if (!species || species === 'dog') return { vaccines: true, dewormer: true, fleaTick: true, collar: true };
  if (species === 'cat') return { vaccines: true, dewormer: true, fleaTick: true, collar: false };
  return NONE;
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

/** Rótulo com inicial maiúscula para telas ("Cachorro", "Coelho", "Furão"). */
export function speciesLabel(species?: string | null): string {
  const n = speciesNoun(species);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

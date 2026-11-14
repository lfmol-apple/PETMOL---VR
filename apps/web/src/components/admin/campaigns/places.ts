/**
 * Lugar da segmentação (sem digitar): "Brasil inteiro", estado inteiro, só a capital ou uma cidade específica. Os valores falam com o backend como
 * "BR" | "UF:SP" | "CAP:SP" | "CITY:SP:campinas" (cidade SEMPRE junto da UF). As listas vêm só de lugares que existem nos dados do PETMOL.
 */
export interface PlaceCity { key: string; name: string; tutors: number; capital: boolean }
export interface PlaceState { uf: string; name: string; tutors: number; capital: { name: string; tutors: number }; cities: PlaceCity[] }
export interface PlaceOptions {
  reachable: number; brazil_tutors: number; known_state_tutors: number; unknown_location_tutors: number; foreign_tutors: number;
  states: PlaceState[]; note: string;
}
export type PlaceMode = 'br' | 'state' | 'capital' | 'city';
export interface Place { mode: PlaceMode; uf?: string; city?: string }

export const PLACE_FIELD = 'location_place';
export const SEX_FIELD = 'tutor_sex_estimate';

const known = new Map<string, string>();            // "CITY:SP:campinas" → "Campinas · SP"; "UF:SP" → "São Paulo" (preenchido ao carregar as listas)
export function rememberPlaces(o: PlaceOptions) {
  for (const s of o.states) {
    known.set(`UF:${s.uf}`, s.name);
    known.set(`CAP:${s.uf}`, s.capital.name);
    for (const c of s.cities) known.set(`CITY:${s.uf}:${c.key}`, c.name);
  }
}

export function placeValue(p: Place): string {
  if (p.mode === 'br') return 'BR';
  if (p.mode === 'state') return `UF:${p.uf}`;
  if (p.mode === 'capital') return `CAP:${p.uf}`;
  return `CITY:${p.uf}:${p.city}`;
}

export function parsePlace(v: unknown): Place | null {
  if (typeof v !== 'string') return null;
  if (v === 'BR') return { mode: 'br' };
  const [k, uf, city] = v.split(':');
  if (k === 'UF' && uf) return { mode: 'state', uf };
  if (k === 'CAP' && uf) return { mode: 'capital', uf };
  if (k === 'CITY' && uf && city) return { mode: 'city', uf, city };
  return null;
}

const title = (s: string) => s.replace(/\b([a-zà-ú])/g, (m) => m.toUpperCase());

/** Texto legível de um valor de lugar (resumo do filtro e conferência da campanha). */
export function placeLabel(v: string): string {
  const p = parsePlace(v);
  if (!p) return v;
  if (p.mode === 'br') return 'Brasil inteiro';
  const ufName = known.get(`UF:${p.uf}`) ?? p.uf!;
  if (p.mode === 'state') return `Estado inteiro: ${ufName}`;
  if (p.mode === 'capital') return `Só a capital: ${known.get(`CAP:${p.uf}`) ?? p.uf} (${p.uf})`;
  return `Cidade: ${known.get(`CITY:${p.uf}:${p.city}`) ?? title(p.city!)} (${p.uf})`;
}

export const SEX_OPTIONS: { value: 'male' | 'female' | 'unknown'; label: string }[] = [
  { value: 'male', label: 'Tutor (homem)' },
  { value: 'female', label: 'Tutora (mulher)' },
  { value: 'unknown', label: 'Sem identificação' },
];
export const sexLabel = (v: string) => SEX_OPTIONS.find((o) => o.value === v)?.label ?? v;

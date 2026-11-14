/**
 * Coerência entre os CHIPS (atalhos) e os FILTROS AVANÇADOS, e detecção de contradições (E/OU incluídos).
 *
 * Regras (uma fonte de verdade: o FilterState; os chips só leem/escrevem o bloco rápido):
 *  - Um campo "mora" em um lugar só: se ele também está num bloco avançado, o atalho daquele campo fica TRAVADO (com explicação).
 *  - Com OU entre blocos, ou com o bloco rápido alterado (OU / "algum pet"), todos os atalhos ficam travados: a leitura "E, no mesmo pet" deixaria de ser verdade.
 *  - Contradição = condições que nunca podem valer JUNTAS para o mesmo tutor/pet (ex.: gato E cão no mesmo pet). Condições em blocos com OU,
 *    ou em pets diferentes ("algum pet"), não são contradição.
 */
import { describeCond, type Block, type Cond, type FilterState } from './filters';
import type { FieldInfo } from './api';
import { QUICK_BLOCK_ID } from './quickFilters';

export const QUICK_FIELDS = ['pet_species', 'pet_sex', 'pet_neutered_yes', 'pet_age_months', 'pet_weight_kg', 'platform', 'tutor_activity', 'feeding_registered', 'care_vaccine', 'care_parasite', 'care_grooming'];

export interface ChipLock { all: string | null; byField: Map<string, string> }

export function chipLocks(state: FilterState): ChipLock {
  const quick = state.blocks.find((b) => b.id === QUICK_BLOCK_ID);
  let all: string | null = null;
  if (state.blocks.length > 1 && state.op === 'or') all = 'Os blocos estão combinados com OU: os atalhos só valem com E. Mude para E nos filtros avançados.';
  else if (quick && (quick.op !== 'and' || quick.petScope !== 'same')) all = 'O bloco dos atalhos foi alterado nos filtros avançados (OU ou “algum pet”). Volte para “todas as condições (E)” e “o mesmo pet” para usar os atalhos.';
  const byField = new Map<string, string>();
  state.blocks.forEach((b, i) => {
    if (b.id === QUICK_BLOCK_ID) return;
    for (const c of b.conds) if (QUICK_FIELDS.includes(c.field) && !byField.has(c.field)) byField.set(c.field, `Já está nos filtros avançados (Bloco ${i + 1}). Edite lá ou remova para usar o atalho.`);
  });
  return { all, byField };
}

// ── contradições ─────────────────────────────────────────────────────────────

type Interval = [number, number];
const NUM_FIELDS = new Set(['pet_age_months', 'pet_weight_kg', 'tutor_pet_count']);
const SET_FIELDS = new Set(['pet_species', 'location_registered_state']);
const EQ_FIELDS = new Set(['pet_sex', 'tutor_activity']);
const PET_FIELDS_SET = new Set(['pet_species', 'pet_sex', 'pet_age_months', 'pet_weight_kg']);

function interval(c: Cond): Interval | null {
  const v = c.value;
  const n = (x: unknown) => (x === '' || x === null || x === undefined ? NaN : Number(x));
  if (c.op === 'between' && Array.isArray(v)) { const a = n(v[0]), b = n(v[1]); return Number.isNaN(a) || Number.isNaN(b) ? null : [a, b]; }
  const x = n(v); if (Number.isNaN(x)) return null;
  return c.op === 'eq' ? [x, x] : c.op === 'gte' ? [x, Infinity] : c.op === 'lte' ? [-Infinity, x] : null;
}
const asSet = (c: Cond): Set<string> | null => (Array.isArray(c.value) && c.value.length ? new Set((c.value as string[]).map((x) => String(x).trim().toUpperCase())) : null);

/** Duas condições do MESMO campo que nunca podem valer juntas (para a mesma pessoa/pet). */
export function disjoint(a: Cond, b: Cond): boolean {
  if (a.field !== b.field) return false;
  if (NUM_FIELDS.has(a.field)) { const x = interval(a), y = interval(b); return !!x && !!y && (x[0] > y[1] || y[0] > x[1]); }
  if (SET_FIELDS.has(a.field)) { const x = asSet(a), y = asSet(b); return !!x && !!y && [...x].every((v) => !y.has(v)); }
  if (EQ_FIELDS.has(a.field)) return a.value !== '' && b.value !== '' && a.value !== b.value;
  return false;
}

export interface Conflict { text: string }

/** Contradições do filtro. Um OU entre blocos (ou dentro de um bloco com OU) nunca gera contradição por si só. */
export function findConflicts(state: FilterState, fields: FieldInfo[]): Conflict[] {
  const by = new Map(fields.map((f) => [f.field, f]));
  const out: Conflict[] = [];
  const seen = new Set<string>();
  const pairs: { a: Cond; b: Cond; ai: number; bi: number; samePet: boolean }[] = [];
  const andBlocks = state.blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.op === 'and');
  for (const { b: A, i: ai } of andBlocks) {
    // dentro do mesmo bloco (E)
    for (let x = 0; x < A.conds.length; x++) for (let y = x + 1; y < A.conds.length; y++) {
      const petA = by.get(A.conds[x].field)?.scope === 'pet';
      pairs.push({ a: A.conds[x], b: A.conds[y], ai, bi: ai, samePet: petA ? A.petScope !== 'any' : false });
    }
    // entre blocos (só quando os blocos se combinam com E)
    if (state.op === 'and') {
      for (const { b: B, i: bi } of andBlocks) {
        if (bi <= ai) continue;
        for (const ca of A.conds) for (const cb of B.conds) {
          const pet = by.get(ca.field)?.scope === 'pet';
          pairs.push({ a: ca, b: cb, ai, bi, samePet: pet ? A.petScope === 'all' || B.petScope === 'all' : false });
        }
      }
    }
  }
  for (const { a, b, ai, bi, samePet } of pairs) {
    if (a.field !== b.field) continue;
    const isPet = PET_FIELDS_SET.has(a.field) && by.get(a.field)?.scope === 'pet';
    if (isPet && !samePet) continue;                        // pets diferentes podem cumprir condições diferentes ("algum pet")
    if (!disjoint(a, b)) continue;
    const key = [a.id, b.id].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const where = (i: number) => (state.blocks[i].id === QUICK_BLOCK_ID ? 'atalhos' : `Bloco ${i + 1}`);
    out.push({ text: `“${describeCond(a, by.get(a.field))}” (${where(ai)}) e “${describeCond(b, by.get(b.field))}” (${where(bi)}) se contradizem: ${isPet ? 'nenhum pet' : 'nenhum tutor'} pode atender aos dois ao mesmo tempo.` });
  }
  return out;
}

export const blockLabel = (b: Block, i: number) => (b.id === QUICK_BLOCK_ID ? 'atalhos' : `Bloco ${i + 1}`);

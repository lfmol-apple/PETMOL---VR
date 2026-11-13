/**
 * Filtros RÁPIDOS (chips): atalhos para as condições mais usadas. Escrevem no MESMO FilterState dos filtros avançados
 * (um bloco "rápido", sempre o primeiro, com E entre as condições e "o mesmo pet atende a tudo"), então nada diverge do motor.
 */
import { uid, type Block, type Cond, type FilterState } from './filters';

export const QUICK_BLOCK_ID = 'quick-block';

export interface Band { key: string; label: string; hint: string; lo: number; hi: number }
export const AGE_BANDS: Band[] = [
  { key: 'filhote', label: 'Filhote', hint: 'até 12 meses', lo: 0, hi: 12 },
  { key: 'jovem', label: 'Jovem', hint: '1 a 3 anos', lo: 12, hi: 36 },
  { key: 'adulto', label: 'Adulto', hint: '3 a 8 anos', lo: 36, hi: 96 },
  { key: 'senior', label: 'Sênior', hint: '8+ anos', lo: 96, hi: 360 },
];
export const WEIGHT_BANDS: Band[] = [
  { key: 'pequeno', label: 'Pequeno', hint: 'até 10 kg', lo: 0, hi: 10 },
  { key: 'medio', label: 'Médio', hint: '10 a 25 kg', lo: 10, hi: 25 },
  { key: 'grande', label: 'Grande', hint: '25+ kg', lo: 25, hi: 200 },
];

const quickOf = (s: FilterState): Block | undefined => s.blocks.find((b) => b.id === QUICK_BLOCK_ID);
export const quickConds = (s: FilterState): Cond[] => quickOf(s)?.conds ?? [];
export const quickCond = (s: FilterState, field: string): Cond | undefined => quickConds(s).find((c) => c.field === field);

/** Troca (ou remove, com `next=null`) a condição de um campo no bloco rápido, criando o bloco se preciso. */
export function setQuick(s: FilterState, field: string, next: Omit<Cond, 'id' | 'field'> | null): FilterState {
  const exists = quickOf(s);
  const conds = (exists?.conds ?? []).filter((c) => c.field !== field);
  if (next) conds.push({ id: uid('c'), field, ...next });
  if (!conds.length && exists) return { ...s, blocks: s.blocks.filter((b) => b.id !== QUICK_BLOCK_ID) };
  if (!exists) {
    if (!conds.length) return s;
    return { ...s, op: 'and', blocks: [{ id: QUICK_BLOCK_ID, op: 'and', petScope: 'same', conds }, ...s.blocks] };
  }
  return { ...s, blocks: s.blocks.map((b) => (b.id === QUICK_BLOCK_ID ? { ...b, conds } : b)) };
}

/** Liga/desliga um valor em um campo de múltipla escolha (`in`). */
export function toggleIn(s: FilterState, field: string, value: string): FilterState {
  const cur = ((quickCond(s, field)?.value as string[]) ?? []).slice();
  const i = cur.indexOf(value);
  if (i >= 0) cur.splice(i, 1); else cur.push(value);
  return setQuick(s, field, cur.length ? { op: 'in', value: cur, ack: false } : null);
}

/** Escolha única (clicar no selecionado limpa). */
export function pickOne(s: FilterState, field: string, value: string): FilterState {
  const cur = quickCond(s, field);
  return setQuick(s, field, cur && cur.value === value ? null : { op: 'eq', value, ack: false });
}

/** Faixa numérica única (idade em meses / peso em kg). */
export function pickBand(s: FilterState, field: string, band: Band): FilterState {
  const cur = quickCond(s, field);
  const same = cur && Array.isArray(cur.value) && cur.value[0] === String(band.lo) && cur.value[1] === String(band.hi);
  return setQuick(s, field, same ? null : { op: 'between', value: [String(band.lo), String(band.hi)], ack: false });
}

export const bandKey = (s: FilterState, field: string, bands: Band[]): string | null => {
  const c = quickCond(s, field);
  const v = c?.value;
  if (!Array.isArray(v)) return null;
  return bands.find((b) => String(b.lo) === v[0] && String(b.hi) === v[1])?.key ?? null;
};

export function toggleFlag(s: FilterState, field: string): FilterState {
  return setQuick(s, field, quickCond(s, field) ? null : { op: 'eq', value: true, ack: false });
}

export function removeCond(s: FilterState, condId: string): FilterState {
  const blocks = s.blocks.map((b) => ({ ...b, conds: b.conds.filter((c) => c.id !== condId) })).filter((b) => b.conds.length > 0);
  return { ...s, blocks };
}

/**
 * Modelo de filtros da tela → AudienceFilter do backend. O estado da tela é simples (blocos de condições com E/OU);
 * o backend continua sendo a validação definitiva (a tela só evita pedir contagens inválidas).
 */
import type { FieldInfo } from './api';

export type Op = 'and' | 'or';
export type PetScope = 'any' | 'all' | 'same';
export interface Cond { id: string; field: string; op: string; value: unknown; ack: boolean }
export interface Block { id: string; op: Op; petScope: PetScope; conds: Cond[] }
export interface FilterState { op: Op; blocks: Block[] }

export const emptyFilter = (): FilterState => ({ op: 'and', blocks: [] });

let seq = 0;
export const uid = (p: string) => `${p}${++seq}`;

export const PET_SCOPE_LABEL: Record<PetScope, { label: string; help: string }> = {
  any: { label: 'Algum pet atende', help: 'Basta um pet do tutor cumprir cada condição (pets diferentes podem cumprir condições diferentes).' },
  same: { label: 'O mesmo pet atende a tudo', help: 'Um único pet precisa cumprir TODAS as condições do bloco (ex.: gato E fêmea no mesmo pet).' },
  all: { label: 'Todos os pets atendem', help: 'Todos os pets do tutor precisam cumprir as condições (ex.: só tem gatos).' },
};

export const VALUE_LABEL: Record<string, string> = {
  dog_only: 'Só cães', cat_only: 'Só gatos', dog_and_cat: 'Cão e gato', has_dog: 'Tem cão', has_cat: 'Tem gato',
  last_7d: 'Atividade nos últimos 7 dias', d8_30: 'Atividade entre 8 e 30 dias atrás', over_30d: 'Última atividade há mais de 30 dias', no_events: 'Sem atividade registrada',
  ios: 'iPhone (iOS)', android: 'Android', web: 'Navegador (web)',
  dog: 'Cão', cat: 'Gato', other: 'Outro', male: 'Macho', female: 'Fêmea',
};

export const OP_LABEL: Record<string, string> = { eq: 'é igual a', gte: 'é no mínimo', lte: 'é no máximo', between: 'está entre', in: 'é um de', contains: 'contém', within_km: 'a até' };

/** Ordem e nome dos grupos expansíveis (o backend chama de "Engajamento" o grupo de atividade e aparelho). */
export const GROUPS: { key: string; title: string; hint: string }[] = [
  { key: 'Tutor', title: 'Tutor', hint: 'Cadastro, quantidade e tipos de pet' },
  { key: 'Pet', title: 'Pet', hint: 'Espécie, sexo, raça, idade, peso, castração' },
  { key: 'Localização', title: 'Localização', hint: 'Cadastro, GPS ou IP — cada origem tem precisão própria' },
  { key: 'Alimentação', title: 'Alimentação', hint: 'Ração cadastrada e marca' },
  { key: 'Cuidados', title: 'Cuidados', hint: 'Vacina, vermífugo, banho e tosa, medicação' },
  { key: 'Engajamento', title: 'Atividade', hint: 'Atividade registrada no app e aparelho com push' },
];

export type Kind = 'multi' | 'single' | 'flag' | 'text' | 'number' | 'date' | 'list' | 'gps';

export function kindOf(f: FieldInfo): Kind {
  if (f.field === 'location_gps_radius') return 'gps';
  if (f.field === 'tutor_created_at') return 'date';
  if (f.ops.includes('contains')) return 'text';
  if (f.values && f.values.length === 1 && f.values[0] === true) return 'flag';
  if (f.values && f.ops.includes('in')) return 'multi';
  if (f.values) return 'single';
  if (f.ops.includes('in')) return 'list';
  return 'number';
}

export function defaultCond(f: FieldInfo): Cond {
  const k = kindOf(f);
  const base = { id: uid('c'), field: f.field, ack: false };
  switch (k) {
    case 'flag': return { ...base, op: 'eq', value: true };
    case 'multi': return { ...base, op: 'in', value: [] };
    case 'single': return { ...base, op: 'eq', value: '' };
    case 'text': return { ...base, op: 'contains', value: '' };
    case 'list': return { ...base, op: 'in', value: [] };
    case 'gps': return { ...base, op: 'within_km', value: { lat: '', lng: '', km: '' } };
    case 'date': return { ...base, op: 'gte', value: '' };
    default: return { ...base, op: f.ops.includes('gte') ? 'gte' : 'eq', value: '' };
  }
}

const isBlank = (v: unknown) => v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
const num = (v: unknown) => (isBlank(v) ? NaN : Number(v));

/** Mensagem de por que a condição ainda não pode ser consultada (null = pronta). */
export function condError(c: Cond, f: FieldInfo | undefined): string | null {
  if (!f) return 'Filtro desconhecido.';
  const k = kindOf(f);
  const v = c.value;
  if (k === 'multi' || k === 'list') {
    if (!Array.isArray(v) || v.length === 0) return 'Escolha ao menos um valor.';
  } else if (k === 'single') {
    if (isBlank(v)) return 'Escolha um valor.';
  } else if (k === 'text') {
    const t = String(v ?? '').trim();
    if (t.length < 2 || t.length > 60) return 'Digite de 2 a 60 caracteres.';
  } else if (k === 'gps') {
    const o = v as { lat: unknown; lng: unknown; km: unknown };
    const [la, ln, km] = [num(o?.lat), num(o?.lng), num(o?.km)];
    if ([la, ln, km].some(Number.isNaN)) return 'Informe latitude, longitude e raio.';
    if (la < -90 || la > 90 || ln < -180 || ln > 180) return 'Latitude/longitude fora do intervalo.';
    if (km < 1 || km > 500) return 'O raio vai de 1 a 500 km.';
  } else if (k === 'date' || k === 'number') {
    const pair = c.op === 'between';
    const vals = pair ? (Array.isArray(v) ? v : ['', '']) : [v];
    if (pair && vals.length !== 2) return 'Informe início e fim.';
    for (const x of vals) {
      if (isBlank(x)) return pair ? 'Informe início e fim.' : 'Informe um valor.';
      if (k === 'number' && (Number.isNaN(num(x)) || num(x) < 0)) return 'Informe um número válido.';
    }
    if (pair && k === 'number' && num(vals[0]) > num(vals[1])) return 'O mínimo é maior que o máximo.';
    if (pair && k === 'date' && String(vals[0]) > String(vals[1])) return 'O início vem depois do fim.';
  }
  if (f.approximate && !c.ack) return 'Confirme que esta localização é aproximada e não representa a residência.';
  return null;
}

function ruleOf(c: Cond, f: FieldInfo) {
  const k = kindOf(f);
  let value: unknown = c.value;
  if (k === 'gps') { const o = c.value as Record<string, unknown>; value = { lat: num(o.lat), lng: num(o.lng), km: num(o.km) }; }
  else if (k === 'text') value = String(c.value).trim();
  else if (k === 'number') value = c.op === 'between' ? (c.value as unknown[]).map(num) : num(c.value);
  else if (k === 'list') value = (c.value as string[]).map((s) => s.trim()).filter(Boolean);
  return { kind: 'rule' as const, field: c.field, op: c.op, value, approximate_ack: !!c.ack };
}

export interface Built { filter: { version: 1; root: unknown }; errors: { condId: string; text: string }[]; ready: boolean }

/** Converte o estado da tela no AudienceFilter. `ready=false` se alguma condição está incompleta. */
export function buildFilter(state: FilterState, fields: FieldInfo[]): Built {
  const byField = new Map(fields.map((f) => [f.field, f]));
  const errors: Built['errors'] = [];
  const items: unknown[] = [];
  for (const b of state.blocks) {
    const rules: unknown[] = [];
    let hasPet = false;
    for (const c of b.conds) {
      const f = byField.get(c.field);
      const err = condError(c, f);
      if (err || !f) { errors.push({ condId: c.id, text: err ?? 'Filtro desconhecido.' }); continue; }
      if (f.scope === 'pet') hasPet = true;
      rules.push(ruleOf(c, f));
    }
    if (rules.length) items.push({ kind: 'group', op: b.op, ...(hasPet ? { pet_scope: b.petScope } : {}), items: rules });
  }
  return { filter: { version: 1, root: { kind: 'group', op: state.op, items } }, errors, ready: errors.length === 0 };
}

/** Texto legível de uma condição (resumo e conferência na prévia). */
export function describeCond(c: Cond, f: FieldInfo | undefined): string {
  if (!f) return c.field;
  const k = kindOf(f);
  const v = c.value;
  const lbl = (x: unknown) => VALUE_LABEL[String(x)] ?? String(x);
  if (k === 'flag') return f.label;
  if (k === 'multi') return `${f.label}: ${(Array.isArray(v) ? v : []).map(lbl).join(' ou ')}`;
  if (k === 'single') return `${f.label}: ${lbl(v)}`;
  if (k === 'list') return `${f.label}: ${(Array.isArray(v) ? v : []).join(', ')}`;
  if (k === 'text') return `${f.label} “${String(v).trim()}”`;
  if (k === 'gps') { const o = v as Record<string, unknown>; return `${f.label}: até ${o.km} km de (${o.lat}, ${o.lng})`; }
  if (c.op === 'between') { const a = v as unknown[]; return `${f.label} entre ${a?.[0]} e ${a?.[1]}`; }
  return `${f.label} ${OP_LABEL[c.op] ?? c.op} ${String(v)}`;
}

export function conditionCount(s: FilterState): number { return s.blocks.reduce((n, b) => n + b.conds.length, 0); }

// ── Filtros guardados no lote (JSON do backend) → tela / texto ───────────────

type RawRule = { kind: 'rule'; field: string; op: string; value: unknown; approximate_ack?: boolean };
type RawGroup = { kind: 'group'; op: Op; pet_scope?: PetScope | null; items: (RawRule | RawGroup)[] };
export interface StoredFilter { version?: number; root: RawGroup }

function condFromRule(r: RawRule, f: FieldInfo | undefined): Cond {
  const k = f ? kindOf(f) : 'text';
  let value: unknown = r.value;
  if (k === 'gps') { const o = (r.value ?? {}) as Record<string, unknown>; value = { lat: String(o.lat ?? ''), lng: String(o.lng ?? ''), km: String(o.km ?? '') }; }
  else if (k === 'number' || k === 'date') value = Array.isArray(r.value) ? r.value.map(String) : String(r.value ?? '');
  return { id: uid('c'), field: r.field, op: r.op, value, ack: !!r.approximate_ack };
}

/** Transforma os filtros guardados num lote no estado editável da tela (ponto de partida para o próximo lote). */
export function filterToState(stored: StoredFilter | null | undefined, fields: FieldInfo[]): FilterState {
  const root = stored?.root;
  if (!root || !Array.isArray(root.items)) return emptyFilter();
  const by = new Map(fields.map((f) => [f.field, f]));
  const blocks: Block[] = [];
  const loose: Cond[] = [];
  for (const it of root.items) {
    if (it.kind === 'group') {
      blocks.push({ id: uid('b'), op: it.op ?? 'and', petScope: (it.pet_scope as PetScope) ?? 'any', conds: it.items.filter((x): x is RawRule => x.kind === 'rule').map((r) => condFromRule(r, by.get(r.field))) });
    } else loose.push(condFromRule(it, by.get(it.field)));
  }
  if (loose.length) blocks.unshift({ id: uid('b'), op: root.op ?? 'and', petScope: 'any', conds: loose });
  return { op: root.op ?? 'and', blocks };
}

/** Resumo legível dos filtros de um lote (o histórico precisa explicar POR QUE aquele público foi escolhido). */
export function describeStoredFilter(stored: StoredFilter | null | undefined, fields: FieldInfo[]): string[] {
  const st = filterToState(stored, fields);
  if (!st.blocks.length) return ['Sem filtros: todos os tutores alcançáveis por push.'];
  const by = new Map(fields.map((f) => [f.field, f]));
  const lines: string[] = [];
  if (st.blocks.length > 1) lines.push(st.op === 'and' ? 'O tutor precisa estar em TODOS os blocos (E):' : 'O tutor precisa estar em QUALQUER um dos blocos (OU):');
  st.blocks.forEach((b, i) => {
    const hasPet = b.conds.some((c) => by.get(c.field)?.scope === 'pet');
    const scope = hasPet ? ` · pets: ${PET_SCOPE_LABEL[b.petScope].label.toLowerCase()}` : '';
    const joiner = b.op === 'and' ? ' E ' : ' OU ';
    lines.push(`${st.blocks.length > 1 ? `Bloco ${i + 1}: ` : ''}${b.conds.map((c) => describeCond(c, by.get(c.field))).join(joiner)}${scope}`);
  });
  return lines;
}

/** Exemplo de como {tutor} e {pets} ficam no aparelho (a substituição real é feita no envio). */
export function exampleOf(text: string | null | undefined): string {
  return (text ?? '').split('{tutor}').join('Ana').split('{pets}').join('Thor');
}
export const hasVariables = (text: string | null | undefined) => /\{(tutor|pets)\}/.test(text ?? '');

/** Nome legível do destino do toque (o backend manda a chave: produto, home, food…). */
export function destinationLabel(key: string | null | undefined, destinations: Record<string, string>): string {
  if (!key) return 'Tela inicial';
  return destinations[key] ?? key;
}

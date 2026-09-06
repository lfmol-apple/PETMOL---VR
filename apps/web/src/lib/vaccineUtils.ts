/**
 * Canonical vaccine utilities — single source of truth for ALL vaccine grouping logic.
 *
 * Used by:
 * - VaccineItemSheet (status sheet)
 * - alertsEngine (badge + HomeAlertsPanel)
 * - home/page.tsx (OCR post-import alert)
 * - saude/[petId]/page.tsx (saúde page)
 * - petCareDomain.ts (canonical care domain)
 * - RemindersSection (reminder engine foundation)
 *
 * Architecture
 * ─────────────────────────────────────────────────────────────────────────
 * Resolution priority for every vaccine record:
 *
 *  1. vaccine_code (backend catalog)
 *     When the backend has enriched the record via /api/health/vaccines/bulk-confirm
 *     or the vaccines endpoint, vaccine_code is already set to the authoritative
 *     catalog entry (e.g. "DOG_POLYVALENT_V8", "DOG_RABIES"). Use it directly.
 *
 *  2. VACCINE_ALIAS_TABLE (front-end mirror of backend catalog aliases)
 *     Applied when vaccine_code is absent (legacy records, manual entries that
 *     did not go through the catalog endpoint). Maps commercial brand names and
 *     common textual variants → canonical code.
 *     Longest-matching alias wins (most specific match).
 *
 *  3. Generic normalised name (last resort)
 *     Strips parenthetical qualifiers, annual/booster/reforço modifiers, and
 *     combining accents.  Falls back to vaccine_type if name is empty.
 *
 * WHY three levels?
 *  - Level 1 is perfect: backend knows the exact canonical code.
 *  - Level 2 solves the "commercial brand explosion" problem: "Vanguard Plus",
 *    "Nobivac DHPPI", "V10", "Polivalente" — all different strings, same vaccine
 *    group (DOG_POLYVALENT_V8). Without level 2, each would generate a separate
 *    overdue alert.
 *  - Level 3 ensures that previously-working exact name dedup still works for
 *    records with truly unique names not in the alias table.
 *
 * WHY NOT vaccine_type alone?
 *  vaccine_type is too coarse: V10 and V8 both have type "multiple" and would be
 *  merged into one group — hiding a real overdue for the other vaccine.
 */

import type { VaccineRecord } from '@/lib/petHealth';

// ---------------------------------------------------------------------------
// Normalisation helper
// ---------------------------------------------------------------------------

/**
 * Lowercase + strip combining diacritics.
 * Pure function, no side effects. Mirrors the backend `_normalise` function in
 * services/price-service/src/health/catalog/vaccines.py.
 */
export function normalizeVaccineText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip combining accents
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Commercial-name alias table
// ---------------------------------------------------------------------------
//
// Mirrors backend catalog at:
//   services/price-service/src/health/catalog/vaccines.py  VACCINE_CATALOG
//
// Rules:
// - All aliases are already lowercase + accent-stripped (no need to normalise again).
// - Ordered LONGEST-FIRST within each group so longest match wins in resolveVaccineCodeFromName.
// - The lookup uses both exact match and substring containment (same as backend).
// - Only UNAMBIGUOUS commercial/common names are included. Ambiguous single-component
//   names (e.g. bare "parainfluenza") are intentionally excluded to avoid over-merging.

interface AliasEntry { alias: string; code: string }

const VACCINE_ALIAS_TABLE: AliasEntry[] = [
  // ── DOG_POLYVALENT_V8 ─────────────────────────────────────────────────────
  // V8 / V10 / V12 polyvalent and all commercial brand names for this family.
  // The backend groups V8 ≡ V10 ≡ V12 ≡ Múltipla ≡ Vanguard ≡ Nobivac DHPPI, etc.
  { alias: 'nobivac dhppi',     code: 'DOG_POLYVALENT_V8' },
  { alias: 'nobivac canine',    code: 'DOG_POLYVALENT_V8' },
  { alias: 'canigen dhppi',     code: 'DOG_POLYVALENT_V8' },
  { alias: 'canigen dp',        code: 'DOG_POLYVALENT_V8' },
  { alias: 'vanguard plus',     code: 'DOG_POLYVALENT_V8' },
  { alias: 'polivalente v12',   code: 'DOG_POLYVALENT_V8' },
  { alias: 'polivalente v10',   code: 'DOG_POLYVALENT_V8' },
  { alias: 'polivalente v8',    code: 'DOG_POLYVALENT_V8' },
  { alias: 'hepatite canina',   code: 'DOG_POLYVALENT_V8' },
  { alias: 'duramune max',      code: 'DOG_POLYVALENT_V8' },
  { alias: 'hexavalente',       code: 'DOG_POLYVALENT_V8' },
  { alias: '10 em 1',           code: 'DOG_POLYVALENT_V8' },
  { alias: '8 em 1',            code: 'DOG_POLYVALENT_V8' },
  { alias: 'parvovirus',        code: 'DOG_POLYVALENT_V8' },
  { alias: 'parvovirus',        code: 'DOG_POLYVALENT_V8' },
  { alias: 'recombitek',        code: 'DOG_POLYVALENT_V8' },
  { alias: 'adenovirus',        code: 'DOG_POLYVALENT_V8' },
  { alias: 'polivalente',       code: 'DOG_POLYVALENT_V8' },
  { alias: 'cinomose',          code: 'DOG_POLYVALENT_V8' },
  { alias: 'distemper',         code: 'DOG_POLYVALENT_V8' },
  { alias: 'multipla',          code: 'DOG_POLYVALENT_V8' },  // "Múltipla" stripped
  { alias: 'vanguard',          code: 'DOG_POLYVALENT_V8' },
  { alias: 'duramune',          code: 'DOG_POLYVALENT_V8' },
  { alias: 'eurican',           code: 'DOG_POLYVALENT_V8' },
  { alias: 'biocan',            code: 'DOG_POLYVALENT_V8' },
  { alias: 'primodog',          code: 'DOG_POLYVALENT_V8' },
  { alias: 'dhppi',             code: 'DOG_POLYVALENT_V8' },
  { alias: 'parvo',             code: 'DOG_POLYVALENT_V8' },
  { alias: 'v12',               code: 'DOG_POLYVALENT_V8' },
  { alias: 'v10',               code: 'DOG_POLYVALENT_V8' },
  { alias: 'v8',                code: 'DOG_POLYVALENT_V8' },

  // ── DOG_RABIES ────────────────────────────────────────────────────────────
  // "raiva felina" must come BEFORE "raiva" so cat entries resolve to CAT_RABIES.
  { alias: 'antirrabica canina',  code: 'DOG_RABIES' },
  { alias: 'nobivac rabies',      code: 'DOG_RABIES' },
  { alias: 'nobivac raiva',       code: 'DOG_RABIES' },
  { alias: 'canigen rl',          code: 'DOG_RABIES' },  // combo R+L — raiva é o componente crítico
  { alias: 'canigen r',           code: 'DOG_RABIES' },  // "Canigen R" — raiva isolada MSD
  { alias: 'antirrabica',         code: 'DOG_RABIES' },  // "Antirrábica" stripped
  { alias: 'rabisin',             code: 'DOG_RABIES' },
  { alias: 'raivosa',             code: 'DOG_RABIES' },
  { alias: 'rabies',              code: 'DOG_RABIES' },
  { alias: 'imrab',               code: 'DOG_RABIES' },
  { alias: 'raiva',               code: 'DOG_RABIES' },

  // ── DOG_LEPTO ─────────────────────────────────────────────────────────────
  { alias: 'leptospirose',        code: 'DOG_LEPTO' },
  { alias: 'leptospira',          code: 'DOG_LEPTO' },
  { alias: 'lepto',               code: 'DOG_LEPTO' },

  // ── DOG_BORDETELLA ────────────────────────────────────────────────────────
  { alias: 'tosse dos canis',     code: 'DOG_BORDETELLA' },
  { alias: 'tosse de canil',      code: 'DOG_BORDETELLA' },
  { alias: 'kennel cough',        code: 'DOG_BORDETELLA' },
  { alias: 'bordetella',          code: 'DOG_BORDETELLA' },

  // ── DOG_INFLUENZA ─────────────────────────────────────────────────────────
  { alias: 'influenza canina',    code: 'DOG_INFLUENZA' },
  { alias: 'gripe canina',        code: 'DOG_INFLUENZA' },

  // ── CAT_POLYVALENT ────────────────────────────────────────────────────────
  // "tripla felina", "quadrupla felina", etc.  Must be BEFORE bare "felina".
  { alias: 'quadrupla felina',    code: 'CAT_POLYVALENT' },  // "Quádrupla" stripped
  { alias: 'quintupla felina',    code: 'CAT_POLYVALENT' },  // "Quíntupla" stripped
  { alias: 'tripla felina',       code: 'CAT_POLYVALENT' },
  { alias: 'purevax rcpch',       code: 'CAT_POLYVALENT' },
  { alias: 'rinotraqueite felina', code: 'CAT_POLYVALENT' },
  { alias: 'felocell',            code: 'CAT_POLYVALENT' },
  { alias: 'felovax',             code: 'CAT_POLYVALENT' },

  // ── CAT_RABIES ────────────────────────────────────────────────────────────
  // MUST come BEFORE DOG_RABIES entries in algorithm priority.
  // Longest-match handles: "raiva felina" (12) > "raiva" (5) → CAT_RABIES wins.
  { alias: 'antirrabica felina',  code: 'CAT_RABIES' },
  { alias: 'raiva felina',        code: 'CAT_RABIES' },
  { alias: 'imrab felina',        code: 'CAT_RABIES' },

  // ── CAT_FELV ──────────────────────────────────────────────────────────────
  { alias: 'leucemia felina',     code: 'CAT_FELV' },
  { alias: 'leucemia',            code: 'CAT_FELV' },
  { alias: 'felv',                code: 'CAT_FELV' },

  // ── CAT_FIV ───────────────────────────────────────────────────────────────
  { alias: 'imunodeficiencia felina', code: 'CAT_FIV' },  // "Imunodeficiência" stripped
  { alias: 'fiv',                 code: 'CAT_FIV' },
];

// ---------------------------------------------------------------------------
// Core alias resolver: name → canonical code (or null)
// ---------------------------------------------------------------------------

/**
 * Attempts to resolve a normalised vaccine name to a canonical vaccine_code
 * using VACCINE_ALIAS_TABLE.
 *
 * Algorithm (mirrors backend lookup_vaccine_code):
 *  1. Exact match
 *  2. Alias substring of input, or input substring of alias
 *  3. Among all matches, pick the one with the LONGEST alias (most specific)
 *
 * Returns null if no alias matches.
 */
function resolveVaccineCodeFromName(normalizedInput: string): string | null {
  if (!normalizedInput) return null;

  let best: AliasEntry | null = null;

  for (const entry of VACCINE_ALIAS_TABLE) {
    const { alias } = entry;
    // Unidirectional containment: alias must be a substring of (or equal to) the normalised input.
    // This ensures "raiva" does NOT match the alias "raiva felina" (which would give CAT_RABIES),
    // while "raiva felina" correctly matches both "raiva" (DOG_RABIES, len 5) AND
    // "raiva felina" (CAT_RABIES, len 12) — longest alias wins → CAT_RABIES.
    const isMatch = alias === normalizedInput || normalizedInput.includes(alias);

    if (isMatch && (!best || alias.length > best.alias.length)) {
      best = entry;
    }
  }

  return best ? best.code : null;
}

// ---------------------------------------------------------------------------
// vaccineGroupKey — canonical dedup key
// ---------------------------------------------------------------------------

/**
 * Returns the canonical group key for a vaccine record.
 *
 * This is the SINGLE function that decides how vaccine records are grouped
 * across the entire application. See module-level docstring for the three
 * resolution phases.
 */
export function vaccineGroupKey(v: Pick<VaccineRecord, 'vaccine_code' | 'vaccine_name' | 'vaccine_type'>): string {
  // Phase 1: backend catalog code (most authoritative)
  if (v.vaccine_code) return v.vaccine_code;

  const raw = v.vaccine_name || v.vaccine_type || '';
  const normalized = normalizeVaccineText(raw);

  // Phase 2: alias table lookup (commercial names → canonical codes)
  const resolvedCode = resolveVaccineCodeFromName(normalized);
  if (resolvedCode) return resolvedCode;

  // Phase 3: generic normalisation (strip parentheticals and temporal modifiers)
  return normalized
    .replace(/\(.*?\)/g, '')                                 // remove "(Múltipla)", "(Anual)" etc.
    .replace(/\b(anual|annual|booster|refor[cç]o|dose\s*\d+|\d+[aª°]\s*dose)\b/g, '')
    .replace(/[-\u2013\u2014]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// latestVaccinePerGroup — authoritative dedup pass
// ---------------------------------------------------------------------------

/**
 * Given a list of VaccineRecords, returns a Map keyed by vaccineGroupKey
 * containing only the MOST RECENT record per group (by date_administered).
 *
 * This is the single authoritative dedup pass used everywhere in the app.
 */
export function latestVaccinePerGroup(vaccines: VaccineRecord[]): Map<string, VaccineRecord> {
  const map = new Map<string, VaccineRecord>();
  for (const v of vaccines) {
    const key = vaccineGroupKey(v);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, v);
      continue;
    }
    const dt = v.date_administered
      ? new Date(v.date_administered.includes('T') ? v.date_administered : v.date_administered + 'T00:00:00').getTime()
      : 0;
    const prevDt = prev.date_administered
      ? new Date(prev.date_administered.includes('T') ? prev.date_administered : prev.date_administered + 'T00:00:00').getTime()
      : 0;
    if (!Number.isNaN(dt) && dt > prevDt) map.set(key, v);
  }
  return map;
}

// ---------------------------------------------------------------------------
// buildCanonicalVaccineState — structured canonical state per group
// ---------------------------------------------------------------------------

/** Status of a canonical vaccine group relative to today. */
export type VaccineGroupStatus = 'overdue' | 'upcoming' | 'upcomingFar' | 'ok' | 'unknown';

/**
 * Full canonical state for one vaccine group.
 * Consumed by home, /saude/[petId], reminders engine, alerts engine.
 */
export interface CanonicalVaccineGroup {
  /** Canonical code e.g. "DOG_POLYVALENT_V8".  Falls back to normalised name if alias table had no match. */
  code: string;
  /** Human-readable name from the most recent record. */
  displayName: string;
  /** Most recent vaccine record for this group. */
  latestRecord: VaccineRecord;
  /** ISO date of most recent application, or undefined. */
  lastApplied: string | undefined;
  /** ISO date of next required dose, or undefined (no booster scheduled). */
  nextDue: string | undefined;
  /** Computed status relative to today.  'ok' = applied, no booster within 90 days. */
  status: VaccineGroupStatus;
  /**
   * Days until next dose from today.
   * Negative = overdue by N days.
   * null = no next dose date.
   */
  daysToNextDue: number | null;
}

/**
 * Build the complete canonical vaccine state for a pet.
 *
 * Input: raw list of VaccineRecord objects as returned by the backend.
 * Output: one CanonicalVaccineGroup per deduplicated canonical group,
 *         sorted by urgency (overdue → upcoming → upcomingFar → ok → unknown).
 *
 * This is the PRIMARY consumer API for the reminders phase.
 * home/page.tsx and saude/[petId]/page.tsx should eventually migrate to this.
 */
export function buildCanonicalVaccineState(records: VaccineRecord[]): CanonicalVaccineGroup[] {
  const todayMs = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  const latestByGroup = latestVaccinePerGroup(records);

  const groups: CanonicalVaccineGroup[] = Array.from(latestByGroup.entries()).map(([code, v]) => {
    const nextDue = v.next_dose_date;
    let daysToNextDue: number | null = null;
    let status: VaccineGroupStatus = 'unknown';

    if (nextDue) {
      const nextMs = new Date(
        nextDue.includes('T') ? nextDue : nextDue + 'T12:00:00'
      ).getTime();
      daysToNextDue = Math.round((nextMs - todayMs) / 86400000);

      if (daysToNextDue < 0)        status = 'overdue';
      else if (daysToNextDue <= 30) status = 'upcoming';
      else if (daysToNextDue <= 90) status = 'upcomingFar';
      else                          status = 'ok';
    } else if (v.date_administered) {
      // Applied, no next dose scheduled = single-dose or series complete
      status = 'ok';
    }

    return {
      code,
      displayName: v.vaccine_name,
      latestRecord: v,
      lastApplied: v.date_administered || undefined,
      nextDue: nextDue || undefined,
      status,
      daysToNextDue,
    };
  });

  const ORDER: Record<VaccineGroupStatus, number> = {
    overdue: 0, upcoming: 1, upcomingFar: 2, ok: 3, unknown: 4,
  };

  return groups.sort((a, b) => (ORDER[a.status] ?? 4) - (ORDER[b.status] ?? 4));
}

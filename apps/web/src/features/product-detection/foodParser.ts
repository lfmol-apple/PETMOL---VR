import type { ResolvedProduct } from './types';
import {
  buildDominantTerms,
  dominantFunctionalLabel,
  dominantPortFromAudience,
  inferLifeStageFromDominantTerms,
  inferSpeciesFromDominantTerms,
  type DominantTerms,
} from './dominantTerms';

// ── Marcas conhecidas BR (ordem: mais específica primeiro) ─────────────────
const KNOWN_BRANDS: string[] = [
  "hill's science diet", "hills science diet", "hill's",
  'royal canin', 'pro plan', 'proplan',
  'premier pet', 'premier',
  'farmina n&d', 'farmina',
  'golden special', 'golden',
  'guabi natural', 'guabi',
  'formula natural', 'formula nat',
  'quatree', 'special dog', 'special cat',
  'pedigree', 'whiskas', 'friskies', 'fancy feast', 'felix', 'sheba',
  'purina', 'eukanuba', 'iams',
  'orijen', 'acana',
  'biofresh', 'naturalys', 'magnus', 'hercules',
  'three cats', 'equilibrio', 'equilíbrio',
  'vitarino', 'nutrapet', 'nutriplan', 'nutridog', 'nutricat',
  'alpo', 'beneful', 'dog chow', 'cat chow',
  'taste of the wild', 'blue buffalo', 'wellness', 'instinct',
  'merrick', 'canidae', 'diamond',
  'bassar', 'selection', 'smartheart', 'vitalcan',
  'total', 'finotrato', 'baw waw',
];

// ── Correções OCR comuns ────────────────────────────────────────────────────
const OCR_CORRECTIONS: Array<[RegExp, string]> = [
  [/r0yal/gi, 'Royal'],
  [/can[l1i]n/gi, 'Canin'],
  [/g0lden/gi, 'Golden'],
  [/g[o0]lden/gi, 'Golden'],
  [/pr[e3]mi[e3]r/gi, 'Premier'],
  [/r[o0]yal\s*c[a4]nin/gi, 'Royal Canin'],
  [/r[o0]yal/gi, 'Royal'],
  [/c[a4@]nin/gi, 'Canin'],
  [/pu[rn][i1]na/gi, 'Purina'],
  [/p[e3]digrr?[e3]/gi, 'Pedigree'],
  [/wh[i1]skas/gi, 'Whiskas'],
  [/f[a4@]rm[i1]na/gi, 'Farmina'],
  [/gu[a4@]b[i1]/gi, 'Guabi'],
  [/h[i1]ll'?s?/gi, "Hill's"],
  [/sc[i1][e3]nc[e3]/gi, 'Science'],
  [/[i1]ams/gi, 'Iams'],
  [/eukan[u0]ba/gi, 'Eukanuba'],
  [/\b0(?=[a-z])/gi, 'o'],  // zero seguido de letra → 'o'
  // Therapeutic term OCR corrections (confusions: 0↔o, 1↔l, v↔y, lJ↔U, i↔I)
  [/\blJrinary\b/g, 'urinary'],
  [/\bUrinarv\b/gi, 'urinary'],
  [/\bUr[i1]nar[yv]\b/gi, 'urinary'],
  [/\bRena[1]\b/gi, 'renal'],
  [/\bReria[l1]\b/gi, 'renal'],
  [/\bRen[a4][l1]\b/gi, 'renal'],
  [/\bHepat[i1]c\b/gi, 'hepatic'],
  [/\bGastr[o0][i1]ntest[i1]nal\b/gi, 'gastrointestinal'],
  [/\bH[i1]p[o0]alerg[eê]n[i1]co\b/gi, 'hipoalergenico'],
  [/\bD[i1]ab[eé]t[i1]co\b/gi, 'diabetico'],
  [/\bD[i1]abet[i1]c\b/gi, 'diabetic'],
];

const WEIGHT_RE = /\b(\d+(?:[,.]\d+)?)\s*(kg|g)\b/i;

// ── Tipos ──────────────────────────────────────────────────────────────────
export interface FoodFields {
  brand?: string;
  brandMatchMode?: 'exact' | 'fuzzy';
  productName?: string;
  line?: string;
  variant?: string;
  flavor?: string;
  species?: 'dog' | 'cat' | 'other';
  lifeStage?: 'puppy' | 'adult' | 'senior' | 'all';
  weight?: string;
  weightValue?: number;
  weightUnit?: 'kg' | 'g';
  port?: 'mini' | 'small' | 'medium' | 'large' | 'giant';
  dominantTerms: DominantTerms;
  rawTextBlobs: string[];
  searchQuery: string;
}

export interface BrandMatch {
  brand: string;
  mode: 'exact' | 'fuzzy';
}

export interface StructuredFoodInput {
  brand?: string | null;
  productName?: string | null;
  probableName?: string | null;
  species?: string | null;
  lifeStage?: string | null;
  weight?: string | null;
  weightValue?: number | null;
  weightUnit?: string | null;
  line?: string | null;
  variant?: string | null;
  flavor?: string | null;
  size?: string | null;
  visibleText?: string | null;
  reason?: string | null;
  rawTextBlobs?: Array<string | null | undefined> | null;
}

// ── Utilitários ────────────────────────────────────────────────────────────
function norm(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function applyOcr(text: string): string {
  let s = text;
  for (const [re, rep] of OCR_CORRECTIONS) s = s.replace(re, rep);
  return s;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function compactParts(parts: Array<string | null | undefined>): string[] {
  const unique = new Set<string>();
  for (const part of parts) {
    const text = typeof part === 'string' ? normalizeWhitespace(part) : '';
    if (text) unique.add(text);
  }
  return Array.from(unique);
}

function normalizeSpecies(value?: string | null): FoodFields['species'] {
  if (!value) return undefined;
  const normalized = norm(value);
  if (/\b(dog|cao|caoes|caes|canine|canino)\b/.test(normalized)) return 'dog';
  if (/\b(cat|gato|gatos|feline|felino)\b/.test(normalized)) return 'cat';
  if (/\b(other|pet|outro)\b/.test(normalized)) return 'other';
  return undefined;
}

function normalizeLifeStage(value?: string | null): FoodFields['lifeStage'] {
  if (!value) return undefined;
  const normalized = norm(value);
  if (/\b(filhote|puppy|puppies|kitten|junior)\b/.test(normalized)) return 'puppy';
  if (/\b(adult|adulto)\b/.test(normalized)) return 'adult';
  if (/\b(senior|s[eê]nior|mature|idos)\b/.test(normalized)) return 'senior';
  if (/\b(all|all ages|all life|todas as idades|todas as fases)\b/.test(normalized)) return 'all';
  return undefined;
}

function normalizeWeightUnit(value?: string | null): 'kg' | 'g' | undefined {
  if (!value) return undefined;
  const normalized = norm(value);
  if (normalized === 'kg' || normalized === 'kgs') return 'kg';
  if (normalized === 'g' || normalized === 'gram' || normalized === 'grams') return 'g';
  return undefined;
}

function buildStructuredWeight(weightValue?: number | null, weightUnit?: string | null): string | undefined {
  const numeric = typeof weightValue === 'number' && Number.isFinite(weightValue) && weightValue > 0
    ? weightValue
    : undefined;
  const unit = normalizeWeightUnit(weightUnit);
  if (!numeric || !unit) return undefined;
  if (Number.isInteger(numeric)) return `${numeric} ${unit}`;
  return `${String(numeric).replace('.', ',')} ${unit}`;
}

function splitVisibleText(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[\n|•]+/)
    .map(chunk => normalizeWhitespace(chunk))
    .filter(Boolean);
}

function getStructuredBlobs(input: StructuredFoodInput): string[] {
  return compactParts([
    input.brand,
    input.productName,
    input.probableName,
    input.line,
    input.variant,
    input.flavor,
    input.size,
    input.visibleText,
    input.reason,
    buildStructuredWeight(input.weightValue, input.weightUnit),
    input.weight,
    ...(input.rawTextBlobs ?? []),
    ...splitVisibleText(input.visibleText),
  ]);
}

function toStructuredInput(rawInput: string | StructuredFoodInput): StructuredFoodInput {
  if (typeof rawInput === 'string') {
    return {
      visibleText: rawInput,
      rawTextBlobs: splitVisibleText(rawInput),
    };
  }
  return rawInput;
}

function extractWeightFromBlobs(blobs: string[]): { weight?: string; weightValue?: number; weightUnit?: 'kg' | 'g' } {
  for (const blob of blobs) {
    const normalized = normalizeFoodWeight(blob);
    if (!normalized) continue;
    const match = normalized.match(/\b(\d+(?:[,.]\d+)?)\s*(kg|g)\b/i);
    if (!match) continue;
    return {
      weight: normalized,
      weightValue: Number(match[1].replace(',', '.')),
      weightUnit: match[2].toLowerCase() as 'kg' | 'g',
    };
  }
  return {};
}

function resolveFlavor(blobs: string[]): string | undefined {
  const patterns = [
    /\b(frango(?:\s+e\s+arroz)?)\b/i,
    /\b(salmao|salm[aã]o)\b/i,
    /\b(cordeiro)\b/i,
    /\b(frutas?)\b/i,
    /\b(carne)\b/i,
    /\b(peixe)\b/i,
  ];
  for (const blob of blobs) {
    for (const pattern of patterns) {
      const match = blob.match(pattern);
      if (match?.[1]) return normalizeWhitespace(match[1]);
    }
  }
  return undefined;
}

function buildSearchParts(fields: Omit<FoodFields, 'searchQuery'>): string[] {
  const lifeStageLabel = fields.lifeStage === 'puppy'
    ? 'filhote'
    : fields.lifeStage === 'senior'
      ? 'senior'
      : fields.lifeStage === 'adult'
        ? 'adulto'
        : fields.lifeStage === 'all'
          ? 'todas as idades'
          : undefined;
  const speciesLabel = fields.species === 'dog'
    ? 'cão'
    : fields.species === 'cat'
      ? 'gato'
      : fields.species === 'other'
        ? 'pet'
        : undefined;

  return compactParts([
    fields.brand,
    fields.productName,
    fields.line,
    fields.variant,
    fields.flavor,
    ...fields.dominantTerms.strongTerms,
    ...fields.dominantTerms.mediumTerms,
    lifeStageLabel,
    speciesLabel,
    fields.port,
    fields.weight,
  ]);
}

function normalizeFoodWeight(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = normalizeWhitespace(raw)
    .replace(/(\d)\s*[,.:]\s*(\d)/g, '$1,$2')
    .replace(/(\d)\s*([kK])\s*[gG]\b/g, '$1 kg')
    .replace(/(\d)\s*[gG]\b/g, '$1 g');
  const match = cleaned.match(/\b(\d+(?:[,.]\d+)?)\s*(kg|g)\b/i);
  if (!match) return undefined;
  const value = Number(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (unit === 'g' && value >= 1000) {
    const kg = (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1).replace('.', ',');
    return `${kg} kg`;
  }
  return `${match[1].replace('.', ',')} ${unit}`;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function fuzzyMatchBrandDetails(text: string): BrandMatch | undefined {
  const n = norm(text);
  // Exact substring match: collect ALL brands present, not just the first hit in
  // KNOWN_BRANDS order — a short/generic entry earlier in the list (e.g. "hill's")
  // must not win over a longer, more specific brand that's also genuinely present
  // (e.g. "premier") just because of list ordering.
  const exactMatches = KNOWN_BRANDS.filter(brand => n.includes(norm(brand)));
  if (exactMatches.length > 0) {
    exactMatches.sort((a, b) => b.length - a.length);
    return { brand: exactMatches[0], mode: 'exact' };
  }
  // 1-edit-distance fuzzy for brands ≥ 9 chars only — short fragments (5-6 chars)
  // are too likely to false-positive against unrelated text within edit distance 1.
  for (const brand of KNOWN_BRANDS) {
    if (brand.length < 9) continue;
    const nb = norm(brand);
    for (let i = 0; i <= n.length - nb.length + 1; i++) {
      if (levenshtein(n.slice(i, i + nb.length), nb) <= 1) {
        return { brand, mode: 'fuzzy' };
      }
    }
  }
  return undefined;
}

export function fuzzyMatchBrand(text: string): string | undefined {
  return fuzzyMatchBrandDetails(text)?.brand;
}

// ── Extração principal ─────────────────────────────────────────────────────
export function extractFoodFields(rawInput: string | StructuredFoodInput): FoodFields {
  const input = toStructuredInput(rawInput);
  const rawTextBlobs = getStructuredBlobs(input).map(blob => applyOcr(blob));
  const sanitized = normalizeWhitespace(rawTextBlobs.join(' '));
  const dominantTerms = buildDominantTerms({
    texts: [
      input.species,
      input.lifeStage,
      input.line,
      input.variant,
      input.flavor,
      input.size,
      input.visibleText,
      input.reason,
      ...rawTextBlobs,
    ],
    weakCandidates: [
      input.line,
      input.variant,
      input.flavor,
      input.size,
      buildStructuredWeight(input.weightValue, input.weightUnit),
      input.weight,
    ],
  });

  // Scan ONLY the raw OCR blobs for brand detection — do NOT include input.brand,
  // input.reason or input.productName since those are AI-generated and may contain
  // the wrong brand name (e.g. "Hill's" or "Premier"), causing self-confirmation.
  // visibleText is safe: it is built on the backend as a join of raw_text_blobs.
  const pureOcrText = normalizeWhitespace(
    [
      ...(input.rawTextBlobs ?? []),
      input.visibleText,
    ]
      .filter((s): s is string => Boolean(s?.trim()))
      .map(applyOcr)
      .join(' '),
  );
  const ocrBrandMatch = pureOcrText ? fuzzyMatchBrandDetails(pureOcrText) : undefined;
  // input.brand is the backend-verified brand — it already passed through an
  // independent-OCR hallucination guard server-side. This function used to
  // let ocrBrandMatch (a plain fuzzy match against rawTextBlobs, which can
  // contain a neighboring product's text — "Quatree"/"Dog Chow" from a
  // shelf photo, not the product actually being scanned) OVERRIDE it
  // whenever the two merely differed. That override is exactly what kept
  // turning correct results (e.g. "FORMULA NATURAL") back into contamination
  // from an adjacent bag, even after fixing every OUTER call site that reads
  // this function's output — because buildFoodSearchQueries calls this
  // function again internally, rebuilding the catalog search query around
  // the wrong brand before scoring ever gets a chance to matter. Only fall
  // back to the OCR guess when there's no verified brand at all.
  const brandMatch = input.brand?.trim()
    ? { brand: normalizeWhitespace(input.brand), mode: 'exact' as const }
    : (ocrBrandMatch ?? fuzzyMatchBrandDetails(sanitized));
  const brand = brandMatch?.brand;
  const productName = compactParts([input.productName, input.probableName])[0];
  const line = input.line?.trim()
    ? normalizeWhitespace(input.line)
    : dominantFunctionalLabel(dominantTerms.functionalTerms[0]);

  const variant = compactParts([input.variant, input.size])[0];
  const flavor = compactParts([input.flavor])[0] ?? resolveFlavor(rawTextBlobs);

  const species: FoodFields['species'] = normalizeSpecies(input.species) ?? inferSpeciesFromDominantTerms(dominantTerms);

  const lifeStage: FoodFields['lifeStage'] = normalizeLifeStage(input.lifeStage) ?? inferLifeStageFromDominantTerms(dominantTerms);

  const structuredWeight = normalizeFoodWeight(input.weight) ?? buildStructuredWeight(input.weightValue, input.weightUnit);
  const blobWeight = extractWeightFromBlobs(rawTextBlobs);
  const weight = structuredWeight ?? blobWeight.weight;
  const weightValue = structuredWeight
    ? Number(structuredWeight.match(WEIGHT_RE)?.[1]?.replace(',', '.'))
    : blobWeight.weightValue;
  const weightUnit = structuredWeight
    ? normalizeWeightUnit(structuredWeight.match(WEIGHT_RE)?.[2])
    : blobWeight.weightUnit;

  const port: FoodFields['port'] = dominantPortFromAudience(dominantTerms.audienceTerms);

  const parts = buildSearchParts({
    brand,
    brandMatchMode: brandMatch?.mode,
    productName,
    line,
    variant,
    flavor,
    species,
    lifeStage,
    weight,
    weightValue,
    weightUnit,
    port,
    dominantTerms,
    rawTextBlobs,
  });
  if (parts.length === 0 && rawTextBlobs[0]) parts.push(rawTextBlobs[0].slice(0, 60));

  return {
    brand,
    brandMatchMode: brandMatch?.mode,
    productName,
    line,
    variant,
    flavor,
    species,
    lifeStage,
    weight,
    weightValue,
    weightUnit,
    port,
    dominantTerms,
    rawTextBlobs,
    searchQuery: parts.join(' '),
  };
}

export function buildFoodSearchQueries(rawInput: string | StructuredFoodInput): string[] {
  const input = toStructuredInput(rawInput);
  const fields = extractFoodFields(input);
  const queries = compactParts([
    [fields.brand, fields.productName, fields.line, fields.variant, fields.flavor, fields.weight].filter(Boolean).join(' '),
    [fields.brand, fields.productName, fields.species, fields.lifeStage, fields.weight].filter(Boolean).join(' '),
    [fields.brand, fields.line, fields.variant, fields.species, fields.weight].filter(Boolean).join(' '),
    fields.dominantTerms.strongTerms.join(' '),
    fields.dominantTerms.mediumTerms.join(' '),
    fields.searchQuery,
    ...fields.rawTextBlobs.slice(0, 4),
  ]);

  return queries.map(query => normalizeWhitespace(String(query)).slice(0, 120)).filter(Boolean);
}

// ── Enriquecimento de produto já resolvido ─────────────────────────────────
export function enrichFoodProduct(product: ResolvedProduct): ResolvedProduct {
  if (product.category !== 'food') return product;

  const source = [product.name, product.brand, product.presentation, product.weight]
    .filter(Boolean)
    .join(' ');
  const fields = extractFoodFields(source);

  return {
    ...product,
    brand: product.brand ?? fields.brand,
    weight: product.weight ?? fields.weight,
    presentation: product.presentation ?? fields.weight,
  };
}

// ── Fallback: monta nome parcial para confirmação assistida ───────────────
export function buildPartialFoodName(
  inputOrBrand?: StructuredFoodInput | string | null,
  probableName?: string | null,
  species?: string | null,
  lifeStage?: string | null,
  weight?: string | null,
  line?: string | null,
  size?: string | null,
  flavor?: string | null,
  visibleText?: string | null,
  reason?: string | null,
): string | null {
  const structuredInput: StructuredFoodInput = typeof inputOrBrand === 'object' && inputOrBrand !== null
    ? inputOrBrand
    : {
      brand: typeof inputOrBrand === 'string' ? inputOrBrand : null,
      probableName,
      species,
      lifeStage,
      weight,
      line,
      size,
      flavor,
      visibleText,
      reason,
    };
  const extracted = extractFoodFields(structuredInput);
  const normalizedWeight = normalizeFoodWeight(structuredInput.weight) ?? buildStructuredWeight(structuredInput.weightValue, structuredInput.weightUnit) ?? extracted.weight;
  // Trust the backend-verified brand first — it already went through an
  // independent-OCR hallucination guard server-side. extracted.brand (a
  // plain client-side fuzzy match against raw text, no cross-validation) is
  // a fallback for when the backend has nothing, not an override: letting
  // it win whenever the two merely differ is how a correct "PremierPet" name
  // ends up prefixed with "Hill's Science Diet" again.
  const resolvedBrand = structuredInput.brand?.trim() || extracted.brand;
  const resolvedProductName = structuredInput.productName?.trim() || structuredInput.probableName?.trim() || extracted.productName;
  const resolvedSpecies = structuredInput.species?.trim() || extracted.species;
  const resolvedLifeStage = structuredInput.lifeStage?.trim() || extracted.lifeStage;
  const normalizedLine = structuredInput.line?.trim() || extracted.line;
  const normalizedVariant = structuredInput.variant?.trim() || structuredInput.size?.trim() || extracted.variant;
  const normalizedFlavor = structuredInput.flavor?.trim() || extracted.flavor;
  const speciesLabel = resolvedSpecies === 'dog'
    ? 'Cão'
    : resolvedSpecies === 'cat'
      ? 'Gato'
      : resolvedSpecies || undefined;
  const lifeStageLabel = resolvedLifeStage === 'puppy'
    ? 'Filhote'
    : resolvedLifeStage === 'adult'
      ? 'Adulto'
      : resolvedLifeStage === 'senior'
        ? 'Sênior'
        : resolvedLifeStage === 'all'
          ? 'Todas as idades'
          : resolvedLifeStage || undefined;

  // The AI often fills productName and line (or other fields) with the same
  // value — e.g. a sub-brand printed once on the pack ends up in both —
  // so dedupe by normalized text to avoid "PremierPet Formula Formula ...".
  const seenParts = new Set<string>();
  const parts = [
    resolvedBrand,
    resolvedProductName,
    normalizedLine,
    normalizedVariant,
    lifeStageLabel,
    speciesLabel,
    normalizedFlavor,
    normalizedWeight,
  ]
    .filter(Boolean)
    .map(part => normalizeWhitespace(String(part)))
    .filter(part => {
      const key = part.toLowerCase();
      if (seenParts.has(key)) return false;
      seenParts.add(key);
      return true;
    });

  if (parts.length === 0 && structuredInput.probableName?.trim()) {
    parts.push(normalizeWhitespace(structuredInput.probableName).slice(0, 80));
  }
  if (parts.length === 0 && extracted.rawTextBlobs.length > 0) {
    parts.push(normalizeWhitespace(extracted.rawTextBlobs.join(' ')).slice(0, 80));
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

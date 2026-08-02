import { getLocalProduct, saveLocalProduct } from './cache';
import type { ResolvedProduct } from './types';
import { API_BASE_URL } from '@/lib/api';
import { fetchFromCosmos } from './apis/cosmos';
import { fetchFromGlobal } from './apis/global';
import { buildFoodSearchQueries, buildPartialFoodName, enrichFoodProduct, extractFoodFields, type StructuredFoodInput } from './foodParser';
import { buildDominantTerms, compareDominantTerms, detectContradiction, hasStrongDominantTerms, type DominantTerms } from './dominantTerms';
import type { ProductCategory } from '@/lib/productScanner';

export type { ResolvedProduct };
export { getLocalProduct, saveLocalProduct } from './cache';

// Generic carrier/side-ingredient words ("arroz", "vegetais"...) show up
// across dozens of different flavors regardless of the actual protein — used
// both to score flavor overlap and to decide whether a title already names a
// specific flavor before appending a different one to the display name.
// Also includes pure grammatical connectors ("com", "de", "para"...) — these
// survive tokenize()'s length>=2 filter but carry zero flavor information of
// their own ("Frango com Legumes" and "Bacalhau com Tomate" share "com" no
// more meaningfully than they'd share a space). Confirmed in production:
// "com" alone let a completely different Fancy Feast flavor ("Petit Filets
// com Salmão") pass the conflict check meant to block exactly this, so the
// AI-read flavor ("Bacalhau com tomate e batata") got appended onto it,
// fabricating "...Petit Filets com Salmão... Bacalhau com tomate e batata".
const FLAVOR_GENERIC_WORDS = new Set([
  'arroz', 'vegetais', 'legumes', 'cereais', 'molho', 'sabor',
  'com', 'de', 'do', 'da', 'dos', 'das', 'para', 'em', 'ao', 'aos',
]);

type ProductLookupResponse = {
  ok: boolean;
  gtin: string;
  found: boolean;
  from_cache: boolean;
  queued: boolean;
  source?: ResolvedProduct['source'] | 'none' | null;
  error?: string | null;
  product?: {
    name?: string | null;
    brand?: string | null;
    category?: ResolvedProduct['category'] | string | null;
    image_url?: string | null;
    raw?: Record<string, unknown>;
  } | null;
};

export interface ProductPhotoVisionPayload {
  found?: boolean;
  product_name?: string | null;
  name?: string | null;
  probable_name?: string | null;
  brand?: string | null;
  category?: ProductCategory | null;
  weight?: string | null;
  weight_value?: number | null;
  weight_unit?: string | null;
  variant?: string | null;
  size?: string | null;
  manufacturer?: string | null;
  presentation?: string | null;
  confidence?: number | null;
  reason?: string | null;
  species?: string | null;
  life_stage?: string | null;
  port?: string | null;
  neutered?: boolean | null;
  line?: string | null;
  flavor?: string | null;
  visible_text?: string | null;
  raw_text_blobs?: string[] | null;
}

export type ProductDetectionOrigin = 'gtin' | 'ia' | 'parser' | 'fuzzy_match' | 'partial_name' | 'manual';
export type ProductDetectionResultType = 'complete' | 'partial' | 'fallback';
export type ProductDetectionConfidenceLevel = 'high' | 'medium' | 'low';

export interface ProductDetectionConfidence {
  score: number;
  level: ProductDetectionConfidenceLevel;
}

export interface ProductPhotoCandidate {
  product: ResolvedProduct;
  origin: ProductDetectionOrigin;
  resultType: ProductDetectionResultType;
  confidence: ProductDetectionConfidence;
  dominantTerms?: DominantTerms;
  assistedConfirmation?: boolean;
  strongTermConflicts?: string[];
  mediumTermConflicts?: string[];
}

interface CatalogSearchApiCandidate {
  source: string;
  title: string;
  brand?: string | null;
  variant?: string | null;
  species?: string | null;
  life_stage?: string | null;
  port?: string | null;
  neutered?: boolean | null;
  pack_sizes?: Array<{ value: number; unit: string }>;
}

interface CatalogSearchApiResponse {
  candidates?: CatalogSearchApiCandidate[];
}

interface CatalogMatchResult {
  product: ResolvedProduct;
  score: number;
  dominantTerms: DominantTerms;
  strongTermMatches: string[];
  mediumTermMatches: string[];
  strongTermConflicts: string[];
  mediumTermConflicts: string[];
}

const ALLOWED_CATEGORIES: ProductCategory[] = [
  'food',
  'medication',
  'antiparasite',
  'dewormer',
  'collar',
  'hygiene',
  'other',
];

const inFlight = new Map<string, Promise<ResolvedProduct | null>>();

function normalizeText(value?: string | null): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

// The AI often fills two different fields (e.g. product_name and line) with
// the same text — a sub-brand printed once on the pack ends up duplicated —
// so every name-composition path joins parts through this to avoid results
// like "PremierPet Formula Formula ...".
function joinUniqueParts(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  return parts
    .filter((part): part is string => Boolean(part))
    .filter(part => {
      const key = part.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ')
    .trim();
}

function normalizeCategory(category?: string | null, hint?: ProductCategory): ProductCategory {
  if (category && ALLOWED_CATEGORIES.includes(category as ProductCategory)) {
    return category as ProductCategory;
  }
  if (hint && ALLOWED_CATEGORIES.includes(hint)) {
    return hint;
  }
  return 'other';
}

function hasUsefulVisionPayload(payload: ProductPhotoVisionPayload): boolean {
  return Boolean(
    normalizeText(payload.product_name) ||
    normalizeText(payload.name) ||
    normalizeText(payload.probable_name) ||
    normalizeText(payload.brand) ||
    normalizeText(payload.weight) ||
    payload.weight_value != null ||
    normalizeText(payload.weight_unit) ||
    normalizeText(payload.species) ||
    normalizeText(payload.life_stage) ||
    normalizeText(payload.line) ||
    normalizeText(payload.variant) ||
    normalizeText(payload.size) ||
    normalizeText(payload.flavor) ||
    normalizeText(payload.visible_text) ||
    (payload.raw_text_blobs?.length ?? 0) > 0 ||
    payload.category,
  );
}

function toConfidenceLevel(score: number): ProductDetectionConfidenceLevel {
  if (score >= 0.8) return 'high';
  if (score >= 0.55) return 'medium';
  return 'low';
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function scorePhotoCandidate(args: {
  payload: ProductPhotoVisionPayload;
  category: ProductCategory;
  brand?: string;
  weight?: string;
  hasPayloadName: boolean;
  usedParser: boolean;
  fuzzyBrand: boolean;
  catalogScore?: number;
  species?: string | null;
  lifeStage?: string | null;
  strongConflictCount?: number;
  mediumConflictCount?: number;
  strongMatchCount?: number;
  mediumMatchCount?: number;
}): ProductDetectionConfidence {
  const baseAi = Number(args.payload.confidence ?? 0);
  let score = baseAi > 0 ? Math.min(0.65, baseAi * 0.65) : 0.2;

  if (args.hasPayloadName) score += 0.2;
  if (args.brand) score += 0.13;
  if (args.weight) score += 0.1;
  if (args.category === 'food' && (args.species || args.lifeStage)) score += 0.08;
  if (args.usedParser) score += 0.09;
  if (args.fuzzyBrand) score -= 0.07;
  if (typeof args.catalogScore === 'number') score += Math.min(0.24, args.catalogScore * 0.24);
  if (args.strongMatchCount) score += Math.min(0.18, args.strongMatchCount * 0.06);
  if (args.mediumMatchCount) score += Math.min(0.1, args.mediumMatchCount * 0.03);
  if (args.mediumConflictCount) score -= args.mediumConflictCount * 0.2;
  if (args.strongConflictCount) score -= 0.65 + args.strongConflictCount * 0.12;

  const normalized = clampScore(score);
  return { score: normalized, level: toConfidenceLevel(normalized) };
}

function normalizeRawTextBlobs(payload: ProductPhotoVisionPayload): string[] {
  const unique = new Set<string>();
  for (const item of payload.raw_text_blobs ?? []) {
    const normalized = normalizeText(item);
    if (normalized) unique.add(normalized);
  }
  const visibleText = normalizeText(payload.visible_text);
  if (visibleText) {
    for (const chunk of visibleText.split(/\n+/)) {
      const normalized = normalizeText(chunk);
      if (normalized) unique.add(normalized);
    }
  }
  return Array.from(unique).slice(0, 12);
}

function normalizeWeight(payload: ProductPhotoVisionPayload): string | undefined {
  const direct = normalizeText(payload.weight);
  if (direct) return direct;
  const value = payload.weight_value;
  const unit = normalizeText(payload.weight_unit)?.toLowerCase();
  if (value == null || !unit) return undefined;
  const normalizedValue = Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
  return `${normalizedValue} ${unit}`;
}

function toStructuredFoodInput(payload: ProductPhotoVisionPayload): StructuredFoodInput {
  return {
    brand: payload.brand,
    productName: payload.product_name,
    probableName: payload.probable_name,
    species: payload.species,
    lifeStage: payload.life_stage,
    port: payload.port,
    weight: normalizeWeight(payload) ?? payload.weight,
    weightValue: payload.weight_value,
    weightUnit: payload.weight_unit,
    line: payload.line,
    variant: payload.variant ?? payload.size,
    flavor: payload.flavor,
    size: payload.size,
    visibleText: payload.visible_text,
    reason: payload.reason,
    rawTextBlobs: normalizeRawTextBlobs(payload),
  };
}

function normalizeSpeciesToken(value?: string | null): string | undefined {
  const normalized = normalizeText(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (['dog', 'cao', 'cão', 'canine'].includes(normalized)) return 'dog';
  if (['cat', 'gato', 'feline'].includes(normalized)) return 'cat';
  if (['other', 'pet'].includes(normalized)) return 'other';
  return normalized;
}

function normalizeLifeStageToken(value?: string | null): string | undefined {
  const normalized = normalizeText(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (['puppy', 'filhote', 'kitten'].includes(normalized)) return 'puppy';
  if (['adult', 'adulto'].includes(normalized)) return 'adult';
  if (['senior', 'sênior', 'mature'].includes(normalized)) return 'senior';
  if (['all', 'all ages', 'todas as idades'].includes(normalized)) return 'all';
  return normalized;
}

function composeGenericName(payload: ProductPhotoVisionPayload): string | undefined {
  const joined = joinUniqueParts([
    normalizeText(payload.brand),
    normalizeText(payload.product_name),
    normalizeText(payload.line),
    normalizeText(payload.variant ?? payload.size),
    normalizeText(payload.flavor),
    normalizeWeight(payload),
  ]);
  if (joined) return joined;
  return normalizeRawTextBlobs(payload)[0]?.slice(0, 80);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2);
}

function formatPackSizes(packSizes?: Array<{ value: number; unit: string }>): string[] {
  if (!packSizes?.length) return [];
  return packSizes
    .filter(size => Number.isFinite(size.value) && typeof size.unit === 'string')
    .map(size => `${String(size.value).replace('.', ',')} ${size.unit.toLowerCase()}`);
}

function despacedForm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Exact single-token overlap misses real cases where the AI's OCR and the
// catalog's own title spell the same name with different word-splitting:
// "N&D" (tokenizes to single characters "n"/"d", both discarded by the
// length>=2 filter — an empty token set, silently disabling the check
// entirely) vs a title that spells it "N D"; "freshmeat" (one word, as
// Gemini read it) vs a catalog title spelling it "Fresh Meat" (two words);
// "Extralife" vs "Extra Life". Confirmed with 3 real cases across separate
// test runs — same root shape each time: identical name, different
// spacing, so no individual token ever matches even though the phrase
// clearly does. Falls back to comparing the space/punctuation-stripped
// forms as a substring check when the normal token overlap finds nothing.
function hasCompoundMatch(sourceText: string, candidateFullText: string): boolean {
  const sourceDespaced = despacedForm(sourceText);
  if (sourceDespaced.length < 2) return false;
  return despacedForm(candidateFullText).includes(sourceDespaced);
}

// A catalog title that's missing part of the flavor (source data truncated
// mid-phrase, e.g. "...Cordeiro" for a real "Cordeiro e Cenoura" product)
// still shares its FIRST word(s) with the flavor being appended — naively
// appending the full flavor phrase then duplicates that shared word
// ("...Cordeiro" + "Cordeiro e Cenoura" = "...Cordeiro Cordeiro e Cenoura").
// Confirmed in production: a real Premier "Cordeiro e Cenoura" 15kg scan
// displayed exactly that duplicate. Strips however many leading words of the
// suffix are already the trailing words of the title before joining.
function dedupeJoinOverlap(title: string, suffix: string): string {
  const titleWords = title.trim().split(/\s+/);
  const suffixWords = suffix.trim().split(/\s+/);
  let cut = 0;
  while (
    cut < suffixWords.length &&
    cut < titleWords.length &&
    despacedForm(titleWords[titleWords.length - 1 - cut]) === despacedForm(suffixWords[cut])
  ) {
    cut += 1;
  }
  return suffixWords.slice(cut).join(' ');
}

function scoreCatalogCandidate(candidate: CatalogSearchApiCandidate, payload: ProductPhotoVisionPayload, query: string): number {
  const queryTokens = tokenize(query);
  const candidateText = [
    candidate.title,
    candidate.brand,
    candidate.variant,
    candidate.species,
    ...formatPackSizes(candidate.pack_sizes),
  ].filter(Boolean).join(' ');
  const candidateTokens = new Set(tokenize(candidateText));

  let score = 0;
  if (queryTokens.length > 0) {
    let overlap = 0;
    for (const token of queryTokens) {
      if (candidateTokens.has(token)) overlap += 1;
    }
    score += overlap / queryTokens.length;
  }

  // Trust real/verified data over the (now retired) hand-curated Fase 1
  // catalog: every wrong-product-substitution bug found this session (Nattu,
  // Dog Chow, hidden pack-size variants...) came from that catalog being an
  // AI-compiled approximation with real gaps. A live Cobasi listing
  // (source="cobasi"), a candidate promoted from an actual confirmed scan
  // (source="catalog_promoted"), or an entry from the bulk Cobasi crawl with
  // a real EAN (source="catalog_verified", see catalog.py) are all real
  // data, not guesswork, so a close tie should favor them by default. Modest
  // bonus — it should break near-ties, not override a genuinely stronger match.
  if (candidate.source === 'cobasi' || candidate.source === 'catalog_promoted' || candidate.source === 'catalog_verified') {
    score += 0.12;
  }

  const brand = normalizeText(payload.brand)?.toLowerCase();
  const candidateBrand = normalizeText(candidate.brand)?.toLowerCase();
  if (brand && candidateBrand) {
    if (candidateBrand.includes(brand) || brand.includes(candidateBrand)) {
      score += 0.28;
    } else {
      // Different known brands — strong penalty to prevent cross-brand contamination
      // (e.g. "Hill's Science Diet Puppy" scoring high in a "royal canin" search).
      // BUT: a real package often prints both the manufacturer name and a
      // distinct marketed sub-brand (Purina/Fancy Feast, Farmina/Cibau,
      // Farmina/N&D, Total Alimentos/Equilíbrio) — Gemini reads both but only
      // one lands in the structured brand field, so a plain string mismatch
      // here doesn't mean "different company," just "different field of the
      // same package." Confirmed with 4 real cases across two independent
      // test runs: the correct catalog SKU kept losing to a wrong product
      // that merely shared payload.brand's exact string. Before penalizing,
      // check whether the OTHER name is verifiably present somewhere real:
      // either the candidate's own title/variant text names the brand we
      // read (Total Alimentos SKU whose title literally says "Equilíbrio"),
      // or what Gemini actually saw on the package (raw_text_blobs/
      // visible_text) names the candidate's brand (the "Fancy Feast" case —
      // Gemini put "Purina" in the structured field, but "Fancy Feast" is
      // right there in raw_text_blobs). A small bonus, not the full
      // same-brand one — this is evidence of a plausible relationship, not
      // certainty.
      const candidateTextLower = candidateText.toLowerCase();
      const payloadRawText = [payload.visible_text, ...(payload.raw_text_blobs ?? [])]
        .filter((s): s is string => Boolean(s))
        .join(' ')
        .toLowerCase();
      const brandSeenInCandidateText = candidateTextLower.includes(brand);
      const candidateBrandSeenInPayloadText = candidateBrand.length >= 3 && payloadRawText.includes(candidateBrand);
      if (brandSeenInCandidateText || candidateBrandSeenInPayloadText) {
        score += 0.05;
      } else {
        score -= 0.5;
      }
    }
  } else if (candidateBrand) {
    // We have no brand signal of our own (cleared by the hallucination guard, or
    // never detected), but the candidate carries a specific named brand. Matching
    // on species/weight/life-stage alone and silently adopting that brand is how
    // a Premier bag turns into "Hill's Science Diet" — those fields are shared by
    // dozens of products. Penalize hard enough that weak matches fall below the
    // acceptance threshold instead of being confidently confirmed.
    score -= 0.35;
  }

  const species = normalizeSpeciesToken(payload.species);
  const candidateSpecies = normalizeSpeciesToken(candidate.species);
  if (species && candidateSpecies && species === candidateSpecies) score += 0.12;

  const weight = normalizeWeight(payload)?.toLowerCase();
  if (weight) {
    const exactPackMatch = formatPackSizes(candidate.pack_sizes).some(pack => pack.toLowerCase() === weight);
    // Fallback for when pack_sizes isn't populated: look for the weight in
    // the free-text title, but word-bounded — a plain substring check let
    // "1 kg" match inside "0,1 kg" (100g), wrongly crediting a completely
    // different pack size just because its digits happen to end the same
    // way. Confirmed in production: two real cases (Dog Chow 1kg vs 100g
    // sachê, Whiskas 85g) where this false match tipped the score toward
    // the wrong weight variant.
    const escaped = weight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundedMatch = !exactPackMatch && new RegExp(`(?<![\\d,.])${escaped}`).test(candidateText.toLowerCase());
    if (exactPackMatch || wordBoundedMatch) {
      score += 0.16;
    }
  }

  const lifeStage = normalizeLifeStageToken(payload.life_stage);
  const title = candidate.title.toLowerCase();
  if (lifeStage === 'puppy' && /(filhote|puppy|kitten|junior)/.test(title)) score += 0.1;
  if (lifeStage === 'adult' && /(adult|adulto)/.test(title)) score += 0.1;
  if (lifeStage === 'senior' && /(senior|sênior|mature)/.test(title)) score += 0.1;

  // Port (breed size — mini/pequeno/medio/grande/gigante) is real, specific
  // signal the catalog carries per-line but was never compared against
  // before: a Premier "Ambientes Internos" bag (port=pequeno, matching the
  // "PEQUENO" callout on the actual package) has nothing to distinguish it
  // from "Nattu" (no port data) on brand/species/weight alone. A candidate
  // with no port data is neutral (most catalog entries don't have this yet,
  // absence isn't evidence of being wrong); an explicit different port is a
  // real mismatch.
  const port = payload.port?.toLowerCase();
  const candidatePort = candidate.port?.toLowerCase();
  if (port && candidatePort && candidatePort !== 'all') {
    const candidatePortParts = candidatePort.split('_');
    // payload.port can itself be compound now ("medio_grande" — a real bag
    // reading "Cães de Portes Médio e Grande") since the backend normalizer
    // was fixed to stop discarding multi-size readings. A candidate matches
    // if ANY of its sizes is among the sizes the payload actually read, not
    // just if the payload's whole (possibly compound) string equals one of
    // the candidate's parts.
    const payloadPortParts = port.split('_');
    if (payloadPortParts.some(p => candidatePortParts.includes(p))) {
      score += 0.12;
    } else {
      score -= 0.15;
    }
  }

  // Neutered ("castrado") is a real, deliberate SKU split for some lines
  // (Premier "Ambientes Internos Castrados", Royal Canin "Sterilised") — a
  // mismatch here (we know the pack says castrado, candidate is specifically
  // for non-neutered animals or vice versa) means it's the wrong variant.
  if (typeof payload.neutered === 'boolean' && typeof candidate.neutered === 'boolean') {
    score += payload.neutered === candidate.neutered ? 0.08 : -0.12;
  }

  // payload.product_name/line/variant name the SPECIFIC line (e.g. "Ambientes
  // Internos", "Gastrointestinal", "Labrador") — the words that actually
  // distinguish which product this is, unlike brand/species/weight/life-stage
  // which are shared by dozens of SKUs and already scored above. If we have
  // specific identity tokens but the candidate shares NONE of them, the
  // catalog is very likely just missing this exact line, and a generic
  // same-brand/same-weight product only scored high by accident (e.g. a
  // Premier "Ambientes Internos" bag matching "Premier Nattu Adulto" purely
  // on brand+species+weight). Penalize hard so it falls below the acceptance
  // threshold instead of confidently substituting a different real product.
  //
  // Two real production misses this missed before:
  //  1. `variant` wasn't included at all — a scan with product_name="Premier"
  //     (the AI just repeating the brand, not a real product name) and
  //     variant="Labrador" (the actual distinguishing word) had NO identity
  //     signal, so a same-brand/same-weight "Premier Nattu Adulto" matched
  //     with nothing to stop it.
  //  2. Brand tokens weren't excluded — when product_name IS just the brand
  //     name repeated, every same-brand candidate's own text trivially
  //     contains that word too (brand is always in candidateTokens), so
  //     `.some(...)` was satisfied by the brand alone and the check silently
  //     did nothing, for every candidate, regardless of actual line match.
  //     Exclude tokens from BOTH payload.brand ("PremierPet") and
  //     candidate.brand ("Premier") — the two sides can spell the same
  //     brand differently (with/without "Pet"), so only stripping one side
  //     still leaves the other's brand word free to satisfy the overlap
  //     check on its own (confirmed: stripping only payload.brand still let
  //     "premier" from candidate.brand pass this check for every Premier
  //     candidate regardless of line).
  const brandTokens = new Set([
    ...tokenize(normalizeText(payload.brand) ?? ''),
    ...tokenize(normalizeText(candidate.brand) ?? ''),
  ]);
  const identitySource = [payload.product_name, payload.variant].filter(Boolean).join(' ');
  const identityTokens = tokenize(identitySource).filter(t => !brandTokens.has(t));
  if (
    identityTokens.length > 0 &&
    !identityTokens.some(t => candidateTokens.has(t)) &&
    !hasCompoundMatch(identitySource, candidateText)
  ) {
    score -= 0.45;
  }

  // payload.line specifically names the SUB-LINE within a brand (e.g. Farmina
  // N&D's "Ancestral Grain" vs "Prime" — two real, different product lines,
  // sold at overlapping weights/ports/life-stages). This used to be folded
  // into identityTokens above alongside product_name/variant, which are often
  // generic port/pack descriptors ("Mini Breeds") shared across EVERY line a
  // brand sells. Since that check only requires .some() token to overlap, a
  // shared descriptor let it pass even when the actual line name didn't
  // match at all — confirmed in production: a real "Ancestral Grain" scan
  // (line correctly read from the package) resolved to a same-brand,
  // same-port "Prime" product instead, because "mini"/"breeds" satisfied the
  // combined check while "ancestral"/"grain" were never actually compared.
  // Splitting this into its own check means a real line mismatch can't hide
  // behind an unrelated descriptor token happening to overlap.
  const lineSource = normalizeText(payload.line) ?? '';
  const lineTokens = tokenize(lineSource).filter(t => !brandTokens.has(t));
  if (
    lineTokens.length > 0 &&
    !lineTokens.some(t => candidateTokens.has(t)) &&
    !hasCompoundMatch(lineSource, candidateText)
  ) {
    score -= 0.45;
  }

  // The catalog has no structured flavor field — it's baked into title/variant
  // free text, so nothing above ever compared it. Two SKUs of the same brand,
  // species, weight, life-stage and port routinely differ ONLY by flavor
  // (confirmed in production: a Fórmula Natural Sênior "Frango e Cenoura" scan
  // matched a same-brand different-flavor catalog entry because flavor never
  // factored into the score at all). Same treatment as the identity-token
  // check above: if we have a specific flavor reading but the candidate
  // shares none of its tokens, it's very likely a different flavor variant.
  const flavorSource = normalizeText(payload.flavor) ?? '';
  const flavorTokensRaw = tokenize(flavorSource);
  // Requiring only .some() token to overlap let generic carrier words alone
  // satisfy the check. Confirmed in production: "Salmão, Arroz e Vegetais"
  // matched a same-brand/weight/port "Frango, Arroz e Vegetais" candidate
  // because "arroz"/"vegetais" overlapped while the actual distinguishing
  // word (salmão vs frango) never did. When the reading has at least one
  // non-generic word, check overlap against those specifically; only fall
  // back to the full set if every word we read is itself generic (nothing
  // more specific to check against).
  const flavorSpecificTokens = flavorTokensRaw.filter(t => !FLAVOR_GENERIC_WORDS.has(t));
  const flavorTokens = flavorSpecificTokens.length > 0 ? flavorSpecificTokens : flavorTokensRaw;
  if (
    flavorTokens.length > 0 &&
    !flavorTokens.some(t => candidateTokens.has(t)) &&
    !hasCompoundMatch(flavorSource, candidateText)
  ) {
    score -= 0.3;
  }

  // Deliberately NOT clamped here. A candidate that matches on every signal
  // this function checks (brand, species, weight, life-stage, port,
  // neutered, verified source) can legitimately sum past 1.0 — up to ~1.98
  // in the best case. The caller (searchInternalCatalogCandidate) adds MORE
  // to this value afterward (dominant-term bonuses). Clamping here first and
  // letting the caller keep adding to the clamped value threw away exactly
  // the margin that should have kept a genuinely stronger candidate ahead of
  // a weaker one that picks up a few dominant-term bonuses — the same shape
  // of bug already found and fixed one level up (see bestRawScore below).
  // The only place a score should be capped is where it's finally turned
  // into a displayed confidence, at the bestMatch assignment below.
  return score;
}

async function searchInternalCatalogCandidate(
  payload: ProductPhotoVisionPayload,
  category: ProductCategory,
  queries: string[],
  expectedDominantTerms: DominantTerms,
): Promise<CatalogMatchResult | null> {
  const type = category === 'food' ? 'food' : 'product';
  let bestMatch: CatalogMatchResult | null = null;
  // Tracked separately from bestMatch.score, which is clampScore()'d to a
  // display-friendly max of 0.99 before being stored. Comparing a fresh
  // candidate's raw score against that already-capped stored value let a
  // strictly worse candidate win outright: e.g. a correct match scoring
  // 1.23 got stored as 0.99, then a wrong match scoring 1.06 passed
  // "1.06 > 0.99" and overwrote it — confirmed against a real production
  // scan (Premier "Ambientes Internos Castrados" 12kg resolving to the
  // wrong "Porte Médio" variant despite the AI correctly reading
  // port=pequeno/neutered=true from the package).
  let bestRawScore = -Infinity;

  // scoreCatalogCandidate's token-overlap term is measured against whichever
  // query string is passed in — but the loop below fetches with up to 4
  // DIFFERENT auto-generated queries (broad brand+species query, narrow
  // full-detail query, etc.), purely to maximize recall across candidates.
  // Scoring each candidate against the SAME query that happened to fetch it
  // makes that recall-only choice leak into the match score: a query that
  // merely echoes generic descriptor words ("Mini Breeds") can overlap more
  // with a WRONG same-brand/port candidate's title than the fullest query
  // does with the CORRECT candidate, letting the wrong one win purely on
  // token overlap even though the flavor check correctly penalizes it.
  // Confirmed in production: "N&D Prime ... Cordeiro e Blueberry" (a real,
  // exact-match SKU present in the results) lost to a same-brand/port/weight
  // "Frango e Romã" SKU whose title happened to contain "Mini Breeds"
  // verbatim, because the narrow query "Farmina N&D Prime Mini Breeds dog
  // mini" overlapped better with the wrong title than any query overlapped
  // with the right one. Scoring every candidate against the single fullest
  // query (queries[0], which folds in every field including flavor) removes
  // that per-query luck while still fetching broadly across all 4 queries.
  const scoringQuery = queries[0] ?? '';

  for (const query of queries.slice(0, 4)) {
    if (!query.trim()) continue;
    try {
      const params = new URLSearchParams({ q: query, type, limit: '8' });
      const staticFetch = fetch(`${API_BASE_URL}/catalog/search/v2?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(2400),
      });
      // Real Cobasi catalog, merged in ONLY for food — it keeps itself
      // current (variants we've never manually catalogued, like "Urinary
      // Small Dog" vs the generic "Urinary S/O"), closing the gap without
      // hand-curating every SKU. Scoped to food for now: for
      // antiparasite/medication, the "kg" in a real product title is the
      // PET's dosing-weight range, not the product's own package weight —
      // mixing that into weight-matching would be actively misleading
      // until that's parsed separately.
      const cobasiFetch = category === 'food'
        ? fetch(`${API_BASE_URL}/commerce/product-candidates?${new URLSearchParams({ q: query, limit: '6' }).toString()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(2400),
        }).catch(() => null)
        : Promise.resolve(null);

      const [response, cobasiResponse] = await Promise.all([staticFetch, cobasiFetch]);
      if (!response.ok) continue;
      const data = (await response.json()) as CatalogSearchApiResponse;
      let cobasiCandidates: CatalogSearchApiCandidate[] = [];
      if (cobasiResponse?.ok) {
        const cobasiData = (await cobasiResponse.json()) as CatalogSearchApiResponse;
        cobasiCandidates = cobasiData.candidates ?? [];
      }
      for (const candidate of [...(data.candidates ?? []), ...cobasiCandidates]) {
        const packSizes = formatPackSizes(candidate.pack_sizes);
        const candidateFields = extractFoodFields({
          brand: candidate.brand,
          productName: candidate.title,
          variant: candidate.variant,
          species: candidate.species,
          lifeStage: candidate.life_stage,
          weight: packSizes[0],
          rawTextBlobs: [candidate.title, candidate.brand, candidate.variant, candidate.species, ...packSizes],
        });
        const compatibility = compareDominantTerms(expectedDominantTerms, candidateFields.dominantTerms);
        if (compatibility.strongConflicts.length > 0) continue;

        let score = scoreCatalogCandidate(candidate, payload, scoringQuery);
        score += compatibility.strongMatches.length * 0.08;
        score += compatibility.mediumMatches.length * 0.04;
        score -= compatibility.mediumConflicts.length * 0.16;
        if (score < 0.55) continue;
        const weight = normalizeWeight(payload) ?? packSizes[0];
        // The catalog entry may not carry flavor at all (Fase 1 only records
        // flavors confirmed against a real scan, to avoid overriding a
        // correct AI reading with a guessed one — see foods_br_phase1.json).
        // When the AI grounded a flavor that isn't already reflected in the
        // catalog title, append it instead of silently dropping it. BUT only
        // when the title has no specific flavor of its own to begin with —
        // if it already names one (even a different one from what the AI
        // read), appending ours doesn't "fill a gap," it grafts a second,
        // contradicting flavor onto the name. Confirmed in production: a
        // wrong-candidate pick titled "...Sabor Frango e Romã 10Kg" got
        // displayed as "...Sabor Frango e Romã 10Kg Cordeiro e Blueberry" —
        // a hybrid flavor that doesn't exist, making a wrong match read as
        // if it had been correctly verified against the photo.
        const catalogFlavor = normalizeText(payload.flavor);
        const catalogTitleTokens = new Set(tokenize(candidate.title));
        const flavorAlreadyInTitle = catalogFlavor
          ? tokenize(catalogFlavor).every(t => catalogTitleTokens.has(t))
          : true;
        // Same check scoreCatalogCandidate uses to apply the flavor-mismatch
        // penalty: if our flavor's specific words share nothing with the
        // title (by token or compound-substring match), the title is very
        // likely naming a genuinely different flavor, not just phrasing ours
        // differently — appending in that case fabricates a hybrid.
        const flavorSpecificForDisplay = catalogFlavor
          ? tokenize(catalogFlavor).filter(t => !FLAVOR_GENERIC_WORDS.has(t))
          : [];
        const flavorConflictsWithTitle = flavorSpecificForDisplay.length > 0
          && !flavorSpecificForDisplay.some(t => catalogTitleTokens.has(t))
          && !hasCompoundMatch(catalogFlavor ?? '', candidate.title);
        const flavorRemainder = catalogFlavor ? dedupeJoinOverlap(candidate.title, catalogFlavor) : '';
        let displayName = catalogFlavor && !flavorAlreadyInTitle && !flavorConflictsWithTitle && flavorRemainder
          ? `${candidate.title} ${flavorRemainder}`
          : candidate.title;

        // Same idea for port: the catalog entry may be genuinely the only
        // real SKU (confirmed against a real case — Premier "Ambientes
        // Internos Castrados" only exists as one dog formula, not split by
        // port) but still not literally say "Porte Pequeno" in its own
        // title, even though the package does. Silently dropping a detail
        // the tutor can see on the bag reads as "did this even look at my
        // photo" — append it so the confirm screen echoes back everything
        // the AI verified, not just whatever the catalog title happened to
        // already contain.
        const PORT_LABELS: Record<string, string> = {
          mini: 'Porte Mini', pequeno: 'Porte Pequeno', medio: 'Porte Médio',
          grande: 'Porte Grande', gigante: 'Porte Gigante',
        };
        // Titles say "Raças Pequenas"/"Porte Pequeno"/"Cão Pequeno" — plural,
        // gendered, with or without "porte" — a single-token exact check
        // ("pequeno" as a whole word) misses "pequenas" and would append a
        // redundant "Porte Pequeno" onto a title that already says it.
        const PORT_SYNONYMS: Record<string, string[]> = {
          mini: ['mini', 'minis'],
          pequeno: ['pequeno', 'pequenos', 'pequena', 'pequenas'],
          medio: ['medio', 'medios', 'media', 'medias'],
          grande: ['grande', 'grandes'],
          gigante: ['gigante', 'gigantes'],
        };
        const payloadPort = payload.port?.toLowerCase();
        const portLabel = payloadPort ? PORT_LABELS[payloadPort] : undefined;
        const portAlreadyInTitle = payloadPort
          ? (PORT_SYNONYMS[payloadPort] ?? [payloadPort]).some(t => catalogTitleTokens.has(t))
          : true;
        if (portLabel && !portAlreadyInTitle) {
          displayName = `${displayName} ${portLabel}`;
        }
        const resolved: ResolvedProduct = {
          barcode: '',
          name: displayName,
          brand: normalizeText(candidate.brand) ?? normalizeText(payload.brand),
          weight,
          manufacturer: normalizeText(candidate.brand) ?? normalizeText(payload.brand),
          presentation: weight,
          category,
          source: 'internal',
        };
        if (score > bestRawScore) {
          bestRawScore = score;
          bestMatch = {
            product: category === 'food' ? enrichFoodProduct(resolved) : resolved,
            score: clampScore(score),
            dominantTerms: candidateFields.dominantTerms,
            strongTermMatches: compatibility.strongMatches,
            mediumTermMatches: compatibility.mediumMatches,
            strongTermConflicts: compatibility.strongConflicts,
            mediumTermConflicts: compatibility.mediumConflicts,
          };
        }
      }
    } catch {
      continue;
    }
  }

  return bestMatch;
}

export async function resolvePhotoProductCandidate(
  payload: ProductPhotoVisionPayload,
  options?: { hint?: ProductCategory; barcode?: string },
): Promise<ProductPhotoCandidate | null> {
  if (!hasUsefulVisionPayload(payload)) return null;

  const category = normalizeCategory(payload.category, options?.hint);
  let brand = normalizeText(payload.brand);
  const productName = normalizeText(payload.product_name);
  const probableName = normalizeText(payload.probable_name);
  const visibleText = normalizeText(payload.visible_text);
  const rawTextBlobs = normalizeRawTextBlobs(payload);
  let weight = normalizeWeight(payload);
  const manufacturer = normalizeText(payload.manufacturer) || brand;
  const presentation = normalizeText(payload.presentation) || weight;
  let name = normalizeText(payload.name) || productName || probableName;
  let origin: ProductDetectionOrigin = normalizeText(payload.name) ? 'ia' : productName ? 'ia' : 'partial_name';
  let usedParser = false;
  let fuzzyBrand = false;
  let aiContradicts = false;
  const structuredFoodInput = toStructuredFoodInput(payload);
  const parsedFoodFields = category === 'food' ? extractFoodFields(structuredFoodInput) : null;
  const dominantTerms = parsedFoodFields?.dominantTerms;

  if (category === 'food') {
    usedParser = true;
    const parsed = parsedFoodFields;
    if (!parsed) return null;
    fuzzyBrand = parsed.brandMatchMode === 'fuzzy';
    weight = weight ?? parsed.weight;
    // Only fall back to the client-side parser's brand guess when the
    // backend didn't provide one at all. The backend's brand already went
    // through an independent-OCR-grounded hallucination guard — letting this
    // weaker client-side re-derivation (a plain fuzzy match against
    // raw_text_blobs, no cross-validation) override an already-verified
    // brand whenever they merely *differ* is how a correct "PremierPet"
    // turns back into "Hill's Science Diet": raw_text_blobs can still
    // contain noise (a neighboring product, or the identification call's
    // own self-consistent phrasing) that fuzzy-matches a known brand even
    // when the verified brand field itself is completely correct.
    if (!brand && parsed.brand) {
      brand = parsed.brand;
    }

    // Guard: if the AI's product_name / full name contradicts what the scan actually shows,
    // strip the conflicting part so we build a name from the real scan evidence only.
    let safeInput = structuredFoodInput;
    const hasDominantConstraints = hasStrongDominantTerms(parsed.dominantTerms);

    if (hasDominantConstraints) {
      // ── Symmetric check ────────────────────────────────────────────────────
      // Fires when BOTH sides name a term in the same bucket with no overlap.
      // e.g. scan:puppy vs AI:adult, scan:dog vs AI:cat, scan:small-dog vs AI:maxi.
      const aiTexts = [
        structuredFoodInput.productName,
        structuredFoodInput.probableName,
        normalizeText(payload.name),
      ].filter((t): t is string => Boolean(t));
      const symmetricBlock = aiTexts.some(text => {
        const terms = buildDominantTerms({ texts: [text] });
        return detectContradiction(parsed.dominantTerms, terms).isHardBlock;
      });

      // ── Asymmetric check ───────────────────────────────────────────────────
      // Fires when scan has a THERAPEUTIC term (urinary, renal, …) but a
      // composed AI name specifies audience/life-stage WITHOUT any therapeutic
      // term. "Royal Canin Maxi Adult" for a Urinary S/O scan = hard block.
      // Covers both payload.name (full AI name) and probableName (composed by
      // the vision service from brand+product_name+line+variant).
      let asymmetricBlock = false;
      if (!symmetricBlock && parsed.dominantTerms.functionalTerms.length > 0) {
        const candidateFullNames = [
          normalizeText(payload.name),
          structuredFoodInput.probableName ?? undefined,
        ].filter((t): t is string => Boolean(t));
        asymmetricBlock = candidateFullNames.some(text => {
          const terms = buildDominantTerms({ texts: [text] });
          return (
            terms.functionalTerms.length === 0 &&
            (terms.audienceTerms.length > 0 || terms.lifeStageTerms.length > 0)
          );
        });
      }

      aiContradicts = symmetricBlock || asymmetricBlock;
      if (aiContradicts) {
        safeInput = { ...structuredFoodInput, productName: null, probableName: null };
        origin = 'parser';
      }
    }

    if (aiContradicts) {
      // Use only safe evidence; do NOT fall back to the wrong AI name.
      name = buildPartialFoodName(safeInput) ?? undefined;
    } else {
      name = buildPartialFoodName(structuredFoodInput) ?? name;
    }

    const correctedSafeInput = brand !== normalizeText(payload.brand) ? { ...safeInput, brand } : safeInput;
    const queries = buildFoodSearchQueries(correctedSafeInput);
    if (queries.length > 0) {
      const catalogPayload = brand !== normalizeText(payload.brand) ? { ...payload, brand } : payload;
      const catalogMatch = await searchInternalCatalogCandidate(catalogPayload, category, queries, parsed.dominantTerms);
      if (catalogMatch) {
        const hasStrongCompatibility = !hasStrongDominantTerms(parsed.dominantTerms) || catalogMatch.strongTermMatches.length > 0;
        const isTherapeutic = parsed.dominantTerms.functionalTerms.length > 0;
        const assistedConfirmation = isTherapeutic || !hasStrongCompatibility || catalogMatch.mediumTermConflicts.length > 0;
        const confidence = scorePhotoCandidate({
          payload,
          category,
          brand: catalogMatch.product.brand,
          weight: catalogMatch.product.weight,
          hasPayloadName: Boolean(normalizeText(payload.name) || productName),
          usedParser,
          fuzzyBrand,
          catalogScore: catalogMatch.score,
          species: payload.species,
          lifeStage: payload.life_stage,
          strongConflictCount: catalogMatch.strongTermConflicts.length,
          mediumConflictCount: catalogMatch.mediumTermConflicts.length,
          strongMatchCount: catalogMatch.strongTermMatches.length,
          mediumMatchCount: catalogMatch.mediumTermMatches.length,
        });
        return {
          product: {
            ...catalogMatch.product,
            barcode: options?.barcode ?? '',
          },
          origin: 'fuzzy_match',
          resultType: !assistedConfirmation && confidence.score >= 0.84 ? 'complete' : 'partial',
          confidence,
          dominantTerms: parsed.dominantTerms,
          assistedConfirmation,
          strongTermConflicts: catalogMatch.strongTermConflicts,
          mediumTermConflicts: catalogMatch.mediumTermConflicts,
        };
      }
    }
  }

  if (!name && category !== 'food') {
    const reasonHint = normalizeText(payload.reason)?.split('.')[0]?.trim();
    const genericName = composeGenericName(payload);
    if (genericName) {
      name = genericName;
    } else if (brand) {
      name = [brand, normalizeText(payload.line), normalizeText(payload.variant ?? payload.size), weight].filter(Boolean).join(' ');
    } else if (reasonHint && reasonHint.length > 4) {
      name = reasonHint.slice(0, 80);
    } else if (visibleText || rawTextBlobs.length > 0) {
      name = rawTextBlobs[0]?.slice(0, 80) || visibleText?.split('\n')[0]?.trim().slice(0, 80) || undefined;
    }
  }

  if (!name && category === 'food') {
    const fields = parsedFoodFields ?? extractFoodFields(structuredFoodInput);
    usedParser = true;
    origin = 'parser';
    fuzzyBrand = fields.brandMatchMode === 'fuzzy';
    weight = weight ?? fields.weight;
    const finalBrand = brand ?? fields.brand;
    name = joinUniqueParts([
      finalBrand, fields.productName, fields.line, fields.variant,
      payload.species ?? fields.species, payload.life_stage ?? fields.lifeStage, weight,
    ]) || undefined;
  }

  if (!name) {
    const genericPartial = joinUniqueParts([
      brand,
      normalizeText(payload.product_name),
      normalizeText(payload.line),
      normalizeText(payload.variant),
      normalizeText(payload.probable_name),
      normalizeText(payload.species),
      normalizeText(payload.life_stage),
      weight,
    ]);
    if (genericPartial) {
      name = genericPartial;
      origin = origin === 'ia' ? origin : 'partial_name';
    }
  }

  if (!name) return null;

  const resolved: ResolvedProduct = {
    barcode: options?.barcode ?? '',
    name,
    brand,
    weight,
    manufacturer,
    presentation,
    category,
    source: 'internal',
  };
  const enriched = category === 'food' ? enrichFoodProduct(resolved) : resolved;
  const confidence = scorePhotoCandidate({
    payload,
    category,
    brand: enriched.brand,
    weight: enriched.weight,
    // When AI name was overridden due to contradiction, treat as if no AI name existed.
    hasPayloadName: !aiContradicts && Boolean(normalizeText(payload.name) || productName),
    usedParser,
    fuzzyBrand,
    species: payload.species,
    lifeStage: payload.life_stage,
  });
  const isTherapeutic = category === 'food' && (dominantTerms?.functionalTerms.length ?? 0) > 0;
  const assistedConfirmation = isTherapeutic || aiContradicts || (category === 'food'
    ? !normalizeText(payload.name) || confidence.level !== 'high'
    : false);
  const resultType: ProductDetectionResultType = confidence.level === 'low'
    ? 'fallback'
    : category === 'food'
      ? assistedConfirmation
        ? 'partial'
        : 'complete'
      : normalizeText(payload.name)
        ? 'complete'
        : 'partial';

  return {
    product: enriched,
    origin,
    resultType,
    confidence,
    dominantTerms,
    assistedConfirmation,
    strongTermConflicts: [],
    mediumTermConflicts: [],
  };
}

export function scoreGtinResolution(source?: ResolvedProduct['source'] | string | null): ProductDetectionConfidence {
  const highSource = source === 'cache' || source === 'petmol_db' || source === 'history';
  const score = highSource ? 0.97 : source === 'cosmos' || source === 'internal' ? 0.92 : 0.86;
  return { score, level: toConfidenceLevel(score) };
}

function normalizeSource(source: ProductLookupResponse['source']): ResolvedProduct['source'] {
  if (source === 'cache' || source === 'cosmos' || source === 'history' || source === 'internal' || source === 'petmol_db') {
    return source;
  }
  return 'internal';
}

export async function resolveProductLookup(barcode: string): Promise<ProductLookupResponse | null> {
  try {
    console.info('[ProductScanner] lookupStarted', { barcode });
    const res = await fetch(`${API_BASE_URL}/products/lookup/gtin/${encodeURIComponent(barcode)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5500),
    });

    if (!res.ok) {
      console.info('[ProductScanner] lookupFailed', { barcode, status: res.status });
      return null;
    }

    const data = (await res.json()) as ProductLookupResponse;
    console.info('[ProductScanner] lookupResponse', {
      barcode,
      ok: data.ok,
      found: data.found,
      fromCache: data.from_cache,
      queued: data.queued,
      source: data.source,
      error: data.error,
    });
    return data;
  } catch {
    console.info('[ProductScanner] lookupException', { barcode });
    return null;
  }
}

async function resolveFreshProduct(barcode: string): Promise<ResolvedProduct | null> {
  const cached = getLocalProduct(barcode);
  if (cached) {
    console.info('[ProductScanner] cacheHit', { barcode, source: cached.source });
    return cached;
  }

  const data = await resolveProductLookup(barcode);
  if (data?.ok && data.found && data.product?.name) {
    const normalizedCategory = data.product.category;
    const category = (
      normalizedCategory === 'food' ||
      normalizedCategory === 'medication' ||
      normalizedCategory === 'antiparasite' ||
      normalizedCategory === 'dewormer' ||
      normalizedCategory === 'collar' ||
      normalizedCategory === 'hygiene' ||
      normalizedCategory === 'other'
    )
      ? normalizedCategory
      : 'other';

    const raw = data.product.raw ?? {};
    const manufacturer = typeof raw.manufacturer === 'string'
      ? raw.manufacturer
      : data.product.brand || undefined;
    const presentation = typeof raw.presentation === 'string'
      ? raw.presentation
      : undefined;
    const concentration = typeof raw.concentration === 'string'
      ? raw.concentration
      : undefined;
    const weight = typeof raw.weight === 'string'
      ? raw.weight
      : undefined;

    const product: ResolvedProduct = {
      barcode: data.gtin || barcode,
      name: data.product.name,
      brand: data.product.brand || undefined,
      image: data.product.image_url || undefined,
      weight,
      manufacturer,
      presentation,
      concentration,
      category,
      source: normalizeSource(data.source),
    };

    const enriched = enrichFoodProduct(product);
    saveLocalProduct(barcode, enriched);
    return enriched;
  }

  const cosmosProduct = await fetchFromCosmos(barcode);
  if (cosmosProduct) {
    console.info('[ProductScanner] cosmosFallbackHit', { barcode });
    const enriched = enrichFoodProduct(cosmosProduct);
    saveLocalProduct(barcode, enriched);
    return enriched;
  }

  const globalProduct = await fetchFromGlobal(barcode);
  if (globalProduct) {
    console.info('[ProductScanner] globalFallbackHit', { barcode });
    const enriched = enrichFoodProduct(globalProduct);
    saveLocalProduct(barcode, enriched);
    return enriched;
  }

  return null;
}

export async function resolveProduct(barcode: string): Promise<ResolvedProduct | null> {
  const existing = inFlight.get(barcode);
  if (existing) return existing;

  const pending = resolveFreshProduct(barcode)
    .finally(() => {
      inFlight.delete(barcode);
    });

  inFlight.set(barcode, pending);
  return pending;
}


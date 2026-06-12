export type DominantTermStrength = 'strong' | 'medium' | 'weak';
export type DominantTermBucket = 'functional' | 'life_stage' | 'audience' | 'species';

type PortValue = 'mini' | 'small' | 'medium' | 'large' | 'giant';

interface DominantTaxonomyEntry {
  key: string;
  label: string;
  bucket: DominantTermBucket;
  strength: Exclude<DominantTermStrength, 'weak'>;
  patterns: RegExp[];
}

export interface DominantTerms {
  strongTerms: string[];
  mediumTerms: string[];
  weakTerms: string[];
  functionalTerms: string[];
  lifeStageTerms: string[];
  audienceTerms: string[];
  speciesTerms: string[];
}

export interface DominantTermComparison {
  compatible: boolean;
  strongMatches: string[];
  mediumMatches: string[];
  strongConflicts: string[];
  mediumConflicts: string[];
}

const DOMINANT_TAXONOMY: DominantTaxonomyEntry[] = [
  {
    key: 'urinary',
    label: 'urinary',
    bucket: 'functional',
    strength: 'strong',
    patterns: [
      /\burinary\b/i,
      /\burin[aá]rio\b/i,
      /\burinary\s*(?:s[\/\\]?\s*o|so)\b/i,
    ],
  },
  { key: 'renal', label: 'renal', bucket: 'functional', strength: 'strong', patterns: [/\brenal\b/i] },
  { key: 'hepatic', label: 'hepatic', bucket: 'functional', strength: 'strong', patterns: [/\bhepatic\b/i, /\bhep[aá]tico\b/i] },
  {
    key: 'gastrointestinal',
    label: 'gastrointestinal',
    bucket: 'functional',
    strength: 'strong',
    patterns: [/\bgastro\s*intestinal\b/i, /\bgastrointestinal\b/i],
  },
  {
    key: 'hypoallergenic',
    label: 'hypoallergenic',
    bucket: 'functional',
    strength: 'strong',
    patterns: [/\bhypoallergenic\b/i, /\bhipoalerg[eê]nico\b/i, /\bhipoallergenic\b/i],
  },
  { key: 'diabetic', label: 'diabetic', bucket: 'functional', strength: 'strong', patterns: [/\bdiabetic\b/i, /\bdiab[eé]tico\b/i] },
  { key: 'satiety', label: 'satiety', bucket: 'functional', strength: 'strong', patterns: [/\bsatiety\b/i, /\bsaciedade\b/i] },
  { key: 'recovery', label: 'recovery', bucket: 'functional', strength: 'strong', patterns: [/\brecovery\b/i, /\brecupera[cç][aã]o\b/i] },

  {
    key: 'puppy',
    label: 'puppy',
    bucket: 'life_stage',
    strength: 'strong',
    patterns: [/\bpuppy\b/i, /\bfilhote\b/i, /\bjunior\b/i, /\bkitten\b/i],
  },
  {
    key: 'adult',
    label: 'adult',
    bucket: 'life_stage',
    strength: 'strong',
    patterns: [/\badult\b/i, /\badulto\b/i],
  },
  {
    key: 'senior',
    label: 'senior',
    bucket: 'life_stage',
    strength: 'strong',
    patterns: [/\bsenior\b/i, /\bs[eê]nior\b/i, /\bmature\b/i],
  },

  {
    key: 'mini',
    label: 'mini',
    bucket: 'audience',
    strength: 'medium',
    patterns: [/\bmini\b/i, /\btoy\b/i, /\bextra\s*small\b/i, /\bxs\b/i],
  },
  {
    key: 'small dog',
    label: 'small dog',
    bucket: 'audience',
    strength: 'medium',
    // NOTE: /\bsmall\b/ removed — too broad as hard block (catches "small bites", "small pouches")
    patterns: [/\bsmall\s*dog\b/i, /\bpequeno\s*porte\b/i, /\bra[cç]as?\s*pequenas\b/i],
  },
  {
    key: 'medium',
    label: 'medium',
    bucket: 'audience',
    strength: 'medium',
    patterns: [/\bmedium\b/i, /\bm[eé]dio\s*porte\b/i, /\bra[cç]as?\s*m[eé]dias\b/i],
  },
  {
    key: 'maxi',
    label: 'maxi',
    bucket: 'audience',
    strength: 'medium',
    patterns: [/\bmaxi\b/i, /\blarge\b/i, /\bgrande\s*porte\b/i, /\bra[cç]as?\s*grandes\b/i],
  },
  {
    key: 'indoor',
    label: 'indoor',
    bucket: 'audience',
    strength: 'medium',
    patterns: [/\bindoor\b/i, /\bambientes?\s*internos?\b/i, /\binterno\b/i],
  },
  {
    key: 'neutered',
    label: 'neutered',
    bucket: 'audience',
    strength: 'medium',
    patterns: [/\bcastrados?\b/i, /\bneutered\b/i, /\bsterilised\b/i, /\bsterilized\b/i],
  },

  {
    key: 'dog',
    label: 'dog',
    bucket: 'species',
    strength: 'strong',
    patterns: [/\bcanine\b/i, /\bdog\b/i, /\bc[aã]o\b/i, /\bc[aã]es\b/i],
  },
  {
    key: 'cat',
    label: 'cat',
    bucket: 'species',
    strength: 'strong',
    patterns: [/\bfeline\b/i, /\bcat\b/i, /\bgato\b/i, /\bgatos\b/i],
  },
];

const STRONG_BUCKETS: DominantTermBucket[] = ['functional', 'life_stage', 'species', 'audience'];
const MEDIUM_BUCKETS: DominantTermBucket[] = [];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactUnique(values: Array<string | null | undefined>): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = typeof value === 'string' ? normalizeText(value) : '';
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique);
}

function emptyDominantTerms(): DominantTerms {
  return {
    strongTerms: [],
    mediumTerms: [],
    weakTerms: [],
    functionalTerms: [],
    lifeStageTerms: [],
    audienceTerms: [],
    speciesTerms: [],
  };
}

export function buildDominantTerms(args: {
  texts: Array<string | null | undefined>;
  weakCandidates?: Array<string | null | undefined>;
}): DominantTerms {
  const result = emptyDominantTerms();
  const corpus = compactUnique(args.texts);

  for (const entry of DOMINANT_TAXONOMY) {
    if (!corpus.some(text => entry.patterns.some(pattern => pattern.test(text)))) continue;

    if (entry.strength === 'strong' && !result.strongTerms.includes(entry.label)) {
      result.strongTerms.push(entry.label);
    }
    if (entry.strength === 'medium' && !result.mediumTerms.includes(entry.label)) {
      result.mediumTerms.push(entry.label);
    }

    if (entry.bucket === 'functional' && !result.functionalTerms.includes(entry.label)) result.functionalTerms.push(entry.label);
    if (entry.bucket === 'life_stage' && !result.lifeStageTerms.includes(entry.label)) result.lifeStageTerms.push(entry.label);
    if (entry.bucket === 'audience' && !result.audienceTerms.includes(entry.label)) result.audienceTerms.push(entry.label);
    if (entry.bucket === 'species' && !result.speciesTerms.includes(entry.label)) result.speciesTerms.push(entry.label);
  }

  const reserved = new Set([...result.strongTerms, ...result.mediumTerms]);
  for (const candidate of compactUnique(args.weakCandidates ?? [])) {
    if (!reserved.has(candidate) && !result.weakTerms.includes(candidate)) {
      result.weakTerms.push(candidate);
    }
  }

  return result;
}

function intersect(values: string[], other: string[]): string[] {
  if (values.length === 0 || other.length === 0) return [];
  const right = new Set(other);
  return values.filter(value => right.has(value));
}

function compareBucket(expected: string[], actual: string[]): { matches: string[]; conflicts: string[] } {
  if (expected.length === 0 || actual.length === 0) {
    return { matches: [], conflicts: [] };
  }
  const matches = intersect(expected, actual);
  if (matches.length > 0) {
    return { matches, conflicts: [] };
  }
  return { matches: [], conflicts: expected };
}

export function compareDominantTerms(expected: DominantTerms, actual: DominantTerms): DominantTermComparison {
  const strongMatches: string[] = [];
  const mediumMatches: string[] = [];
  const strongConflicts: string[] = [];
  const mediumConflicts: string[] = [];

  const buckets = [
    ['functionalTerms', 'strong'] as const,
    ['lifeStageTerms', 'strong'] as const,
    ['speciesTerms', 'strong'] as const,
    ['audienceTerms', 'strong'] as const,
  ];

  for (const [bucket, severity] of buckets) {
    const comparison = compareBucket(expected[bucket], actual[bucket]);
    if (severity === 'strong') {
      strongMatches.push(...comparison.matches);
      strongConflicts.push(...comparison.conflicts);
    } else {
      mediumMatches.push(...comparison.matches);
      mediumConflicts.push(...comparison.conflicts);
    }
  }

  return {
    compatible: strongConflicts.length === 0,
    strongMatches: compactUnique(strongMatches),
    mediumMatches: compactUnique(mediumMatches),
    strongConflicts: compactUnique(strongConflicts),
    mediumConflicts: compactUnique(mediumConflicts),
  };
}

export function inferSpeciesFromDominantTerms(terms: DominantTerms): 'dog' | 'cat' | 'other' | undefined {
  if (terms.speciesTerms.includes('dog')) return 'dog';
  if (terms.speciesTerms.includes('cat')) return 'cat';
  return undefined;
}

export function inferLifeStageFromDominantTerms(terms: DominantTerms): 'puppy' | 'adult' | 'senior' | 'all' | undefined {
  if (terms.lifeStageTerms.includes('puppy')) return 'puppy';
  if (terms.lifeStageTerms.includes('adult')) return 'adult';
  if (terms.lifeStageTerms.includes('senior')) return 'senior';
  return undefined;
}

export function dominantFunctionalLabel(term?: string | null): string | undefined {
  if (!term) return undefined;
  const map: Record<string, string> = {
    urinary: 'Urinary',
    renal: 'Renal',
    hepatic: 'Hepatic',
    gastrointestinal: 'Gastrointestinal',
    hypoallergenic: 'Hypoallergenic',
    diabetic: 'Diabetic',
    satiety: 'Satiety',
    recovery: 'Recovery',
  };
  return map[term] ?? term;
}

export function dominantPortFromAudience(audienceTerms: string[]): PortValue | undefined {
  if (audienceTerms.includes('mini')) return 'mini';
  if (audienceTerms.includes('small dog')) return 'small';
  if (audienceTerms.includes('medium')) return 'medium';
  if (audienceTerms.includes('maxi')) return 'large';
  return undefined;
}

export function hasStrongDominantTerms(terms: DominantTerms): boolean {
  return STRONG_BUCKETS.some(bucket => {
    if (bucket === 'functional') return terms.functionalTerms.length > 0;
    if (bucket === 'life_stage') return terms.lifeStageTerms.length > 0;
    if (bucket === 'species') return terms.speciesTerms.length > 0;
    if (bucket === 'audience') return terms.audienceTerms.length > 0;
    return false;
  });
}

export function dominantTermBucketsSummary(terms: DominantTerms): string[] {
  const summary = [
    ...terms.functionalTerms,
    ...terms.lifeStageTerms,
    ...terms.speciesTerms,
    ...terms.audienceTerms,
  ];
  return compactUnique(summary);
}

export interface ContradictionResult {
  hasContradiction: boolean;
  strongConflicts: string[];
  mediumConflicts: string[];
  /** true when any bucket has terms on both sides but they don't overlap */
  isHardBlock: boolean;
}

/**
 * Detects whether a candidate actively contradicts scan evidence.
 * Unlike compareDominantTerms (which flags missing terms), this only fires when
 * BOTH sides name a term in the same bucket and they are incompatible.
 * Used to validate AI-suggested names against what the scan actually shows.
 */
export function detectContradiction(
  inputTerms: DominantTerms,
  candidateTerms: DominantTerms,
): ContradictionResult {
  const conflicts: string[] = [];

  const buckets = [
    'functionalTerms',
    'lifeStageTerms',
    'speciesTerms',
    'audienceTerms',
  ] as const;

  for (const bucket of buckets) {
    const input = inputTerms[bucket];
    const candidate = candidateTerms[bucket];
    if (input.length === 0 || candidate.length === 0) continue;
    const hasOverlap = input.some(t => candidate.includes(t));
    if (!hasOverlap) conflicts.push(...input);
  }

  const unique = [...new Set(conflicts)];
  return {
    hasContradiction: unique.length > 0,
    strongConflicts: unique,
    mediumConflicts: [],
    isHardBlock: unique.length > 0,
  };
}

export { MEDIUM_BUCKETS, STRONG_BUCKETS };
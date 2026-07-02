import type { VaultBatchDocItem, VaultPetDocument } from './types';

/** Max |Δcreated_at| for two file docs to count as possible duplicates (same pet, size, mime). */
export const VAULT_DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Parse `created_at` from API as UTC epoch ms. RFC3339 with Z/offset is standard; if a legacy
 * ISO string has no timezone, treat as UTC to match backend contract after PetDocumentOut serializer.
 */
export function parseVaultInstantMs(iso: string): number {
  const s = iso.trim();
  if (!s) return NaN;
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !hasTz) {
    return Date.parse(`${s}Z`);
  }
  return Date.parse(s);
}

/** Calendar date only (YYYY-MM-DD): format in local calendar without UTC midnight shift. */
export function fmtVaultCalendarDateOnly(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const local = new Date(y, mo - 1, d);
  return local.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Clusters of ≥2 file docs: same size_bytes, mime_type, created_at within window (connected components). */
function getDuplicateFileClusters(docs: VaultPetDocument[]): VaultPetDocument[][] {
  const fileDocs = docs.filter(
    (d) =>
      d.kind === 'file' &&
      d.size_bytes != null &&
      d.mime_type != null &&
      String(d.mime_type).length > 0
  );
  const n = fileDocs.length;
  if (n < 2) return [];

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let x = i;
    while (parent[x] !== x) x = parent[x];
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = fileDocs[i];
      const b = fileDocs[j];
      if (a.size_bytes !== b.size_bytes) continue;
      if ((a.mime_type || '') !== (b.mime_type || '')) continue;
      const ta = parseVaultInstantMs(a.created_at);
      const tb = parseVaultInstantMs(b.created_at);
      if (Number.isNaN(ta) || Number.isNaN(tb)) continue;
      if (Math.abs(ta - tb) <= VAULT_DUPLICATE_WINDOW_MS) union(i, j);
    }
  }

  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = byRoot.get(r) ?? [];
    arr.push(i);
    byRoot.set(r, arr);
  }

  const clusters: VaultPetDocument[][] = [];
  for (const indices of byRoot.values()) {
    if (indices.length >= 2) {
      clusters.push(indices.map((idx) => fileDocs[idx]));
    }
  }
  return clusters;
}

/**
 * IDs of file documents that belong to a cluster of ≥2 docs with same size_bytes, mime_type,
 * and pairwise created_at within VAULT_DUPLICATE_WINDOW_MS (connected components).
 */
export function getPossibleDuplicateDocIds(docs: VaultPetDocument[]): Set<string> {
  const ids = new Set<string>();
  for (const c of getDuplicateFileClusters(docs)) {
    for (const d of c) ids.add(d.id);
  }
  return ids;
}

/**
 * For each doc that is part of a duplicate cluster, maps doc id → id of the kept document
 * (oldest by created_at, tie-break id).
 */
export function getDuplicateKeeperIdByDocId(docs: VaultPetDocument[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const cluster of getDuplicateFileClusters(docs)) {
    const sorted = [...cluster].sort((a, b) => {
      const ta = parseVaultInstantMs(a.created_at);
      const tb = parseVaultInstantMs(b.created_at);
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
    const keeperId = sorted[0]!.id;
    for (const d of cluster) {
      map.set(d.id, keeperId);
    }
  }
  return map;
}

/** Other documents (same pet list) that match size/mime/created window; excludes candidate id. */
export function findVaultSimilarDocuments(
  candidate: Pick<VaultBatchDocItem, 'id' | 'size_bytes' | 'mime_type' | 'created_at'>,
  docs: VaultPetDocument[]
): VaultPetDocument[] {
  const sz = candidate.size_bytes;
  const mime = candidate.mime_type;
  const created = candidate.created_at;
  if (sz == null || !mime || !created) return [];
  const t0 = parseVaultInstantMs(created);
  if (Number.isNaN(t0)) return [];

  return docs.filter((d) => {
    if (d.id === candidate.id) return false;
    if (d.kind !== 'file') return false;
    if (d.size_bytes !== sz) return false;
    if ((d.mime_type || '') !== mime) return false;
    const t1 = parseVaultInstantMs(d.created_at);
    if (Number.isNaN(t1)) return false;
    return Math.abs(t1 - t0) <= VAULT_DUPLICATE_WINDOW_MS;
  });
}

export function fmtVaultBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtVaultDate(s: string | null): string {
  if (!s) return '';
  try {
    const t = s.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      return fmtVaultCalendarDateOnly(t);
    }
    return new Date(parseVaultInstantMs(t)).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return s;
  }
}

function resolveVaultDocDate(documentDate: string | null, createdAt: string): string {
  if (!documentDate) return createdAt;
  try {
    const docMs = new Date(documentDate).getTime();
    const uploadMs = new Date(createdAt).getTime();
    const twoYearsMs = 2 * 365.25 * 24 * 60 * 60 * 1000;
    if (docMs >= uploadMs - twoYearsMs) return documentDate;
  } catch {
    // malformed — fall through
  }
  return createdAt;
}

/** Group documents by calendar month label (pt-BR), same logic as previous inline useMemo. */
export function groupVaultDocumentsByMonth(docs: VaultPetDocument[]): Array<[string, VaultPetDocument[]]> {
  const groups = new Map<string, VaultPetDocument[]>();
  docs.forEach((doc) => {
    const dateKey = resolveVaultDocDate(doc.document_date, doc.created_at);
    let label = 'Sem data';
    try {
      const dk = dateKey.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dk)) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dk);
        if (m) {
          const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
          label = local.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
          label = label.charAt(0).toUpperCase() + label.slice(1);
        }
      } else {
        const ms = parseVaultInstantMs(dk);
        if (!Number.isNaN(ms)) {
          const d = new Date(ms);
          label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
          label = label.charAt(0).toUpperCase() + label.slice(1);
        }
      }
    } catch {
      // keep fallback label
    }
    const current = groups.get(label) || [];
    current.push(doc);
    groups.set(label, current);
  });
  return Array.from(groups.entries());
}

/** Normalize API list to vault document type (identity when API matches). */
export function vaultDocumentsFromApi(data: unknown): VaultPetDocument[] {
  if (!Array.isArray(data)) return [];
  return data as VaultPetDocument[];
}

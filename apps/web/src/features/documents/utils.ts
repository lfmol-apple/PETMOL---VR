export function fmtBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtDate(s: string | null): string {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return s;
  }
}

/**
 * Returns document_date if plausible, otherwise falls back to created_at.
 * A date is considered implausible if it's more than 2 years before created_at
 * (catches wrong DICOM/EXIF metadata) or before year 2000.
 */
export function resolveDocDate(documentDate: string | null, createdAt: string): string | null {
  if (!documentDate) return createdAt;
  try {
    const docMs = new Date(documentDate).getTime();
    const uploadMs = new Date(createdAt).getTime();
    const twoYearsMs = 2 * 365.25 * 24 * 60 * 60 * 1000;
    if (docMs >= uploadMs - twoYearsMs) return documentDate;
  } catch {
    // malformed date — fall through
  }
  return createdAt;
}

export function replaceFileExtension(fileName: string, ext: string): string {
  const base = fileName.replace(/\.[^/.]+$/, '');
  return `${base || 'documento'}${ext}`;
}

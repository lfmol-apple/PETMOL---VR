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

/** Returns document_date if plausible (>= 2010), otherwise falls back to created_at. */
export function resolveDocDate(documentDate: string | null, createdAt: string): string | null {
  if (!documentDate) return createdAt;
  try {
    const year = new Date(documentDate).getFullYear();
    if (year >= 2010) return documentDate;
  } catch {
    // malformed date — fall through
  }
  return createdAt;
}

export function replaceFileExtension(fileName: string, ext: string): string {
  const base = fileName.replace(/\.[^/.]+$/, '');
  return `${base || 'documento'}${ext}`;
}

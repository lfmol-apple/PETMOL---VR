/** dd/mm/aaaa a partir de uma data ISO (aaaa-mm-dd). */
export function formatGuideDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

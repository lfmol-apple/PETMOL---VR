import type { CabinetCategory, CabinetItem } from '@/lib/cabinetApi';

export const CABINET_CATEGORY_LABEL: Record<CabinetCategory, string> = {
  higiene: 'Higiene',
  alimentacao: 'Alimentação',
  saude: 'Saúde',
  brinquedos: 'Brinquedos',
  passeio: 'Passeio',
  outros: 'Outros',
};

export const CABINET_CATEGORY_ORDER: CabinetCategory[] = ['higiene', 'alimentacao', 'saude', 'passeio', 'brinquedos', 'outros'];

/** Opções de "dura cerca de" (dias). */
export const CABINET_DURATIONS: { days: number; label: string }[] = [
  { days: 15, label: '15 dias' },
  { days: 30, label: '1 mês' },
  { days: 60, label: '2 meses' },
  { days: 90, label: '3 meses' },
  { days: 180, label: '6 meses' },
];

/** "Dura praticamente a vida toda" (comedouro, bebedouro…): prazo enorme, sem aviso de "acabando". */
export const CABINET_DURABLE_DAYS = 36500;
export function isDurable(days?: number | null): boolean {
  return typeof days === 'number' && days >= 3650;
}

export type CabinetUrgency = 'none' | 'ok' | 'soon' | 'out';

/** 'soon' = faltam 7 dias ou menos; 'out' = o prazo já passou. Sem prazo informado = 'none'. */
export function cabinetUrgency(item: Pick<CabinetItem, 'days_left'> & { duration_days?: number | null }): CabinetUrgency {
  if (item.days_left == null || isDurable(item.duration_days)) return 'none';
  if (item.days_left < 0) return 'out';
  if (item.days_left <= 7) return 'soon';
  return 'ok';
}

export function cabinetStatusText(item: Pick<CabinetItem, 'days_left'> & { duration_days?: number | null }): string | null {
  if (isDurable(item.duration_days)) return 'Dura muito tempo';
  const d = item.days_left;
  if (d == null) return null;
  if (d < 0) return `Acabou há ${-d} dia${d === -1 ? '' : 's'}`;
  if (d === 0) return 'Acaba hoje';
  return `Acaba em ${d} dia${d === 1 ? '' : 's'}`;
}

/** Itens que pedem atenção primeiro (prazo vencido ou perto), depois o resto. */
export function sortCabinet(items: CabinetItem[]): CabinetItem[] {
  const rank = (i: CabinetItem) => (i.days_left == null || isDurable(i.duration_days) ? 1e6 : i.days_left);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/**
 * O que vai para a busca das lojas ao tocar em Comprar: o NOME do produto (com a marca, se ela não estiver no nome).
 * As lojas buscam por texto — o código de barras não acha nada na busca delas.
 */
export function cabinetSearchTerm(item: Pick<CabinetItem, 'name' | 'brand'>): string {
  const name = (item.name || '').trim();
  const brand = (item.brand || '').trim();
  if (brand && !name.toLowerCase().includes(brand.toLowerCase())) return `${brand} ${name}`.trim();
  return name;
}

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set(['para', 'com', 'sem', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'pet', 'cao', 'caes', 'gato', 'gatos']);
const tokens = (t: string) => norm(t).split(' ').filter((w) => w.length >= 3 && !STOP.has(w));

/** Consultas para achar a foto, da mais específica à mais curta (o catálogo falha com nomes muito longos). */
export function imageSearchQueries(item: { name: string; gtin?: string | null }): string[] {
  const out: string[] = [];
  if (item.gtin) out.push(item.gtin);
  const words = item.name.trim().split(/\s+/);
  out.push(item.name.trim());
  if (words.length > 3) out.push(words.slice(0, 3).join(' '));
  return Array.from(new Set(out));
}

/** Escolhe, entre resultados do catálogo, a foto do MESMO produto: GTIN igual, ou título que contém a maior parte das palavras do nome. Sem certeza, nada. */
export function pickProductImage(
  item: { name: string; gtin?: string | null },
  results: { gtin: string; title: string | null; image_url: string | null }[],
): string | null {
  const withImage = results.filter((r) => r.image_url);
  if (item.gtin) {
    const hit = withImage.find((r) => r.gtin === item.gtin);
    if (hit) return hit.image_url;
  }
  const want = tokens(item.name);
  if (want.length === 0) return null;
  let best: { url: string; score: number } | null = null;
  for (const r of withImage) {
    if (!r.title) continue;
    const have = new Set(tokens(r.title));
    const score = want.filter((w) => have.has(w)).length / want.length;
    if (score >= 0.6 && (!best || score > best.score)) best = { url: r.image_url as string, score };
  }
  return best?.url ?? null;
}

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

export type CabinetUrgency = 'none' | 'ok' | 'soon' | 'out';

/** 'soon' = faltam 7 dias ou menos; 'out' = o prazo já passou. Sem prazo informado = 'none'. */
export function cabinetUrgency(item: Pick<CabinetItem, 'days_left'>): CabinetUrgency {
  if (item.days_left == null) return 'none';
  if (item.days_left < 0) return 'out';
  if (item.days_left <= 7) return 'soon';
  return 'ok';
}

export function cabinetStatusText(item: Pick<CabinetItem, 'days_left'>): string | null {
  const d = item.days_left;
  if (d == null) return null;
  if (d < 0) return `Acabou há ${-d} dia${d === -1 ? '' : 's'}`;
  if (d === 0) return 'Acaba hoje';
  return `Acaba em ${d} dia${d === 1 ? '' : 's'}`;
}

/** Itens que pedem atenção primeiro (prazo vencido ou perto), depois o resto. */
export function sortCabinet(items: CabinetItem[]): CabinetItem[] {
  const rank = (i: CabinetItem) => (i.days_left == null ? 1e6 : i.days_left);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

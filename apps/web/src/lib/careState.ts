/**
 * Escala ÚNICA de estado do cuidado — "como está este cuidado".
 *
 * Substitui as escalas de estado que hoje vivem soltas e discordantes em
 * RemindersSection.urgencyStyle, ParasiteItemSheet (inline) e
 * VaccineItemSheet.computeStatus.
 *
 * Regra do sistema cromático PETMOL (Modelo C, auditoria 06/09/2026):
 *  - estado usa cores PRÓPRIAS (teal / amber / red), nunca a cor de uma área.
 *  - "em dia" é TEAL, não emerald — emerald é cor de CTA/identidade em outros
 *    lugares e não pode significar estado.
 *  - estado NUNCA depende só de cor: sempre há `label` + ponto/ícone.
 */
export type CareStateKey = 'neutral' | 'ok' | 'attention' | 'critical';

export interface CareStateStyle {
  /** rótulo curto, sempre exibido junto da cor (daltonismo / a11y) */
  label: string;
  /** classe de fundo para um ponto (dot) */
  dot: string;
  /** fundo + borda para uma pílula/chip de estado */
  chip: string;
  /** cor do texto do chip */
  chipText: string;
  /** realce sutil de uma linha/card inteiro naquele estado */
  row: string;
}

export const CARE_STATE: Record<CareStateKey, CareStateStyle> = {
  neutral: {
    label: 'Sem registro',
    dot: 'bg-slate-300',
    chip: 'bg-slate-50 border border-slate-200',
    chipText: 'text-slate-600',
    row: 'border-slate-200 bg-white',
  },
  ok: {
    label: 'Em dia',
    dot: 'bg-teal-500',
    chip: 'bg-teal-50 border border-teal-200',
    chipText: 'text-teal-700',
    row: 'border-teal-200 bg-teal-50/60',
  },
  attention: {
    label: 'Atenção',
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 border border-amber-200',
    chipText: 'text-amber-700',
    row: 'border-amber-300 bg-amber-50/70',
  },
  critical: {
    label: 'Vencido',
    dot: 'bg-red-500',
    chip: 'bg-red-50 border border-red-200',
    chipText: 'text-red-700',
    row: 'border-red-300 bg-red-50/70',
  },
};

/** Mapa dos nomes de tom já usados no app (neutral/ok/warning/critical). */
export function careStateFromTone(
  tone: 'neutral' | 'ok' | 'warning' | 'critical' | null | undefined,
): CareStateKey {
  if (tone === 'critical') return 'critical';
  if (tone === 'warning') return 'attention';
  if (tone === 'ok') return 'ok';
  return 'neutral';
}

/** Estado derivado de "dias até vencer" — regra única para todo o app. */
export function careStateFromDaysUntilDue(diffDays: number | null | undefined): CareStateKey {
  if (diffDays == null) return 'neutral';
  if (diffDays < 0) return 'critical';
  if (diffDays <= 7) return 'attention';
  return 'ok';
}

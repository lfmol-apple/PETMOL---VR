/**
 * Um tratamento "ativo" no papel (menos doses registradas que o total) mas que
 * já passou do período previsto e está parado há dias deve contar como
 * CONCLUÍDO. Sem isso, uma medicação de 90 dias com 61 doses marcadas (última
 * em 23/08) ficava "em tratamento" pra sempre: o dia de hoje aparecia pendente
 * e o card da Medicação piscava vermelho sem nada realmente ativo (relato do dono,
 * 19/09/2026).
 */
export const MEDICATION_STALE_DAYS = 14;

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Último dia previsto do tratamento (yyyy-mm-dd) ou null se não dá pra saber. */
export function treatmentNominalEnd(scheduledAt: string | null | undefined, ex: Record<string, unknown>): string | null {
  const start = parseIsoDay(String(scheduledAt || '').replace(' ', 'T').split('T')[0]);
  if (!start) return null;
  const days = parseInt(String(ex.treatment_days), 10) || 0;
  const customDoses = parseInt(String(ex.total_doses), 10) || 0;
  const interval = parseInt(String(ex.custom_interval_days), 10) || 1;
  const span = days > 0 ? days : customDoses > 0 ? customDoses * interval : 0;
  if (span <= 0) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + (days > 0 ? span - 1 : (customDoses - 1) * interval));
  return iso(end);
}

/** true = período previsto acabou E não há dose/pulo registrado há MEDICATION_STALE_DAYS. */
export function isMedicationTreatmentStale(
  scheduledAt: string | null | undefined,
  ex: Record<string, unknown>,
  todayIso: string,
): boolean {
  const end = treatmentNominalEnd(scheduledAt, ex);
  if (!end || end >= todayIso) return false;
  const applied = Array.isArray(ex.applied_dates) ? (ex.applied_dates as string[]) : [];
  const skipped = Array.isArray(ex.skipped_dates) ? (ex.skipped_dates as string[]) : [];
  const last = [...applied, ...skipped].sort().pop();
  const cutoff = parseIsoDay(todayIso);
  if (!cutoff) return false;
  cutoff.setDate(cutoff.getDate() - MEDICATION_STALE_DAYS);
  return !last || last < iso(cutoff);
}

/**
 * Estado do tratamento, derivado só dos dados já gravados (nada é escrito, nada
 * é apagado):
 *  - completed: o tutor registrou todas as doses (ou o backend marcou concluído).
 *  - interrupted: evento cancelado.
 *  - expired_unconfirmed: o prazo previsto acabou, faltam doses registradas e não
 *    há dose/pulo há MEDICATION_STALE_DAYS. O decurso do prazo NÃO prova que o
 *    remédio foi dado nem que o tratamento terminou, então não vira "concluído":
 *    só deixa de contar como ativo (Home não pisca, sem lembrete diário) e a UI
 *    diz "Prazo encerrado — conclusão não confirmada". Se o tutor registrar uma
 *    dose depois, volta a ser ativo.
 *  - active: em andamento (inclui prazo vencido com atividade recente, e
 *    tratamento sem duração definida, que nunca expira sozinho).
 */
export type MedicationTreatmentState = 'active' | 'completed' | 'interrupted' | 'expired_unconfirmed';

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

export function medicationTreatmentState(
  ev: { status?: string | null; scheduled_at?: string | null },
  ex: Record<string, unknown>,
  todayIso: string,
): MedicationTreatmentState {
  if (ev.status === 'cancelled') return 'interrupted';
  const configured = parseInt(String(ex.total_doses || ex.treatment_days), 10) || 0;
  const applied = Array.isArray(ex.applied_dates) ? (ex.applied_dates as string[]).length : 0;
  if (configured > 0 && applied >= configured) return 'completed';
  if (ev.status === 'completed' && !(configured > 0 && applied < configured)) return 'completed';
  if (isMedicationTreatmentStale(ev.scheduled_at, ex, todayIso)) return 'expired_unconfirmed';
  return 'active';
}

export const EXPIRED_UNCONFIRMED_LABEL = 'Prazo encerrado — conclusão não confirmada';


/** Horários (HH:MM) das doses de UM dia, espaçados igualmente a partir da 1ª dose
 * — a mesma regra do formulário/lista de medicação (getDailyDoseTimes). */
export function medicationSlotTimes(ex: Record<string, unknown>): string[] {
  const first = String(ex.first_dose_time || ex.reminder_time || '08:00');
  const [h, m] = first.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return [];
  const mode = String(ex.frequency_mode || '');
  let n = 1;
  if (mode === 'vezes_dia') n = Math.max(1, Math.min(12, parseInt(String(ex.times_per_day), 10) || 1));
  else if (mode === 'intervalo') {
    const step = parseInt(String(ex.interval_minutes), 10) || 0;
    if (step > 0) n = Math.max(1, Math.round(1440 / step));
  }
  const spacing = Math.round(1440 / n);
  return Array.from({ length: n }, (_, i) => {
    const total = (h * 60 + m + spacing * i) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }).sort();
}

/**
 * Doses de HOJE de uma medicação: `due` = as que já chegaram na hora (horário <= agora),
 * `done` = as já registradas (aplicadas ou puladas). Doses de mais tarde no dia ainda não
 * contam como atrasadas, e o que foi registrado em applied_slots/applied_dates conta como feito
 * (o card da Home lia um campo que ninguém gravava e ficava vermelho mesmo com tudo em dia).
 */
export function medicationDosesToday(
  scheduledAt: string | null | undefined,
  ex: Record<string, unknown>,
  todayIso: string,
  nowHHMM: string,
): { due: number; done: number } {
  const mode = String(ex.frequency_mode || '');
  if (mode === 'conforme_necessidade') return { due: 0, done: 0 };
  const start = parseIsoDay(String(scheduledAt || '').replace(' ', 'T').split('T')[0]);
  const today = parseIsoDay(todayIso);
  if (!today) return { due: 0, done: 0 };
  if (start) {
    const dayIndex = Math.round((today.getTime() - start.getTime()) / 86400000);
    if (dayIndex < 0) return { due: 0, done: 0 };
    const days = parseInt(String(ex.treatment_days), 10) || 0;
    if (days > 0 && dayIndex >= days) return { due: 0, done: 0 };
    const customInterval = parseInt(String(ex.custom_interval_days), 10) || 0;
    const totalDoses = parseInt(String(ex.total_doses), 10) || 0;
    if (customInterval > 0) {
      if (dayIndex % customInterval !== 0) return { due: 0, done: 0 };
      if (totalDoses > 0 && dayIndex / customInterval >= totalDoses) return { due: 0, done: 0 };
    }
  }
  const slots = ex.custom_interval_days ? [String(ex.first_dose_time || '08:00')] : medicationSlotTimes(ex);
  const due = slots.filter((t) => t <= nowHHMM).length;
  const asArr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  const map = (v: unknown): Record<string, string[]> => (v && typeof v === 'object' ? (v as Record<string, string[]>) : {});
  const doneSlots = asArr(map(ex.applied_slots)[todayIso]).length + asArr(map(ex.skipped_slots)[todayIso]).length;
  let done = doneSlots;
  if (done === 0 && (asArr(ex.applied_dates).includes(todayIso) || asArr(ex.skipped_dates).includes(todayIso))) done = 1;
  return { due, done: Math.min(done, slots.length) };
}

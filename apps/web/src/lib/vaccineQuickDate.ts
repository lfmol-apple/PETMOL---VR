/**
 * Registro rápido de vacina — decisão da DATA de aplicação.
 *
 * Toda data aqui é "YYYY-MM-DD" puro (dia de calendário), nunca um instante:
 * passa do <input type="date"> até o backend sem virar `Date` no caminho, que
 * é o que evita o erro clássico de fuso (`new Date('2026-03-24')` é meia-noite
 * UTC e, no Brasil, vira o dia 23).
 */

export type QuickWhen = 'today' | 'this_month' | 'unknown';

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dia de calendário → número de dias desde 1970 (UTC só como aritmética de
 * calendário; não depende do fuso do aparelho). NaN se não for uma data real. */
function dayNumber(iso: string): number {
  const m = ISO_DAY.exec(iso);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  // rejeita 2026-02-31 etc. (Date.UTC "rola" pro mês seguinte)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return NaN;
  return ms / 86_400_000;
}

/** Data real, no formato certo e que não está no futuro (vacina "aplicada"
 * não pode ter sido aplicada amanhã). */
export function isValidAppliedOn(value: string | null | undefined, todayISO: string): boolean {
  if (!value) return false;
  const v = dayNumber(value);
  const t = dayNumber(todayISO);
  return Number.isFinite(v) && Number.isFinite(t) && v <= t;
}

export interface ResolvedQuickDate {
  appliedOn: string;
  /** "Não lembro": a data é só o ponto de partida de uma estimativa, e o
   * registro é marcado como tal — nunca apresentado como aplicação confirmada. */
  isUnknown: boolean;
  error?: string;
}

/**
 * `appliedOnOverride` = a data que o tutor escolheu. Quando ela existe, é ela
 * (e só ela) que vale. Sem override, mantém o comportamento antigo dos
 * chamadores que ainda não pedem a data (`today`/`this_month`/`unknown`).
 */
export function resolveQuickAppliedOn(
  when: QuickWhen,
  appliedOnOverride: string | undefined,
  todayISO: string,
): ResolvedQuickDate {
  if (appliedOnOverride !== undefined) {
    if (!isValidAppliedOn(appliedOnOverride, todayISO)) {
      return { appliedOn: todayISO, isUnknown: false, error: 'Escolha uma data válida — a vacina não pode ter sido aplicada no futuro.' };
    }
    return { appliedOn: appliedOnOverride, isUnknown: false };
  }
  if (when === 'this_month') return { appliedOn: `${todayISO.slice(0, 8)}01`, isUnknown: false };
  return { appliedOn: todayISO, isUnknown: when === 'unknown' };
}

export type NextDoseStatus = 'Em dia' | 'Pode estar na hora de revisar' | 'Vale confirmar com seu veterinário';

/** Situação da próxima dose em dias de CALENDÁRIO (sem hora, sem fuso):
 * atrasada, nos próximos 30 dias, ou em dia. */
export function nextDoseStatus(nextDueISO: string | null | undefined, todayISO: string): NextDoseStatus {
  const diff = nextDueISO ? dayNumber(nextDueISO.split('T')[0]) - dayNumber(todayISO) : NaN;
  if (!Number.isFinite(diff)) return 'Em dia';
  if (diff < 0) return 'Vale confirmar com seu veterinário';
  if (diff <= 30) return 'Pode estar na hora de revisar';
  return 'Em dia';
}

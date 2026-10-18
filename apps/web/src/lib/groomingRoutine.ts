import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { GroomingRecord } from '@/lib/types/home';

/** Lembretes de banho e tosa do pet: ativo por padrão; o tutor pode desativar e retomar. */
export interface GroomingRoutineConfig {
  active: boolean;
  /** YYYY-MM-DD — depois de retomar, só registros desta data em diante contam para o atraso. */
  resumed_on?: string | null;
}

export const DEFAULT_GROOMING_ROUTINE: GroomingRoutineConfig = { active: true, resumed_on: null };

/**
 * Registros que contam para o AGENDAMENTO (atraso, alertas, cor da banheirinha):
 *  - desativado → nenhum (mesmo havendo registros);
 *  - retomado → só os feitos a partir do dia da retomada (os antigos ficam só no histórico);
 *  - ativo, nunca pausado → todos.
 * O histórico mostrado no sheet NÃO passa por aqui: ele sempre mostra tudo.
 */
export function effectiveGroomingRecords(
  records: GroomingRecord[],
  routine: GroomingRoutineConfig | null | undefined,
): GroomingRecord[] {
  if (!routine || routine.active !== false && !routine.resumed_on) return records;
  if (routine.active === false) return [];
  const since = routine.resumed_on as string;
  return records.filter((r) => (r.date || '').slice(0, 10) >= since);
}

function headers(): Record<string, string> {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export async function fetchGroomingRoutine(petId: string): Promise<GroomingRoutineConfig> {
  try {
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming-routine`, { headers: headers(), cache: 'no-store' });
    if (!res.ok) return DEFAULT_GROOMING_ROUTINE;
    return (await res.json()) as GroomingRoutineConfig;
  } catch {
    return DEFAULT_GROOMING_ROUTINE;
  }
}

/** null = não salvou (o chamador mantém o estado anterior). */
export async function saveGroomingRoutine(petId: string, active: boolean): Promise<GroomingRoutineConfig | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming-routine`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ active }),
    });
    if (!res.ok) return null;
    return (await res.json()) as GroomingRoutineConfig;
  } catch {
    return null;
  }
}

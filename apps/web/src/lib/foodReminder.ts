/**
 * Antecedência do lembrete de ração: "0 dias antes" é um valor válido (avisar
 * no próprio dia). O `parseInt(x) || 3` antigo trocava 0 por 3 sem avisar.
 * Só campo vazio/inválido cai no padrão de 3 dias.
 */
export const DEFAULT_FOOD_REMINDER_DAYS = 3;

export function parseReminderDays(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return DEFAULT_FOOD_REMINDER_DAYS;
  return Math.min(30, Math.max(0, Math.trunc(n)));
}

/**
 * Resposta de erro do servidor -> frase curta. O corpo vem como JSON
 * ({"detail": "..."} ou lista de validação do FastAPI); antes o app mostrava o
 * JSON cru cortado em 140 caracteres.
 */
export function friendlyApiError(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '';
  try {
    const body = JSON.parse(text);
    const detail = body?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((d) => (typeof d?.msg === 'string' ? d.msg : ''))
        .filter(Boolean);
      if (msgs.length) return msgs.join('; ');
    }
  } catch { /* não era JSON */ }
  return text;
}

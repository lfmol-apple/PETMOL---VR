/**
 * Fronteiras de "hoje"/"ontem" em America/Sao_Paulo — NUNCA um deslocamento
 * fixo (-03:00) somado à mão no código. O offset é derivado em tempo real
 * via `Intl` (a mesma técnica que o backend resolve com
 * `zoneinfo.ZoneInfo("America/Sao_Paulo")`), então continua certo mesmo se
 * o Brasil voltar a ter horário de verão — o navegador de quem está
 * olhando o painel pode estar em qualquer fuso, isso aqui não depende dele.
 */

const SP_TZ = 'America/Sao_Paulo';

/** Offset de SP em relação a UTC, em minutos, NO INSTANTE dado — derivado
 * comparando a mesma marca de tempo renderizada em UTC e em SP, nunca uma
 * constante escrita no código. */
function spOffsetMinutes(instant: Date): number {
  const utc = new Date(instant.toLocaleString('en-US', { timeZone: 'UTC' }));
  const sp = new Date(instant.toLocaleString('en-US', { timeZone: SP_TZ }));
  return (sp.getTime() - utc.getTime()) / 60000;
}

/** Y/M/D em SP no instante dado — não confundir com `.getFullYear()` etc,
 * que leem o fuso do NAVEGADOR, não o de São Paulo. */
function spDateParts(instant: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Instante UTC correspondente à meia-noite de SP do dia Y-M-D dado. */
function spMidnightUtc(y: number, m: number, d: number): Date {
  // Aproxima o instante (meio-dia UTC daquele Y-M-D) só pra derivar o
  // offset correto daquele dia específico (relevante se um dia tiver DST e
  // outro não — hoje SP não tem, mas a conta fica certa de qualquer jeito).
  const approx = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offsetMin = spOffsetMinutes(approx);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMin * 60000);
}

/** Início do "hoje" em SP (instante UTC), a partir de agora. */
export function spStartOfToday(now = new Date()): Date {
  const { y, m, d } = spDateParts(now);
  return spMidnightUtc(y, m, d);
}

/** [início, fim) do "ontem" em SP (instantes UTC), a partir de agora. */
export function spYesterdayRange(now = new Date()): { start: Date; end: Date } {
  const end = spStartOfToday(now);
  // Calcula o Y-M-D de "ontem" a partir de um instante claramente dentro do
  // dia anterior (12h antes da meia-noite de hoje), em vez de assumir que
  // um dia tem exatamente 24h — SP não tem DST hoje, mas isto não depende
  // dessa premissa.
  const { y, m, d } = spDateParts(new Date(end.getTime() - 12 * 3600 * 1000));
  const start = spMidnightUtc(y, m, d);
  return { start, end };
}

/** "23/09/2026" (data em SP) — pro rótulo "Analisando: ..." do filtro. */
export function fmtSpDate(instant: Date): string {
  return instant.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: SP_TZ });
}

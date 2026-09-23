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

/** AAAA-MM-DD do dia em SP (formato de <input type="date"> e da API). */
export function spIsoDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant);
}

// ── Formatação de instantes vindos da API (sempre UTC no banco) ───────────

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Interpreta um timestamp da API como INSTANTE. Texto sem fuso ("2026-09-23T22:00:00",
 * de coluna sem timezone) é UTC — sem isto o navegador o lê como hora LOCAL dele e
 * o painel mostra um horário deslocado. Devolve null se não for uma data. */
export function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = String(iso).trim().replace(' ', 'T');
  const d = new Date(DATE_ONLY.test(s) || HAS_ZONE.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "23/09/2026" — dia em SP. Data pura (AAAA-MM-DD) é dia de calendário e NÃO sofre
 * conversão de fuso (senão "2020-01-01" viraria 31/12/2019). */
export function fmtSpDay(iso: string | null | undefined, opts: { shortYear?: boolean } = {}): string {
  const s = String(iso ?? '').trim();
  const m = DATE_ONLY.exec(s);
  if (m) return `${m[3]}/${m[2]}/${opts.shortYear ? m[1].slice(2) : m[1]}`;
  const d = parseInstant(s);
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: opts.shortYear ? '2-digit' : 'numeric', timeZone: SP_TZ });
}

/** "23/09/2026 19:02" (ou com segundos) — horário de São Paulo. */
export function fmtSpDateTime(iso: string | null | undefined, opts: { seconds?: boolean; shortYear?: boolean } = {}): string {
  const d = parseInstant(iso);
  if (!d) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: opts.shortYear ? '2-digit' : 'numeric',
    hour: '2-digit', minute: '2-digit', ...(opts.seconds ? { second: '2-digit' } : {}),
    timeZone: SP_TZ,
  }).replace(', ', ' ');   // "23/09/2026 19:00" igual em qualquer versão do ICU
}

/** [00:00:00, 23:59:59] do dia AAAA-MM-DD escolhido num <input type="date">, em SP —
 * `new Date('AAAA-MM-DDT00:00:00')` usaria o fuso do NAVEGADOR. */
export function spDayBounds(ymd: string): { start: Date; end: Date } | null {
  const m = DATE_ONLY.exec(ymd);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const start = spMidnightUtc(y, mo, d);
  const nextDay = new Date(Date.UTC(y, mo - 1, d + 1, 12, 0, 0));
  const nextStart = spMidnightUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate());
  return { start, end: new Date(nextStart.getTime() - 1000) };
}

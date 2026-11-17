/**
 * Atalho "Mantenha o PETMOL gratuito" (campanha de 17/11/2026) — regra de tempo e de estado, sem React.
 *
 * Contrato honesto (revisão jurídica): o que EXPIRA é só este atalho, nunca a conta nem a ação. A contagem
 * começa no PRIMEIRO toque e é gravada: sair e voltar mostra o tempo que sobrou (o relógio não reinicia).
 * Encerra por: feito (a pessoa cadastrou algo), "agora não" ou fim do tempo. Depois disso não reabre sozinho,
 * e a mesma ação continua disponível no menu do app.
 */

/** Duração do atalho a partir do primeiro toque (dono, 17/11/2026: 20 minutos). */
export const FREE_SHORTCUT_DURATION_MS = 20 * 60 * 1000;
export const FREE_SHORTCUT_STORAGE_KEY = 'petmol_free_shortcut_v1';

export type FreeShortcutEnd = 'done' | 'dismissed' | 'expired';

interface Stored {
  startedAt: number;
  endedAt?: number;
  end?: FreeShortcutEnd;
}

export type FreeShortcutState =
  | { status: 'active'; startedAt: number; remainingMs: number }
  | { status: 'ended'; end: FreeShortcutEnd };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read(storage: StorageLike | null): Stored | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FREE_SHORTCUT_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored>;
    return typeof v.startedAt === 'number' && Number.isFinite(v.startedAt) ? (v as Stored) : null;
  } catch {
    return null;
  }
}

function write(storage: StorageLike | null, value: Stored): void {
  try {
    storage?.setItem(FREE_SHORTCUT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* sem armazenamento: o atalho só não persiste entre aberturas */
  }
}

/** Estado SEM iniciar a contagem (para decidir se vale abrir). */
export function peekFreeShortcut(now: number, storage: StorageLike | null = defaultStorage()): FreeShortcutState | null {
  const s = read(storage);
  if (!s) return null;
  if (s.end) return { status: 'ended', end: s.end };
  const remainingMs = FREE_SHORTCUT_DURATION_MS - (now - s.startedAt);
  if (remainingMs <= 0) return { status: 'ended', end: 'expired' };
  return { status: 'active', startedAt: s.startedAt, remainingMs };
}

/** Abre o atalho: inicia a contagem no primeiro toque; depois só devolve o tempo que sobrou. Nunca reinicia. */
export function openFreeShortcut(now: number, storage: StorageLike | null = defaultStorage()): FreeShortcutState {
  const current = peekFreeShortcut(now, storage);
  if (current) {
    if (current.status === 'ended' && current.end === 'expired') {
      const s = read(storage);
      if (s && !s.end) write(storage, { ...s, end: 'expired', endedAt: now });
    }
    return current;
  }
  write(storage, { startedAt: now });
  return { status: 'active', startedAt: now, remainingMs: FREE_SHORTCUT_DURATION_MS };
}

export function endFreeShortcut(end: FreeShortcutEnd, now: number, storage: StorageLike | null = defaultStorage()): void {
  const s = read(storage) ?? { startedAt: now };
  if (s.end) return; // o primeiro motivo vale
  write(storage, { ...s, end, endedAt: now });
}

export function remainingFrom(startedAt: number, now: number): number {
  return Math.max(0, FREE_SHORTCUT_DURATION_MS - (now - startedAt));
}

/** 1199000 → "19:59". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

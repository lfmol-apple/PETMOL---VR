const ANONYMOUS_ID_KEY = 'petmol_analytics_anonymous_id';
const SESSION_KEY = 'petmol_analytics_session';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

interface StoredSession {
  id: string;
  lastActivityAt: number;
}

export interface AnalyticsContext {
  event_id: string;
  anonymous_id: string;
  session_id: string;
  session_started: boolean;
  platform: 'web' | 'pwa' | 'ios_capacitor' | 'android_capacitor';
  app_version: string;
  os: string;
  browser: string;
  device_class: 'mobile' | 'tablet' | 'desktop';
  locale: string;
  timezone: string;
}

function newId(prefix: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${id}`;
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch {}
}

export function getAnalyticsAnonymousId(): string {
  const existing = safeGet(ANONYMOUS_ID_KEY);
  if (existing) return existing;
  const created = newId('anon');
  safeSet(ANONYMOUS_ID_KEY, created);
  return created;
}

export function getAnalyticsSession(now = Date.now()): { sessionId: string; started: boolean } {
  const raw = safeGet(SESSION_KEY);
  let parsed: StoredSession | null = null;
  try {
    parsed = raw ? JSON.parse(raw) as StoredSession : null;
  } catch {
    parsed = null;
  }

  const existingId = parsed?.id;
  const lastActivityAt = parsed?.lastActivityAt;
  const expired = !existingId || !lastActivityAt || now - lastActivityAt > SESSION_TIMEOUT_MS;
  const session: StoredSession = {
    id: expired ? newId('sess') : existingId,
    lastActivityAt: now,
  };
  safeSet(SESSION_KEY, JSON.stringify(session));
  return { sessionId: session.id, started: expired };
}

function detectPlatform(): AnalyticsContext['platform'] {
  const cap = (globalThis as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const capPlatform = cap?.getPlatform?.();
  if (capPlatform === 'ios') return 'ios_capacitor';
  if (capPlatform === 'android') return 'android_capacitor';
  if (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone) {
    return 'pwa';
  }
  return 'web';
}

function detectDeviceClass(): AnalyticsContext['device_class'] {
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
}

function detectOs(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Mac OS X/i.test(ua)) return 'macos';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  return 'unknown';
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/CriOS|Chrome\//.test(ua)) return 'chrome';
  if (/FxiOS|Firefox\//.test(ua)) return 'firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'safari';
  return 'unknown';
}

export function getAnalyticsContext(): AnalyticsContext {
  const session = getAnalyticsSession();
  return {
    event_id: newId('evt'),
    anonymous_id: getAnalyticsAnonymousId(),
    session_id: session.sessionId,
    session_started: session.started,
    platform: detectPlatform(),
    app_version: process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'unknown',
    os: detectOs(),
    browser: detectBrowser(),
    device_class: detectDeviceClass(),
    locale: navigator.language || 'unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
  };
}

export const analyticsSessionDefinition =
  'Nova sessão na primeira abertura ou após 30 minutos de inatividade; sem heartbeat agressivo.';

export const analyticsAnonymousIdStorage =
  'localStorage:petmol_analytics_anonymous_id';

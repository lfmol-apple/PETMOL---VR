/**
 * nativePushService.ts
 *
 * Push NATIVO (APNs no iOS, FCM no Android) para o shell Capacitor —
 * distinto de pushService.ts (Web Push). No-op seguro fora do app nativo.
 *
 * Toda chamada ao plugin tem timeout: uma ponte WebView↔nativo travada
 * NUNCA deve pendurar a UI. `lastNativePushDiag` guarda, em texto legível,
 * o que aconteceu na última tentativa — a tela de Perfil mostra isso quando
 * a ativação falha, pra dar pra diagnosticar sem Web Inspector.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

// Plugin acessado DIRETO pelo bridge do Capacitor (registerPlugin) — sem
// `import('@capacitor/push-notifications')`. O import dinâmico do pacote
// travava dentro da WKWebView do iOS 18 e nem o timeout disparava (o
// carregamento do chunk pendurava a promise). registerPlugin devolve o
// proxy do plugin nativo já registrado (packageClassList) de forma síncrona.
interface PushNotificationsPlugin {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  removeAllListeners(): Promise<void>;
  addListener(
    eventName: 'registration',
    cb: (token: { value: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'registrationError',
    cb: (err: unknown) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'pushNotificationActionPerformed',
    cb: (evt: unknown) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'pushNotificationReceived',
    cb: (evt: unknown) => void,
  ): Promise<PluginListenerHandle>;
}
const PushNotifications = registerPlugin<PushNotificationsPlugin>('PushNotifications');

export type NativePushPermission = 'granted' | 'denied' | 'prompt';

/** Texto do último resultado/erro do fluxo nativo (pra mostrar na UI). */
let _lastNativePushDiag = '';
function envSnapshot(): Record<string, unknown> {
  let cap: Record<string, unknown> = {};
  try {
    cap = {
      isNative: Capacitor.isNativePlatform(),
      platform: Capacitor.getPlatform(),
      pluginAvailable: Capacitor.isPluginAvailable('PushNotifications'),
    };
  } catch (e) {
    cap = { capErr: String(e) };
  }
  return {
    ...cap,
    ua: typeof navigator !== 'undefined' ? (navigator.userAgent || '').slice(0, 160) : '',
    standalone:
      typeof window !== 'undefined'
        ? Boolean(
            (window.navigator as Navigator & { standalone?: boolean }).standalone ||
              window.matchMedia?.('(display-mode: standalone)').matches,
          )
        : null,
  };
}
/** Manda o passo/erro pro backend (fire-and-forget) — dá pra ler de fora
 *  sem Web Inspector. Endpoint temporário /notifications/native-diag. */
function reportDiag(step: string, extra?: Record<string, unknown>) {
  try {
    void fetch(`${API_BASE}/notifications/native-diag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ step, ...envSnapshot(), ...(extra || {}) }),
    }).catch(() => {});
  } catch {
    /* noop */
  }
}
function setDiag(msg: string) {
  _lastNativePushDiag = msg;
  reportDiag(msg);
}
export function getNativePushDiag(): string {
  return _lastNativePushDiag;
}
/** Chamável de qualquer lugar pra registrar um passo no diagnóstico remoto. */
export function pushDiagBreadcrumb(step: string, extra?: Record<string, unknown>) {
  reportDiag(step, extra);
}

export function isNativePushPlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function pluginRegistered(): boolean {
  try {
    return Capacitor.isPluginAvailable('PushNotifications');
  } catch {
    return false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout ${label} (${ms}ms)`)), ms)),
  ]);
}

function normalize(receive: string | undefined): NativePushPermission {
  if (receive === 'granted') return 'granted';
  if (receive === 'denied') return 'denied';
  return 'prompt';
}

export async function checkNativePushPermission(): Promise<NativePushPermission> {
  if (!isNativePushPlatform()) return 'denied';
  if (!pluginRegistered()) {
    setDiag('plugin PushNotifications não está no app (build sem a capability?)');
    return 'denied';
  }
  try {
    const status = await withTimeout(PushNotifications.checkPermissions(), 6000, 'checkPermissions');
    return normalize(status.receive);
  } catch (e) {
    setDiag(`checkPermissions: ${(e as Error)?.message ?? String(e)}`);
    return 'denied';
  }
}

export async function requestNativePushPermission(): Promise<NativePushPermission> {
  reportDiag('requestNativePushPermission: entrou');
  if (!isNativePushPlatform()) {
    setDiag('não é app nativo (Capacitor.isNativePlatform=false)');
    return 'denied';
  }
  if (!pluginRegistered()) {
    setDiag('plugin PushNotifications não está no app (build sem a capability?)');
    return 'denied';
  }
  try {
    reportDiag('requestNativePushPermission: vai chamar checkPermissions');
    let status = await withTimeout(PushNotifications.checkPermissions(), 6000, 'checkPermissions');
    reportDiag('requestNativePushPermission: checkPermissions=' + status.receive);
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      reportDiag('requestNativePushPermission: vai chamar requestPermissions (deve abrir o prompt do iOS)');
      status = await withTimeout(PushNotifications.requestPermissions(), 90000, 'requestPermissions');
    }
    setDiag(`permissão nativa: ${status.receive}`);
    return normalize(status.receive);
  } catch (e) {
    setDiag(`requestPermissions: ${(e as Error)?.message ?? String(e)}`);
    return 'denied';
  }
}

export async function registerNativePush(authToken: string): Promise<boolean> {
  if (!isNativePushPlatform()) return false;
  if (!pluginRegistered()) {
    setDiag('plugin PushNotifications não está no app');
    return false;
  }

  try {
    const perm = await withTimeout(PushNotifications.checkPermissions(), 6000, 'checkPermissions');
    if (perm.receive !== 'granted') {
      setDiag(`sem permissão pra registrar (${perm.receive})`);
      return false;
    }

    // remove só os listeners DESTA função (não `removeAllListeners`, que
    // apagaria o listener de tap em pushNotificationActionPerformed).
    for (const h of _registrationHandles.splice(0)) {
      try {
        await h.remove();
      } catch {
        /* noop */
      }
    }

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean, why: string) => {
        if (settled) return;
        settled = true;
        setDiag(why);
        resolve(value);
      };

      void PushNotifications.addListener('registration', (result) => {
        const platform = Capacitor.getPlatform(); // 'ios' | 'android'
        void fetch(`${API_BASE}/notifications/native-device`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ platform, token: result.value }),
        })
          .then((res) => finish(res.ok, res.ok ? 'token registrado' : `backend recusou o token (HTTP ${res.status})`))
          .catch((e) => finish(false, `envio do token falhou: ${e}`));
      }).then((h) => _registrationHandles.push(h));

      void PushNotifications.addListener('registrationError', (err) => {
        finish(false, `APNs recusou o registro: ${JSON.stringify(err)?.slice(0, 160)}`);
      }).then((h) => _registrationHandles.push(h));

      void PushNotifications.register();

      setTimeout(
        () => finish(false, 'APNs não respondeu em 15s (sem registration nem registrationError)'),
        15_000,
      );
    });
  } catch (e) {
    setDiag(`register: ${(e as Error)?.message ?? String(e)}`);
    return false;
  }
}

const _registrationHandles: PluginListenerHandle[] = [];
let _tapListenerAdded = false;

/**
 * Liga o listener de "notificação nativa tocada" (APNs). Ao tocar num
 * lembrete, entrega o deep-link (`notification.data.url`) pelos MESMOS
 * canais que o home/page.tsx já escuta (BroadcastChannel + Cache API), e
 * faz navegação direta se o app não estiver na Home. Idempotente.
 */
export async function initNativePushDeepLink(): Promise<void> {
  if (_tapListenerAdded || !isNativePushPlatform() || !pluginRegistered()) return;
  _tapListenerAdded = true;
  try {
    await PushNotifications.addListener('pushNotificationActionPerformed', (evt: unknown) => {
      const e = (evt || {}) as {
        actionId?: string;
        notification?: { data?: Record<string, unknown> };
      };
      const data = e.notification?.data ?? {};
      const actionUrls =
        data.action_urls && typeof data.action_urls === 'object'
          ? (data.action_urls as Record<string, unknown>)
          : {};
      let url: string | undefined;
      if (e.actionId && typeof actionUrls[e.actionId] === 'string') {
        url = actionUrls[e.actionId] as string;
      }
      if (!url && typeof data.url === 'string') url = data.url as string;
      if (!url) url = '/home';
      reportDiag('native tap → ' + url);
      deliverNativeDeepLink(url);
    });
    reportDiag('initNativePushDeepLink: listener de tap ligado');
  } catch (e) {
    reportDiag('initNativePushDeepLink erro: ' + String(e));
    _tapListenerAdded = false;
  }
}

function deliverNativeDeepLink(url: string) {
  const ts = Date.now();
  // 1. BroadcastChannel — app já aberto numa página que escuta (Home)
  try {
    const bc = new BroadcastChannel('petmol-deeplink');
    bc.postMessage({ type: 'PETMOL_DEEPLINK', url, ts });
    bc.close();
  } catch {
    /* noop */
  }
  // 2. Cache API — cold start: a Home lê '/__petmol_deeplink' ao montar
  try {
    if (typeof caches !== 'undefined') {
      void caches.open('petmol-deeplink-v1').then((c) =>
        c.put(
          '/__petmol_deeplink',
          new Response(JSON.stringify({ url, ts }), {
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );
    }
  } catch {
    /* noop */
  }
  // 3. Navegação direta quando NÃO está na Home (o listener BroadcastChannel
  //    só existe lá). location.assign faz a Home montar e processar o modal.
  try {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/home')) {
      window.location.assign(url);
    }
  } catch {
    /* noop */
  }
}

export async function unregisterNativePush(authToken: string): Promise<void> {
  if (!isNativePushPlatform()) return;
  try {
    await fetch(`${API_BASE}/notifications/native-device`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({}),
    });
  } catch {
    // best-effort
  }
}

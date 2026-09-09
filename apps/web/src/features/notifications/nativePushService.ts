/**
 * nativePushService.ts
 *
 * Push NATIVO (APNs no iOS, FCM no Android) para o shell Capacitor —
 * distinto de pushService.ts (Web Push), que não funciona de forma
 * confiável dentro da WKWebView nativa. Tudo aqui é no-op seguro fora do
 * app nativo (`Capacitor.isNativePlatform() === false`), então é sempre
 * seguro chamar sem checar a plataforma antes.
 *
 * O ENVIO de fato depende de credenciais externas (APNs Auth Key .p8 no
 * iOS; projeto Firebase no Android) configuradas como secret no backend —
 * ver docs/MOBILE_RELEASE_CHECKLIST.md. Registrar o token sem elas não tem
 * custo nem risco: quando o envio existir, os tokens já estarão no banco.
 */
import { Capacitor } from '@capacitor/core';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export type NativePushPermission = 'granted' | 'denied' | 'prompt';

/** True dentro do app nativo PETMOL (iOS/Android via Capacitor). */
export function isNativePushPlatform(): boolean {
  return Capacitor.isNativePlatform();
}

async function loadPlugin() {
  const mod = await import('@capacitor/push-notifications');
  return mod.PushNotifications;
}

function normalize(receive: string | undefined): NativePushPermission {
  if (receive === 'granted') return 'granted';
  if (receive === 'denied') return 'denied';
  return 'prompt';
}

/** Estado atual da permissão de push nativa. 'prompt' = ainda não perguntou. */
export async function checkNativePushPermission(): Promise<NativePushPermission> {
  if (!Capacitor.isNativePlatform()) return 'denied';
  try {
    const PushNotifications = await loadPlugin();
    const status = await PushNotifications.checkPermissions();
    return normalize(status.receive);
  } catch {
    return 'denied';
  }
}

/**
 * Pede a permissão nativa de push. No iOS o prompt do sistema aparece só na
 * 1ª vez; depois retorna o estado já decidido sem mostrar nada.
 */
export async function requestNativePushPermission(): Promise<NativePushPermission> {
  if (!Capacitor.isNativePlatform()) return 'denied';
  try {
    const PushNotifications = await loadPlugin();
    let status = await PushNotifications.checkPermissions();
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      status = await PushNotifications.requestPermissions();
    }
    return normalize(status.receive);
  } catch {
    return 'denied';
  }
}

/**
 * Registra no APNs/FCM e envia o device token ao backend
 * (`POST /notifications/native-device`). Resolve com `true` só se um token
 * foi capturado e aceito. Exige permissão JÁ concedida — chame
 * `requestNativePushPermission()` antes. Nunca loga o valor do token.
 */
export async function registerNativePush(authToken: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const PushNotifications = await loadPlugin();

    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') return false;

    await PushNotifications.removeAllListeners();

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      void PushNotifications.addListener('registration', (result) => {
        const platform = Capacitor.getPlatform(); // 'ios' | 'android'
        void fetch(`${API_BASE}/notifications/native-device`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ platform, token: result.value }),
        })
          .then((res) => finish(res.ok))
          .catch(() => finish(false));
      });

      void PushNotifications.addListener('registrationError', () => finish(false));

      void PushNotifications.register();

      // Rede de segurança: APNs/FCM pode simplesmente não responder (sem
      // capability no build, offline, etc.) — nunca pendura quem chamou.
      setTimeout(() => finish(false), 12_000);
    });
  } catch {
    // best-effort — falha de push nunca deve travar o app
    return false;
  }
}

export async function unregisterNativePush(authToken: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
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

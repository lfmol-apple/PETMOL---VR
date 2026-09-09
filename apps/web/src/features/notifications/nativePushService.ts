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
import { Capacitor } from '@capacitor/core';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export type NativePushPermission = 'granted' | 'denied' | 'prompt';

/** Texto do último resultado/erro do fluxo nativo (pra mostrar na UI). */
let _lastNativePushDiag = '';
function setDiag(msg: string) {
  _lastNativePushDiag = msg;
}
export function getNativePushDiag(): string {
  return _lastNativePushDiag;
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

async function loadPlugin() {
  const mod = await withTimeout(import('@capacitor/push-notifications'), 8000, 'import plugin');
  return mod.PushNotifications;
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
    const PushNotifications = await loadPlugin();
    const status = await withTimeout(PushNotifications.checkPermissions(), 6000, 'checkPermissions');
    return normalize(status.receive);
  } catch (e) {
    setDiag(`checkPermissions: ${(e as Error)?.message ?? String(e)}`);
    return 'denied';
  }
}

export async function requestNativePushPermission(): Promise<NativePushPermission> {
  if (!isNativePushPlatform()) return 'denied';
  if (!pluginRegistered()) {
    setDiag('plugin PushNotifications não está no app (build sem a capability?)');
    return 'denied';
  }
  try {
    const PushNotifications = await loadPlugin();
    let status = await withTimeout(PushNotifications.checkPermissions(), 6000, 'checkPermissions');
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      // o prompt do iOS pode ficar aberto um tempo — timeout generoso
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
    const PushNotifications = await loadPlugin();

    const perm = await withTimeout(PushNotifications.checkPermissions(), 6000, 'checkPermissions');
    if (perm.receive !== 'granted') {
      setDiag(`sem permissão pra registrar (${perm.receive})`);
      return false;
    }

    await PushNotifications.removeAllListeners();

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
      });

      void PushNotifications.addListener('registrationError', (err) => {
        finish(false, `APNs recusou o registro: ${JSON.stringify(err)?.slice(0, 160)}`);
      });

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

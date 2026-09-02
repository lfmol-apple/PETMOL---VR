/**
 * nativePushService.ts
 *
 * Registro de push NATIVO (FCM/APNs) para o shell Capacitor — distinto de
 * pushService.ts (Web Push), que não funciona de forma confiável dentro do
 * WebView nativo. Só ativa quando Capacitor.isNativePlatform() é true; em
 * qualquer navegador normal (dev, PWA, web) esta função é um no-op seguro,
 * então é sempre seguro chamar sem checar a plataforma antes.
 *
 * IMPORTANTE: isto só registra o TOKEN no backend. O envio de fato de uma
 * notificação nativa ainda depende de credenciais externas que este
 * ambiente não tem hoje (projeto Firebase + google-services.json pro
 * Android; certificado/chave APNs pro iOS) — ver
 * docs/MOBILE_RELEASE_CHECKLIST.md para o que falta e quem precisa
 * configurar. Registrar o token agora não tem custo nem risco: quando o
 * envio existir, os tokens já estarão no banco.
 */
import { Capacitor } from '@capacitor/core';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export async function registerNativePush(token: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // v1.0: NÃO pedir permissão de push aqui. O envio nativo (APNs/FCM)
    // ainda não está configurado — abrir um prompt de permissão que nunca
    // entrega nada é má experiência e, no iOS, some junto com o
    // UIBackgroundModes removido. Só registramos o token se a permissão
    // JÁ estiver concedida (ex.: build futuro com push real que fez o
    // prompt na hora certa). Ver docs/MOBILE_RELEASE_CHECKLIST.md.
    const permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive !== 'granted') return;

    await PushNotifications.removeAllListeners();

    await new Promise<void>((resolve) => {
      PushNotifications.addListener('registration', (result) => {
        const platform = Capacitor.getPlatform(); // 'ios' | 'android'
        // Nunca logar o valor do token — só confirma que chegou.
        void fetch(`${API_BASE}/notifications/native-device`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ platform, token: result.value }),
        }).finally(resolve);
      });

      PushNotifications.addListener('registrationError', () => {
        // Best-effort: falha de push nunca deve travar o app.
        resolve();
      });

      void PushNotifications.register();
    });
  } catch {
    // best-effort — nunca propaga erro para quem chamou
  }
}

export async function unregisterNativePush(token: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await fetch(`${API_BASE}/notifications/native-device`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
  } catch {
    // best-effort
  }
}

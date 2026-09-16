import type { CapacitorConfig } from '@capacitor/cli';

// PETMOL's Next.js app runs with `output: 'standalone'` (server-rendered,
// not a static export) — there's no static bundle Capacitor could ship
// inside the native app. Instead of maintaining a second frontend or
// forcing a static export, the native shell loads the live site directly
// (server.url) and layers real native capabilities (camera, push, external
// browser for affiliate links) on top via Capacitor plugins. `webDir` below
// is only the offline/first-paint fallback the CLI requires to exist.
const config: CapacitorConfig = {
  appId: 'br.com.petmol.app',
  appName: 'PETMOL',
  webDir: 'capacitor-shell',
  // Marca o User-Agent do WebView para o site distinguir "rodando dentro do
  // app nativo" de "web/PWA" no servidor (ex.: esconder a área Amazon US
  // pública, que é só para a web). O front também tem Capacitor.isNativePlatform().
  appendUserAgent: 'PetmolApp',
  // Raiz do site, sem path. O bridge nativo do Capacitor (WebViewDelegationHandler.swift
  // no iOS) só trata como navegação "do próprio app" a URL que comece literalmente com
  // esta string — é comparação de prefixo, não só de host. Com '/home' fixo aqui,
  // qualquer redirect de servidor pra outro path (ex.: sem sessão → middleware manda
  // pra /login) falhava esse prefixo e o Capacitor cancelava a navegação no próprio
  // WebView e abria no Safari externo, deixando o app nativo em branco pra sempre —
  // essa é a causa confirmada da rejeição da Apple (tela branca no iPad). O middleware
  // já trata o app acordando em "/" (ver NATIVE_APP_UA_MARKER em middleware.ts),
  // redirecionando pra /home.
  server: {
    url: 'https://www.petmol.com.br',
    cleartext: false,
  },
  plugins: {
    // Push nativo (APNs/FCM). presentationOptions faz a notificação aparecer
    // como banner mesmo com o app em primeiro plano. Ver nativePushService.ts
    // e docs/MOBILE_RELEASE_CHECKLIST.md (envio depende da APNs Auth Key).
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

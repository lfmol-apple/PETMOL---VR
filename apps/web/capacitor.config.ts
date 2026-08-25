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
  server: {
    url: 'https://www.petmol.com.br',
    cleartext: false,
  },
};

export default config;

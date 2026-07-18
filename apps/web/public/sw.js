/**
 * PETMOL Service Worker — Web Push + offline shell
 * v2026.05.18
 *
 * Recebe eventos push, exibe notificação e ao clicar abre a URL do payload.
 * Payload esperado (JSON):
 * {
 *   title:   string,
 *   body:    string,
 *   icon:    string,
 *   badge:   string,
 *   tag:     string,
 *   data:    { url: string },
 *   actions: [{ action: string, title: string, icon?: string }],
 *   requireInteraction: boolean,
 *   autoCloseMs: number,
 * }
 */

const CACHE_NAME = 'petmol-shell-v2026-07-18a';
const SHARE_CACHE = 'petmol-shared-files-v1';
const SHELL_URLS = [
  '/',
  '/home',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
];

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'PETMOL', body: event.data.text() };
  }

  const normalized = normalizePushPayload(payload);
  const title = normalized.title;
  const options = {
    body: normalized.body,
    icon: normalized.icon,
    badge: normalized.badge,
    image: normalized.image,
    tag: normalized.tag,
    data: normalized.data,
    actions: normalized.actions,
    requireInteraction: normalized.requireInteraction === true,
    renotify: normalized.renotify === true,
  };

  const notifPromise = self.registration.showNotification(title, options);

  if (normalized.autoCloseMs && normalized.autoCloseMs > 0 && !normalized.requireInteraction) {
    event.waitUntil(
      notifPromise.then(() =>
        new Promise((resolve) => setTimeout(resolve, normalized.autoCloseMs))
          .then(() =>
            self.registration.getNotifications({ tag: options.tag }).then((notifs) => {
              notifs.forEach((notification) => notification.close());
            })
          )
      )
    );
  } else {
    event.waitUntil(notifPromise);
  }
});

function normalizePushPayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const sourceData = source.data && typeof source.data === 'object' ? source.data : {};
  const rawTitle = String(source.title || '').trim();
  const rawBody = String(source.body || '').trim();
  const url = String(sourceData.url || source.url || '/home').trim() || '/home';
  const actionUrls = sourceData.action_urls && typeof sourceData.action_urls === 'object'
    ? sourceData.action_urls
    : {};
  const actions = Array.isArray(source.actions)
    ? source.actions
      .slice(0, 4)
      .map((candidate) => {
        if (!candidate || typeof candidate !== 'object') return null;
        const action = String(candidate.action || '').trim();
        const title = String(candidate.title || '').trim();
        if (!action || !title) return null;
        const icon = String(candidate.icon || '').trim();
        return icon ? { action, title, icon } : { action, title };
      })
      .filter(Boolean)
    : [];

  const title = rawTitle || 'PETMOL';

  let autoCloseMs = Number(source.autoCloseMs || 0);
  if (!Number.isFinite(autoCloseMs) || autoCloseMs < 0) autoCloseMs = 0;

  const requireInteraction = source.requireInteraction === true;
  if (requireInteraction) autoCloseMs = 0;

  return {
    title,
    body: rawBody,
    icon: String(source.icon || '/icons/icon-192x192.png'),
    badge: String(source.badge || '/icons/badge-mono.png'),
    image: String(source.image || '/brand/notification-banner.png'),
    tag: String(source.tag || 'petmol'),
    data: { url, action_urls: actionUrls },
    actions,
    requireInteraction,
    autoCloseMs,
    renotify: source.renotify === true,
  };
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = String(event.action || '').trim();
  const actionUrls = event.notification.data?.action_urls;
  const actionUrl =
    action &&
    actionUrls &&
    typeof actionUrls === 'object' &&
    typeof actionUrls[action] === 'string'
      ? actionUrls[action]
      : null;
  const rawUrl = actionUrl || event.notification.data?.url || '/home';
  const targetUrl = normalizeNotificationClickUrl(rawUrl);

  // Persiste o intent no Cache API para o app ler ao montar.
  // Necessário no iOS onde openWindow ignora query params e abre start_url.
  const persistIntent = caches.open('petmol-deeplink-v1').then((cache) =>
    cache.put(
      '/__petmol_deeplink',
      new Response(JSON.stringify({ url: rawUrl, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );

  event.waitUntil(
    persistIntent.then(() =>
      clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            if (client.url.includes(self.location.origin) && 'focus' in client && 'navigate' in client) {
              return client.focus().then(() => client.navigate(targetUrl));
            }
          }
          if (clients.openWindow) {
            return clients.openWindow(targetUrl);
          }
        })
    )
  );
});

function normalizeNotificationClickUrl(rawUrl) {
  try {
    const normalized = new URL(String(rawUrl || '/home'), self.location.origin);
    if (normalized.origin !== self.location.origin) return `${self.location.origin}/home`;
    return normalized.toString();
  } catch {
    return `${self.location.origin}/home`;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => clients.claim())
      .then(() => clients.matchAll({ type: 'window' }))
      .then((all) => all.forEach((client) => client.navigate(client.url)))
  );
});

// ── Share Target ───────────────────────────────────────────────────────────
// Recebe arquivos compartilhados via Web Share API, salva no Cache Storage
// e redireciona para /home?petmol_share=1 onde o app faz o upload.
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((f) => f instanceof File && f.size > 0);
    if (files.length > 0) {
      const cache = await caches.open(SHARE_CACHE);
      const oldKeys = await cache.keys();
      await Promise.all(oldKeys.map((k) => cache.delete(k)));
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const buf = await f.arrayBuffer();
        await cache.put(
          new Request(`/petmol-share/file-${i}`),
          new Response(buf, {
            headers: {
              'Content-Type': f.type || 'application/octet-stream',
              'X-File-Name': encodeURIComponent(f.name || `arquivo-${i}`),
            },
          })
        );
      }
      await cache.put(
        new Request('/petmol-share/meta'),
        new Response(JSON.stringify({ count: files.length }), {
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  } catch {
    // silent — ainda redireciona mesmo se falhar o armazenamento
  }
  return Response.redirect('/home?petmol_share=1', 303);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Interceptar POST do share target antes de qualquer outra lógica
  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // API calls e qualquer método não-GET: nunca interceptar, deixar ir direto à rede
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  if (
    url.origin === self.location.origin &&
    !url.pathname.startsWith('/_next/') &&
    (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html'))
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then((cached) => cached || caches.match('/home'))
            .then((cached) => cached || caches.match('/'))
            .then((cached) => cached || new Response('PETMOL offline', {
              status: 200,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            }))
        )
    );
  }
});

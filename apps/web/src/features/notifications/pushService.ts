/**
 * pushService.ts
 *
 * Gerencia a subscription de push do navegador.
 * Fluxo: pedir permissão → registrar SW → obter VAPID key → subscribe → enviar ao backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/** ID estável por instalação — o backend usa pra saber que dois endpoints
 * (o antigo rotacionado + o novo) são o MESMO aparelho e não mandar push 2x. */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem('petmol_device_id');
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `d-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem('petmol_device_id', id);
    }
    return id;
  } catch {
    return '';
  }
}

async function _getLocSilently(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return null;
    const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (perm.state !== 'granted') return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 5000, maximumAge: 300_000 },
      );
    });
  } catch { return null; }
}

// ── Subscription ────────────────────────────────────────────────────────────

export async function subscribeToPush(token: string): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return false;
  }

  const swTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('SW not ready')), 8000)
  );
  const registration = await Promise.race([navigator.serviceWorker.ready, swTimeout]);

  const { publicKey } = await fetch(`${API_BASE}/notifications/vapid-public-key`).then(
    (r) => r.json()
  );

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: _urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
  });

  const loc = await _getLocSilently();
  await fetch(`${API_BASE}/notifications/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ subscription: subscription.toJSON(), device_id: getDeviceId(), ...loc }),
  });

  return true;
}

export async function unsubscribeFromPush(token: string): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SW not ready')), 8000)),
  ]);
  const subscription = await registration.pushManager.getSubscription();
  const endpoint = subscription?.endpoint ?? null;
  if (subscription) {
    await subscription.unsubscribe();
  }

  await fetch(`${API_BASE}/notifications/subscribe`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    // endpoint identifica só ESTE dispositivo — sem ele o backend desativaria
    // todos os dispositivos do usuário (fallback pra clientes antigos em cache).
    body: JSON.stringify({ endpoint }),
  });
}

export async function isSubscribed(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SW not ready')), 8000)),
  ]);
  const sub = await registration.pushManager.getSubscription();
  return sub !== null;
}

/**
 * Renova a subscription de push: revoga a existente e cria uma nova com a
 * VAPID key atual do servidor. Necessário quando a chave VAPID muda.
 */
export async function refreshSubscription(token: string): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (Notification.permission !== "granted") return false;

  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SW not ready')), 8000)),
  ]);

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe();
  }

  const { publicKey } = await fetch(`${API_BASE}/notifications/vapid-public-key`).then((r) => r.json());

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: _urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
  });

  const loc = await _getLocSilently();
  await fetch(`${API_BASE}/notifications/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscription: subscription.toJSON(), device_id: getDeviceId(), ...loc }),
  });

  return true;
}

// ── Reminder CRUD ───────────────────────────────────────────────────────────

export type ReminderType =
  | "food"
  | "medication"
  | "vaccine"
  | "dewormer"
  | "flea"
  | "collar"
  | "grooming";

export interface CreateReminderPayload {
  pet_id?: string;
  type: ReminderType;
  title: string;
  body?: string;
  url?: string;
  remind_at: string; // ISO 8601
}

export interface Reminder {
  id: string;
  pet_id?: string;
  type: ReminderType;
  title: string;
  body?: string;
  remind_at: string;
  sent: boolean;
  created_at: string;
}

export async function createReminder(
  payload: CreateReminderPayload,
  token: string
): Promise<Reminder> {
  const res = await fetch(`${API_BASE}/notifications/reminders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Erro ao criar lembrete: ${res.status}`);
  return res.json();
}

export async function listReminders(token: string): Promise<Reminder[]> {
  const res = await fetch(`${API_BASE}/notifications/reminders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Erro ao buscar lembretes: ${res.status}`);
  return res.json();
}

export async function deleteReminder(id: string, token: string): Promise<void> {
  await fetch(`${API_BASE}/notifications/reminders/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converte "YYYY-MM-DD" + "HH:MM" para ISO 8601 (hora local do dispositivo).
 */
export function buildRemindAt(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = (timeStr || "09:00").split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

/**
 * Subtrai `days` dias de uma data "YYYY-MM-DD" e retorna outra "YYYY-MM-DD".
 */
export function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Garante que o dispositivo está subscrito (pede permissão se necessário)
 * e cria um lembrete no backend.
 *
 * Falhas de push são silenciosas — não devem quebrar o fluxo de save.
 */
export async function scheduleReminder(
  payload: CreateReminderPayload,
  token: string
): Promise<void> {
  try {
    const already = await isSubscribed();
    if (already) {
      const registration = await navigator.serviceWorker.ready;
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/notifications/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ subscription: existingSub.toJSON() }),
        });
      }
    } else {
      const ok = await subscribeToPush(token);
      if (!ok) return;
    }
    await createReminder(payload, token);
  } catch {
    // push é best-effort; nunca propaga erro para o caller
  }
}

/**
 * Cancela todos os pushes de ração pendentes para o pet informado.
 * Best-effort — falhas são silenciosas.
 */
export async function cancelFoodRemindersForPet(petId: string, token: string): Promise<void> {
  try {
    const existing = await listReminders(token);
    const old = existing.filter((r) => r.type === 'food' && r.pet_id === petId);
    await Promise.all(old.map((r) => deleteReminder(r.id, token)));
  } catch {
    // best-effort
  }
}

/**
 * Agenda UM lembrete de ração para o pet, substituindo quaisquer lembretes
 * anteriores não enviados. Garante que nunca há mais de um push de ração
 * pendente por pet.
 */
export async function scheduleFoodReminder(
  payload: CreateReminderPayload & { pet_id: string },
  token: string
): Promise<void> {
  try {
    // Garante subscription ativa
    const already = await isSubscribed();
    if (already) {
      const registration = await navigator.serviceWorker.ready;
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/notifications/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ subscription: existingSub.toJSON() }),
        });
      }
    } else {
      const ok = await subscribeToPush(token);
      if (!ok) return;
    }
    // Cancela pushes anteriores de ração para este pet
    await cancelFoodRemindersForPet(payload.pet_id, token);
    // Cria o único push correto
    await createReminder(payload, token);
  } catch {
    // push é best-effort; nunca propaga erro para o caller
  }
}

/**
 * Agenda UM lembrete por tipo + pet (+ título quando `matchByTitle`),
 * substituindo qualquer lembrete anterior com os mesmos identificadores.
 *
 * `matchByTitle` deve ficar true só quando o mesmo `type` legitimamente
 * comporta múltiplos lembretes simultâneos por pet, diferenciados pelo texto
 * (vacina: nomes diferentes; banho/tosa: serviços diferentes). Para tipos
 * onde `type` já é o identificador único por pet (vermífugo/antipulgas/
 * coleira — cada subtipo tem seu próprio `type`, um único "próximo vencimento"
 * por vez), comparar por título é frágil à toa: se o texto do título mudar
 * em qualquer versão futura do app, o lembrete antigo nunca bate no filtro,
 * nunca é substituído, e fica preso apontando pra URL antiga até disparar.
 */
export async function scheduleUniqueReminder(
  payload: CreateReminderPayload & { pet_id: string },
  token: string,
  matchByTitle: boolean = true,
): Promise<void> {
  try {
    const already = await isSubscribed();
    if (already) {
      const registration = await navigator.serviceWorker.ready;
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ''}/notifications/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ subscription: existingSub.toJSON() }),
        });
      }
    } else {
      const ok = await subscribeToPush(token);
      if (!ok) return;
    }
    const existing = await listReminders(token);
    const old = existing.filter(
      (r) => r.type === payload.type && r.pet_id === payload.pet_id && (!matchByTitle || r.title === payload.title),
    );
    await Promise.all(old.map((r) => deleteReminder(r.id, token)));
    await createReminder(payload, token);
  } catch {
    // push é best-effort; nunca propaga erro para o caller
  }
}

function _urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

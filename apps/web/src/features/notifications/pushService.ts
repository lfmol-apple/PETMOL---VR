/**
 * pushService.ts
 *
 * Gerencia a subscription de push do navegador.
 * Fluxo: pedir permissão → registrar SW → obter VAPID key → subscribe → enviar ao backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// ── Subscription ────────────────────────────────────────────────────────────

export async function subscribeToPush(token: string): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;

  const { publicKey } = await fetch(`${API_BASE}/notifications/vapid-public-key`).then(
    (r) => r.json()
  );

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: _urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
  });

  await fetch(`${API_BASE}/notifications/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });

  return true;
}

export async function unsubscribeFromPush(token: string): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }

  await fetch(`${API_BASE}/notifications/subscribe`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function isSubscribed(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const registration = await navigator.serviceWorker.ready;
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

  const registration = await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe();
  }

  const { publicKey } = await fetch(`${API_BASE}/notifications/vapid-public-key`).then((r) => r.json());

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: _urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
  });

  await fetch(`${API_BASE}/notifications/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
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
  | "collar";

export interface CreateReminderPayload {
  pet_id?: string;
  type: ReminderType;
  title: string;
  body?: string;
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

function _urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

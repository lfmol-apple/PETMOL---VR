/**
 * handleNotificationClick.ts
 *
 * Roteador de clique de notificação.
 * Recebe um NotificationPayload e navega para o destino correto.
 *
 * Uso:
 *   handleNotificationClick(notification, router)
 */

import type { NotificationDestination, NotificationPayload } from './notificationDispatcher';

interface RouterLike {
  push: (href: string) => void;
}

// ---------------------------------------------------------------------------
// Mapa de destinos → rota
// ---------------------------------------------------------------------------

function resolveClickUrl(
  destination: NotificationDestination,
  type: string,
  petId: string,
): string {
  const modalMap: Record<string, string> = {
    vaccines: 'vaccines',
    medication: 'medication',
    dewormer: 'vermifugo',
    flea_tick: 'antipulgas',
    collar: 'coleira',
    food: 'food',
    grooming: 'grooming',
    emergency: 'eventos',
    documents: 'health',
  };

  const params = new URLSearchParams({ modal: modalMap[type] ?? 'health', petId });
  if (destination === 'purchase') params.set('buy', '1');
  return `/home?${params}`;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

/**
 * Navega para o destino da notificação usando o router do Next.js.
 *
 * @param notification - Payload gerado pelo dispatcher
 * @param router - Instância de useRouter()
 * @param onNavigate - Callback opcional chamado antes de navegar (ex: fechar drawer)
 */
export function handleNotificationClick(
  notification: Pick<NotificationPayload, 'destination' | 'type' | 'petId'>,
  router: RouterLike,
  onNavigate?: () => void,
): void {
  const url = resolveClickUrl(notification.destination, notification.type, notification.petId);
  onNavigate?.();
  router.push(url);
}

/**
 * Variante sem router — retorna apenas a URL calculada.
 * Útil para construção de links estáticos.
 */
export function getNotificationClickUrl(
  notification: Pick<NotificationPayload, 'destination' | 'type' | 'petId'>,
): string {
  return resolveClickUrl(notification.destination, notification.type, notification.petId);
}

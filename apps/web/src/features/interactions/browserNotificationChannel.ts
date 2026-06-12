export interface BrowserNotificationPayload {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  autoCloseMs?: number;
  onClickUrl?: string;
  onClick?: () => void;
}

export function canUseBrowserNotifications(): boolean {
  // Legacy neutralizado: canal de browser notification desativado.
  return false;
}

export function showBrowserNotification(_payload: BrowserNotificationPayload): Notification | null {
  return null;
}

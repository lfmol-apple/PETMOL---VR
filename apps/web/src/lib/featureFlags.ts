/**
 * Feature Flags - Controle de features experimentais
 */

export function isVigiaEnabled(): boolean {
  // Vigia desligada por padrão (SLICE 0 - proteção)
  // Para ativar: NEXT_PUBLIC_ENABLE_VIGIA=1
  return process.env.NEXT_PUBLIC_ENABLE_VIGIA === '1';
}

export function isAutoDetectorEnabled(): boolean {
  // Auto-detector desligado por padrão (SLICE 0 - proteção)
  return process.env.NEXT_PUBLIC_ENABLE_AUTO_DETECTOR === '1';
}

export function isEventNudgeEnabled(): boolean {
  // Event nudge desligado por padrão (SLICE 0 - proteção)
  return process.env.NEXT_PUBLIC_ENABLE_EVENT_NUDGE === '1';
}

export function isNotificationPromptEnabled(): boolean {
  // NotificationPrompt removido junto com a infraestrutura antiga de push.
  // Mantemos a função apenas para compatibilidade de import, sempre desativada.
  return false;
}

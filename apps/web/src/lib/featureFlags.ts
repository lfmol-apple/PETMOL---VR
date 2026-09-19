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

export function isAdmin(email?: string): boolean {
  // Apenas leonardofmol@gmail.com é admin
  return email === 'leonardofmol@gmail.com';
}

// Medicamentos: decisão de produto (18/09/2026) — não faz parte do PETMOL
// 1.0. Implementação completa preservada (código, dados, testes); só a
// experiência do usuário é desligada. Ponto de recuperação: branch/tag
// `archive/medicamentos-pre-1.0` no commit cbacba4. Ver
// docs/MEDICAMENTOS_DESATIVADOS.md pra reativar.
export const MEDICATIONS_ENABLED = false;

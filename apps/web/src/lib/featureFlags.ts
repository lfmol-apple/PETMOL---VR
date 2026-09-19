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

// Medicamentos: reativado em 19/09/2026 — volta o card pro 1.0 (o dono vai
// simplificá-lo mais antes do lançamento). Tinha sido desligado em
// 18/09/2026 via feature flag (implementação preservada, não apagada);
// ponto de recuperação daquela decisão, se precisar: branch/tag
// `archive/medicamentos-pre-1.0` no commit cbacba4. Ver
// docs/MEDICAMENTOS_DESATIVADOS.md pro histórico.
export const MEDICATIONS_ENABLED = true;

// Plano de Saúde (Petlove) — card "Em breve" na Home desativado pro
// lançamento 1.0 (19/09/2026): sem parceria aprovada, o card não tinha
// nenhuma função por trás e só gerava expectativa sem entrega logo nos
// primeiros minutos do app (achado da auditoria final). A versão comercial
// (HEALTH_PLAN_ENABLED, em features/healthPlan/config.ts) já dependia de
// variáveis de ambiente que nunca foram setadas; esta flag some também com
// a versão neutra "Em breve" que aparecia mesmo assim. Reativar: true aqui.
export const HEALTH_PLAN_CARD_ENABLED = false;

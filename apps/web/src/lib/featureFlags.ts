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

export function isTravelLanguageDetectionEnabled(): boolean {
  // Desligada por padrão: descobrir o país pelo IP exige chamar serviços de terceiros
  // (ipapi.co e api.country.is) do aparelho do tutor em TODA página e a cada 5 minutos —
  // custo de rede, limite de uso gratuito (429) e o IP do tutor indo pra fora — e o
  // PETMOL hoje é só pt-BR. Para religar o aviso de "viagem/idioma": NEXT_PUBLIC_ENABLE_TRAVEL_DETECTION=1
  return process.env.NEXT_PUBLIC_ENABLE_TRAVEL_DETECTION === '1';
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

// Vídeo "Como funciona o PETMOL — 45 segundos" na tela de boas-vindas
// (welcome/page.tsx) desativado pro lançamento 1.0 (19/09/2026): não existe
// vídeo hospedado ainda — tocar no botão só abria um modal "Vídeo em breve".
// Mesmo achado de padrão do Plano de Saúde: fricção logo nos primeiros
// minutos do app. Implementação preservada; reativar quando o vídeo existir.
export const WELCOME_VIDEO_ENABLED = false;

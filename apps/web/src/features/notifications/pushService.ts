/**
 * pushService.ts
 *
 * Envia push notifications via backend PETMOL.
 * Endpoint: POST /notifications/send
 */

export interface PushPayload {
  /** ID único para deduplicação */
  id: string;
  petId: string;
  petName: string;
  title: string;
  body: string;
  /** URL de ícone */
  icon?: string;
  /** Destino ao clicar (rota interna) */
  clickUrl?: string;
  /** Tag para sobreposição no SO */
  tag?: string;
  /** Horário preferencial (HH:mm) */
  preferredHour?: string;
  /** Domínio de origem */
  domain?: string;
}

// ---------------------------------------------------------------------------
// Deduplicação em memória (por sessão)
// ---------------------------------------------------------------------------
const sentInSession = new Set<string>();

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Envia um push para o dispositivo do tutor via backend.
 * Deduplica por `payload.id` dentro da sessão atual.
 */
export async function sendPush(payload: PushPayload): Promise<void> {
  void payload;
  // Legacy neutralizado: envio de push via frontend desativado.
  return;
}

/**
 * Limpa o registro de sessão (útil para testes ou reset manual).
 */
export function clearPushSessionCache(): void {
  sentInSession.clear();
}

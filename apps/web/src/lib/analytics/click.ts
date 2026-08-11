/**
 * Backend analytics click tracker — Motor de Intenção.
 *
 * POSTs to /analytics/click (FastAPI) and returns the lead_id so the caller
 * can append it to handoff/redirect URLs for attribution.
 *
 * Never throws — analytics must NEVER block UX.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export interface ClickPayload {
  /** Where the click originated (e.g. 'home', 'rg_public', 'sos') */
  source: string;
  /** What kind of action (e.g. 'shop_redirect', 'health_plan_click') */
  cta_type: string;
  /** Destination partner or internal section (e.g. 'petz', 'petlove') */
  target?: string;
  /**
   * Natureza do link comercial de fato aberto — para distinguir clique
   * monetizado de fallback sem afiliado. Ausente em cliques não-comerciais.
   */
  link_type?: 'affiliate_product' | 'affiliate_store' | 'direct';
  /** Pet context, if available */
  pet_id?: string;
  /** Free-form metadata — no PII */
  metadata?: Record<string, unknown>;
}

/**
 * Track a click event on the backend and return the lead_id.
 * Falls back gracefully to an empty string on any error.
 */
export async function trackClick(payload: ClickPayload): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}/analytics/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data: { lead_id?: string } = await res.json();
      return data.lead_id ?? '';
    }
  } catch {
    // Silently swallow — analytics never breaks the flow.
  }
  return '';
}

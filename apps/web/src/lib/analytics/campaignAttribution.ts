/**
 * Atribuição de campanha — captura da URL de entrada (?utm_source=...) uma
 * vez por sessão de navegador (sessionStorage: limpa sozinha quando a aba
 * fecha, uma proxy razoável pra "sessão" sem inventar expiração própria).
 *
 * "First touch" dentro da sessão: se a pessoa chegou com utm_* na URL,
 * grava; navegações seguintes na mesma aba SEM utm_* na URL mantêm o
 * primeiro rótulo capturado (não apaga a atribuição real por causa de um
 * clique interno sem parâmetro). Nunca a URL de referrer inteira — só o
 * host, evita guardar query string de terceiro que não é nossa.
 */

const STORAGE_KEY = 'petmol_campaign_attribution_v1';

export interface CampaignAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer_host?: string;
  landing_path?: string;
}

function clip(v: string | null | undefined, len: number): string | undefined {
  const s = (v || '').trim();
  return s ? s.slice(0, len) : undefined;
}

function refererHost(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const host = new URL(document.referrer).hostname;
    // referrer do próprio domínio não é "origem externa" — não é campanha
    if (host === window.location.hostname) return undefined;
    return clip(host, 160);
  } catch {
    return undefined;
  }
}

function readFromUrl(): CampaignAttribution | null {
  const params = new URLSearchParams(window.location.search);
  const utm_source = clip(params.get('utm_source'), 120);
  const utm_medium = clip(params.get('utm_medium'), 120);
  const utm_campaign = clip(params.get('utm_campaign'), 160);
  const utm_content = clip(params.get('utm_content'), 160);
  const utm_term = clip(params.get('utm_term'), 160);
  if (!utm_source && !utm_medium && !utm_campaign && !utm_content && !utm_term) return null;
  return {
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    referrer_host: refererHost(),
    landing_path: clip(window.location.pathname, 200),
  };
}

function readStored(): CampaignAttribution | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CampaignAttribution) : null;
  } catch {
    return null;
  }
}

function writeStored(v: CampaignAttribution): void {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* noop */ }
}

/** Chama a cada carregamento de página — captura só quando há utm_* real
 * na URL e ainda não tinha nada guardado nesta sessão; senão devolve o que
 * já tinha (ou nada, se a sessão inteira foi acesso direto/orgânico). */
export function getCampaignAttribution(): CampaignAttribution {
  if (typeof window === 'undefined') return {};
  const already = readStored();
  if (already) return already;

  // Nada guardado ainda nesta sessão — captura AGORA (com ou sem utm_* na
  // URL) e fixa pro resto da sessão, pra `landing_path`/`referrer_host`
  // sempre refletirem a 1ª página vista, não a página atual de quem chamou
  // esta função depois.
  const fromUrl = readFromUrl() || {
    referrer_host: refererHost(),
    landing_path: clip(window.location.pathname, 200),
  };
  writeStored(fromUrl);
  return fromUrl;
}

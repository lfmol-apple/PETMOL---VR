/**
 * Construção CENTRALIZADA de Links Especiais da Amazon (Programa de
 * Associados). Ponto único — nenhum componente monta URL da Amazon à mão.
 *
 * Contexto: a candidatura anterior do PETMOL foi rejeitada, e a Amazon
 * informou que "não conseguiu identificar corretamente o ID de
 * rastreamento nos Links Especiais". Esta arquitetura torna esse erro
 * impossível de repetir:
 *
 *  1. o Tracking ID vem SÓ de `NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG` (env) —
 *     nunca hardcoded, nunca reaproveitado de tag antiga;
 *  2. sem um Tracking ID válido configurado, `buildAmazonLink()` retorna
 *     `null` e NENHUM link da Amazon é gerado. A ausência de tag impede a
 *     geração — não gera link "sem tag" nem link quebrado;
 *  3. toda URL passa por `tag=<trackingId>` acrescentado por esta função,
 *     de forma auditável (`auditAmazonLink`).
 *
 * NESTA ENTREGA a monetização Amazon está DESATIVADA: sem env configurada,
 * `isAmazonEnabled()` é `false` e nada da Amazon aparece.
 */

const AMAZON_HOSTS = ['amazon.com.br', 'www.amazon.com.br'];

/** Formato de Tracking ID de Associado: "algo-20" / "algo-21" etc. */
const TRACKING_ID_RE = /^[a-z0-9](?:[a-z0-9-]{1,48})-\d{2}$/i;

export function getAmazonTrackingId(): string | null {
  const raw = (process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG ?? '').trim();
  if (!raw) return null;
  if (!TRACKING_ID_RE.test(raw)) return null;
  return raw;
}

export function isAmazonEnabled(): boolean {
  return getAmazonTrackingId() !== null;
}

export interface AmazonLinkInput {
  /** URL de produto/busca da Amazon Brasil (amazon.com.br). */
  url: string;
  /** SubID opcional de campanha (ascsubtag) — origem do clique, para relatório. */
  subId?: string;
}

/**
 * Retorna a URL final com o Tracking ID, ou `null` se:
 *  - não há Tracking ID válido configurado, OU
 *  - a URL não é de amazon.com.br, OU
 *  - a URL é inválida.
 *
 * `null` significa "não exiba link da Amazon" — nunca caia para a URL sem tag.
 */
export function buildAmazonLink({ url, subId }: AmazonLinkInput): string | null {
  const trackingId = getAmazonTrackingId();
  if (!trackingId) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!AMAZON_HOSTS.includes(parsed.hostname)) return null;

  parsed.searchParams.set('tag', trackingId);
  parsed.searchParams.set('linkCode', 'll1');
  parsed.searchParams.set('language', 'pt_BR');
  if (subId && /^[a-z0-9_-]{1,40}$/i.test(subId)) {
    parsed.searchParams.set('ascsubtag', subId);
  }
  return parsed.toString();
}

export interface AmazonLinkAudit {
  ok: boolean;
  reason?: string;
  trackingIdPresent: boolean;
  trackingIdInUrl: boolean;
  isAmazonHost: boolean;
}

/** Verifica se uma URL já construída está conforme — para testes e ferramentas de auditoria. */
export function auditAmazonLink(finalUrl: string): AmazonLinkAudit {
  const trackingId = getAmazonTrackingId();
  const base: AmazonLinkAudit = {
    ok: false,
    trackingIdPresent: trackingId !== null,
    trackingIdInUrl: false,
    isAmazonHost: false,
  };
  let parsed: URL;
  try {
    parsed = new URL(finalUrl);
  } catch {
    return { ...base, reason: 'URL inválida' };
  }
  base.isAmazonHost = AMAZON_HOSTS.includes(parsed.hostname);
  const tagInUrl = parsed.searchParams.get('tag');
  base.trackingIdInUrl = Boolean(tagInUrl);
  if (!base.isAmazonHost) return { ...base, reason: 'não é amazon.com.br' };
  if (!tagInUrl) return { ...base, reason: 'sem parâmetro tag (Tracking ID)' };
  if (trackingId && tagInUrl !== trackingId) return { ...base, reason: 'tag diferente do Tracking ID configurado' };
  return { ...base, ok: true };
}

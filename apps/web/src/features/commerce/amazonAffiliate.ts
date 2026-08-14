/**
 * Gerador/validador de link afiliado Amazon (Programa de Associados,
 * StoreID/Partner Tag `petmol-20`, categoria Pet Shop, 11% informado).
 *
 * MVP deliberadamente sem PA-API/Creators API (credenciais ainda não
 * emitidas pela Amazon — a PA-API 5 antiga está descontinuada, ver
 * docs/AFFILIATES.md): dois modos, nenhum deles busca preço/imagem/nota
 * da Amazon (nunca scraping) —
 *   - busca por nome do produto (`buildAmazonSearchUrl`);
 *   - link de produto já conhecido, com a tag aplicada/corrigida
 *     (`buildAmazonProductUrl`), só quando o domínio é realmente Amazon.
 *
 * Client-side (sem round-trip ao backend) de propósito: a tag não é
 * segredo (aparece em toda URL gerada, como o publisher ID da Awin), e a
 * Amazon pede navegação direta no clique, não uma consulta prévia.
 */

const AMAZON_APEX_DOMAIN = 'amazon.com.br';
const DEFAULT_AMAZON_ASSOCIATE_TAG = 'petmol-20';

export const AMAZON_ASSOCIATE_TAG: string =
  process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG || DEFAULT_AMAZON_ASSOCIATE_TAG;

/**
 * true só para `amazon.com.br` exato ou um subdomínio real dele
 * (ex: `www.amazon.com.br`, `smile.amazon.com.br`) — nunca por
 * `includes()`/prefixo, que aceitaria domínios forjados como
 * `amazon.com.br.golpe.com` (prefixo) ou `golpeamazon.com.br` (colado
 * sem o ponto de subdomínio).
 */
export function isAllowedAmazonHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === AMAZON_APEX_DOMAIN || host.endsWith(`.${AMAZON_APEX_DOMAIN}`);
}

function parseHttpsUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // Bloqueia explicitamente qualquer esquema que não seja https — cobre
  // http, javascript:, data:, file: e qualquer outro de uma vez, sem
  // precisar de uma lista de bloqueio separada.
  if (url.protocol !== 'https:') return null;
  return url;
}

/**
 * Monta uma URL de busca Amazon a partir de um termo (nome do produto) —
 * sempre segura por construção, nunca recebe URL externa. Encoding manual
 * (não URLSearchParams) de propósito: precisa bater com o formato real de
 * busca da Amazon (espaço -> %20), URLSearchParams usaria "+".
 */
export function buildAmazonSearchUrl(query: string, tag: string = AMAZON_ASSOCIATE_TAG): string {
  const trimmed = query.trim();
  const encodedQuery = encodeURIComponent(trimmed);
  const encodedTag = encodeURIComponent(tag);
  return `https://www.${AMAZON_APEX_DOMAIN}/s?k=${encodedQuery}&tag=${encodedTag}`;
}

/**
 * Valida uma URL de produto Amazon já conhecida e garante que ela carrega
 * a tag correta — nunca gera URL nova a partir de ASIN (sem PA-API pra
 * confirmar ASIN real, ver docstring do módulo). `null` significa
 * "rejeitada": domínio não é Amazon de verdade, esquema não é https, ou
 * URL malformada — quem chamar nunca deve cair para a URL crua nesse caso.
 */
export function buildAmazonProductUrl(rawUrl: string, tag: string = AMAZON_ASSOCIATE_TAG): string | null {
  const url = parseHttpsUrl(rawUrl);
  if (!url) return null;
  if (!isAllowedAmazonHost(url.hostname)) return null;

  // .set() substitui "tag" se já existir (link colado com tag errada/de
  // terceiro) ou adiciona se não existir — todo outro parâmetro
  // (variante de produto, campanha, etc.) é preservado como veio.
  url.searchParams.set('tag', tag);
  return url.toString();
}

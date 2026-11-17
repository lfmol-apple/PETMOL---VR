/** Monta a campanha a partir dos dados lidos do link da oferta (nome, loja, preço, desconto). Funções puras: o que for digitado vale mais. */

export interface OfferInfo { store: string; title: string | null; price?: number | null; list_price?: number | null; discount_pct?: number | null }

export const LINK_TITLE = '{tutor}, olha este produto para {pets}';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Preço só entra no texto fora da Amazon (regra do programa de Associados: não citar preço da Amazon). */
const mayQuotePrice = (o: OfferInfo) => o.store !== 'Amazon' && typeof o.price === 'number' && o.price > 0;

export function composeCampaign(o: OfferInfo): { name: string; title: string; message: string } {
  const product = (o.title ?? '').trim();
  const discount = typeof o.discount_pct === 'number' && o.discount_pct >= 10 && mayQuotePrice(o) ? o.discount_pct : null;
  const title = discount ? `{tutor}, oferta para {pets}: ${discount}% de desconto` : LINK_TITLE;
  let tail = ' — toque para ver.';
  if (mayQuotePrice(o)) {
    tail = ` por ${brl(o.price as number)}`;
    if (discount && o.list_price) tail += ` (de ${brl(o.list_price)})`;
    tail += ' — toque para ver.';
  }
  const room = Math.max(10, 240 - tail.length);
  const message = product ? `${product.length > room ? `${product.slice(0, room - 1).trimEnd()}…` : product}${tail}` : '';
  return { name: product.slice(0, 120), title, message };
}

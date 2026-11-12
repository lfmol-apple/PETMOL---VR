/**
 * Notificação do admin com LINK DE PRODUTO (aba Push do /admin): o toque abre a Home com ?produto=<link>&b=<envio>
 * e a Home abre o produto DIRETO na loja, do mesmo jeito que um toque na Loja do Pet (afiliado, app nativo da loja,
 * ponte da Cobasi no Android — tudo em navigateToPartnerUrl).
 *
 * Segurança: só abre https de lojas conhecidas (lista abaixo). Qualquer outro endereço é ignorado, mesmo que alguém
 * monte uma URL na mão. A lista é a MESMA do servidor (services/price-service/src/admin/product_link.py, STORE_HOSTS);
 * um teste confere que são iguais. Ao acrescentar uma loja, acrescente nos dois.
 */
import { Capacitor } from '@capacitor/core';
import { navigateToPartnerUrl } from './homeShoppingPartners';

export const PUSH_PRODUCT_HOSTS = [
  'www.amazon.com.br', 'amazon.com.br', 'amzn.to', 'www.amazon.com', 'amazon.com',
  'shopee.com.br', 'www.shopee.com.br', 's.shopee.com.br',
  'www.mercadolivre.com.br', 'mercadolivre.com.br', 'lista.mercadolivre.com.br', 'produto.mercadolivre.com.br', 'meli.la',
  'www.cobasi.com.br', 'cobasi.com.br', 'minhaloja.cobasi.com.br', 'mais.app',
  'www.awin1.com', 'awin1.com',
  'www.petz.com.br', 'petz.com.br',
  'www.petlove.com.br', 'petlove.com.br',
  'www.zeedog.com.br', 'zeedog.com.br', 'www.zeenow.com.br', 'zeenow.com.br',
] as const;

/** true só para uma URL https (sem login/porta) de uma loja da lista. */
export function isPushProductUrl(raw: string | null | undefined): boolean {
  try {
    const u = new URL((raw ?? '').trim());
    return u.protocol === 'https:' && !u.username && !u.password && (u.port === '' || u.port === '443')
      && (PUSH_PRODUCT_HOSTS as readonly string[]).includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Abre o produto. No app nativo usa o caminho de sempre das lojas; na web/PWA, navega na própria aba (sem bloqueio de pop-up). */
export function openPushProductLink(raw: string): boolean {
  const url = (raw ?? '').trim();
  if (!isPushProductUrl(url)) return false;
  if (Capacitor.isNativePlatform()) navigateToPartnerUrl(url);
  else window.location.assign(url);
  return true;
}

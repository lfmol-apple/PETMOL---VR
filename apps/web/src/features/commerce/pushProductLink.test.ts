import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const nav = vi.fn();
let native = false;
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native, getPlatform: () => 'ios' } }));
vi.mock('./homeShoppingPartners', () => ({ navigateToPartnerUrl: (...a: unknown[]) => nav(...a) }));

import { isPushProductUrl, openPushProductLink, PUSH_PRODUCT_HOSTS } from './pushProductLink';

describe('isPushProductUrl', () => {
  it.each([
    'https://amzn.to/3SN1ORt', 'https://www.amazon.com.br/dp/B07FQ6F1PZ?tag=amazonpetmol-20', 'https://s.shopee.com.br/4AzW1leQcW',
    'https://www.cobasi.com.br/racao-x/p', 'https://meli.la/1Ab2Cd3', 'https://www.awin1.com/cread.php?awinmid=1&ued=abc',
  ])('aceita %s', (u) => expect(isPushProductUrl(u)).toBe(true));

  it.each([
    '', null, undefined, 'http://amzn.to/x', 'https://evil.com/amazon.com.br', 'https://amazon.com.br.evil.com/x', 'https://user:pw@amzn.to/x',
    'https://amzn.to:8443/x', 'javascript:alert(1)', 'data:text/html,<b>x</b>', '//amzn.to/x', 'https://localhost/x',
  ])('recusa %s', (u) => expect(isPushProductUrl(u as string)).toBe(false));
});

describe('openPushProductLink', () => {
  beforeEach(() => { nav.mockClear(); native = false; });

  it('no app nativo usa o caminho das lojas (afiliado, app nativo, ponte da Cobasi)', () => {
    native = true;
    expect(openPushProductLink('https://amzn.to/3SN1ORt')).toBe(true);
    expect(nav).toHaveBeenCalledWith('https://amzn.to/3SN1ORt');
  });

  it('na web navega na própria aba', () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, assign }, writable: true });
    expect(openPushProductLink('https://www.cobasi.com.br/x/p')).toBe(true);
    expect(assign).toHaveBeenCalledWith('https://www.cobasi.com.br/x/p');
    expect(nav).not.toHaveBeenCalled();
  });

  it('link de fora da lista nunca abre', () => {
    expect(openPushProductLink('https://evil.com/x')).toBe(false);
    expect(nav).not.toHaveBeenCalled();
  });
});

describe('lista de lojas', () => {
  it('é a mesma do servidor (product_link.py)', () => {
    const py = readFileSync(resolve(__dirname, '../../../../../services/price-service/src/admin/product_link.py'), 'utf-8');
    const bloco = py.split('STORE_HOSTS: dict[str, str] = {')[1].split('\n}')[0];
    const servidor = new Set([...bloco.matchAll(/"([a-z0-9.\-]+\.[a-z]{2,})":/g)].map((m) => m[1]));
    expect(new Set(PUSH_PRODUCT_HOSTS as readonly string[])).toEqual(servidor);
  });
});

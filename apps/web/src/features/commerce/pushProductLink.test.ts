import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const nav = vi.fn();
const order: string[] = [];
let native = false;
let platform = 'ios';
let token: string | null = 'tok';
let storeNativeUser = vi.fn<() => Promise<boolean>>();
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native, getPlatform: () => platform } }));
vi.mock('./homeShoppingPartners', () => ({ navigateToPartnerUrl: (...a: unknown[]) => { order.push('abriu'); nav(...a); } }));
vi.mock('./storeNativeOpen', () => ({ isStoreNativeOpenUser: () => storeNativeUser() }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => token }));

import { isPushProductUrl, openPushProductLink, productTapKey, PUSH_PRODUCT_HOSTS } from './pushProductLink';

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

describe('um toque por ENVIO (e não um por sessão)', () => {
  // Reproduz o defeito: o app continua aberto, o teste abriu a loja e o envio real (outro b) foi ignorado.
  const simula = (taps: Array<[string | null, string | null]>) => {
    let ultimo: string | null = null; const abriu: string[] = [];
    for (const [raw, b] of taps) {
      const key = productTapKey(raw, b);
      if (!raw || !key) { ultimo = null; continue; }
      if (ultimo === key) continue;
      ultimo = key; abriu.push(b ?? '');
    }
    return abriu;
  };
  it('o teste e depois o envio real na mesma sessão: os DOIS abrem', () => {
    expect(simula([['https://amzn.to/x', 'teste-1'], ['https://amzn.to/x', 'real-2']])).toEqual(['teste-1', 'real-2']);
  });
  it('o mesmo toque repetido (re-renderização) não reabre', () => {
    expect(simula([['https://amzn.to/x', 'b1'], ['https://amzn.to/x', 'b1'], ['https://amzn.to/x', 'b1']])).toEqual(['b1']);
  });
  it('depois da URL limpa, o mesmo envio pode abrir de novo', () => {
    expect(simula([['https://amzn.to/x', 'b1'], [null, null], ['https://amzn.to/x', 'b1']])).toEqual(['b1', 'b1']);
  });
  it('a chave muda com o envio e com o link', () => {
    expect(productTapKey('https://amzn.to/x', 'b1')).not.toBe(productTapKey('https://amzn.to/x', 'b2'));
    expect(productTapKey('https://amzn.to/x', 'b1')).not.toBe(productTapKey('https://amzn.to/y', 'b1'));
    expect(productTapKey(null, 'b1')).toBeNull();
  });
});

describe('openPushProductLink', () => {
  beforeEach(() => {
    vi.useFakeTimers(); nav.mockClear(); order.length = 0; native = false; platform = 'ios'; token = 'tok';
    storeNativeUser = vi.fn(async () => { order.push('checou'); return true; });
  });
  afterEach(() => vi.useRealTimers());

  it('iPhone: confirma "abre no app da loja" ANTES de abrir (é o que mantém o ◀ PETMOL)', async () => {
    native = true;
    expect(await openPushProductLink('https://amzn.to/3SN1ORt')).toBe(true);
    expect(order).toEqual(['checou', 'abriu']);
    expect(nav).toHaveBeenCalledWith('https://amzn.to/3SN1ORt');
  });

  it('iPhone logo após tocar na notificação: espera o login carregar antes de checar', async () => {
    native = true; token = null;
    const p = openPushProductLink('https://amzn.to/x');
    await vi.advanceTimersByTimeAsync(600);
    expect(storeNativeUser).not.toHaveBeenCalled();     // sem login não adianta checar
    expect(nav).not.toHaveBeenCalled();
    token = 'tok';
    await vi.advanceTimersByTimeAsync(300);
    await p;
    expect(order).toEqual(['checou', 'abriu']);
  });

  it('iPhone: se a primeira checagem estoura o limite (rede acordando), tenta de novo antes de abrir', async () => {
    native = true;
    let n = 0;
    storeNativeUser = vi.fn(async () => { n += 1; order.push('checou' + n); if (n === 1) { await new Promise((r) => setTimeout(r, 1500)); return false; } return true; });
    const p = openPushProductLink('https://amzn.to/x');
    await vi.advanceTimersByTimeAsync(1600);
    await p;
    expect(storeNativeUser).toHaveBeenCalledTimes(2);
    expect(order).toEqual(['checou1', 'checou2', 'abriu']);
  });

  it('iPhone, conta comum (negativa rápida): abre sem esperar nem repetir', async () => {
    native = true;
    storeNativeUser = vi.fn(async () => false);
    await openPushProductLink('https://amzn.to/x');
    expect(storeNativeUser).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledTimes(1);
  });

  it('iPhone: nunca trava para sempre; passado o prazo abre do jeito de sempre', async () => {
    native = true; token = null;
    const p = openPushProductLink('https://amzn.to/x');
    await vi.advanceTimersByTimeAsync(4500);
    await p;
    expect(nav).toHaveBeenCalledTimes(1);
  });

  it('Android: não faz a checagem do iPhone', async () => {
    native = true; platform = 'android';
    await openPushProductLink('https://www.cobasi.com.br/x/p');
    expect(storeNativeUser).not.toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('https://www.cobasi.com.br/x/p');
  });

  it('na web navega na própria aba', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, assign }, writable: true });
    expect(await openPushProductLink('https://www.cobasi.com.br/x/p')).toBe(true);
    expect(assign).toHaveBeenCalledWith('https://www.cobasi.com.br/x/p');
    expect(nav).not.toHaveBeenCalled();
  });

  it('link de fora da lista nunca abre', async () => {
    native = true;
    expect(await openPushProductLink('https://evil.com/x')).toBe(false);
    expect(nav).not.toHaveBeenCalled();
    expect(storeNativeUser).not.toHaveBeenCalled();
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

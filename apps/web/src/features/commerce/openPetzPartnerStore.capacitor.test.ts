import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capacitor (app nativo PETMOL): `window.open` não devolve handle usável,
// então o two-hop web não roda. Com URL REAL de produto, "Ver na Petz"
// faz o TWO-HOP NATIVO: abre a Loja Parceira no navegador do sistema
// (Petz grava o cookie `petzPartner`), espera carregar, FECHA e REABRE
// já na URL do produto — a sessão do navegador do sistema mantém o
// cookie dentro do app. Sem URL real → fallback ponte /go/petz.
// Ver docs/AFFILIATES.md §Petz.

type Listener = () => void;
const listeners: Record<string, Listener[]> = {};
const browserOpen = vi.fn().mockResolvedValue(undefined);
const browserClose = vi.fn().mockResolvedValue(undefined);
const browserAddListener = vi.fn(async (evt: string, fn: Listener) => {
  (listeners[evt] ??= []).push(fn);
  return { remove: vi.fn() };
});
const browserRemoveAllListeners = vi.fn(async () => {
  for (const k of Object.keys(listeners)) delete listeners[k];
});
const emit = (evt: string) => (listeners[evt] ?? []).slice().forEach((fn) => fn());

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: browserOpen,
    close: browserClose,
    addListener: browserAddListener,
    removeAllListeners: browserRemoveAllListeners,
  },
}));

const PARTNER_STORE = 'https://www.petz.com.br/parceiro/pettmol';
const PRODUCT_URL = 'https://www.petz.com.br/produto/kit-enxoval-201842';

/** Flush repetido de microtasks + timers pendentes (cadeia de awaits +
 *  setTimeout dentro do two-hop nativo). */
async function settle(ms = 0) {
  for (let i = 0; i < 8; i++) await vi.advanceTimersByTimeAsync(ms);
}

describe('openPetzPartnerStore — Capacitor', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockClear();
    browserOpen.mockReset().mockResolvedValue(undefined);
    browserClose.mockReset().mockResolvedValue(undefined);
    browserAddListener.mockClear();
    browserRemoveAllListeners.mockClear();
    for (const k of Object.keys(listeners)) delete listeners[k];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('com URL real de produto: abre a Loja Parceira, depois fecha e reabre no produto', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    const done = openPetzPartnerStore({ productUrl: PRODUCT_URL, productName: 'Kit Enxoval' });

    await settle(); // import + 1º Browser.open + registro dos listeners
    expect(browserOpen).toHaveBeenNthCalledWith(1, { url: PARTNER_STORE });

    emit('browserPageLoaded'); // Loja Parceira carregou → segue pro 2º hop
    await settle(1000); // gap fechar→reabrir (700ms)
    await done;

    expect(browserClose).toHaveBeenCalledTimes(1);
    expect(browserOpen).toHaveBeenNthCalledWith(2, { url: PRODUCT_URL });
    expect(openSpy).not.toHaveBeenCalledWith('about:blank', '_blank');
    // com URL exata, copia o CUPOM (não o nome)
    expect(writeText).toHaveBeenCalledWith('PETTMOL');
    expect(writeText).not.toHaveBeenCalledWith('Kit Enxoval');
  });

  it('segue pro 2º hop mesmo sem o evento de load (timeout)', async () => {
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    const done = openPetzPartnerStore({ productUrl: PRODUCT_URL, productName: 'Kit Enxoval' });

    await settle();
    await vi.advanceTimersByTimeAsync(3600); // > PETZ_NATIVE_HOP_LOAD_TIMEOUT_MS
    await settle(1000);
    await done;

    expect(browserOpen).toHaveBeenNthCalledWith(2, { url: PRODUCT_URL });
  });

  it('se o usuário fecha a Loja Parceira antes do load, NÃO força o produto', async () => {
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    const done = openPetzPartnerStore({ productUrl: PRODUCT_URL, productName: 'Kit Enxoval' });

    await settle();
    emit('browserFinished'); // usuário fechou
    await settle(2000);
    await done;

    expect(browserOpen).toHaveBeenCalledTimes(1);
    expect(browserClose).not.toHaveBeenCalled();
  });

  it('se a 2ª open é recusada, reabre a Loja Parceira (comissão intacta)', async () => {
    browserOpen
      .mockResolvedValueOnce(undefined) // 1º hop
      .mockRejectedValueOnce(new Error('Unable to display URL')) // 2º hop recusado
      .mockResolvedValueOnce(undefined); // reabre a loja

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    const done = openPetzPartnerStore({ productUrl: PRODUCT_URL, productName: 'Kit Enxoval' });

    await settle();
    emit('browserPageLoaded');
    await settle(1000);
    await done;

    expect(browserOpen).toHaveBeenNthCalledWith(2, { url: PRODUCT_URL });
    expect(browserOpen).toHaveBeenNthCalledWith(3, { url: PARTNER_STORE });
  });

  it('sem URL real de produto: fallback ponte /go/petz (sem two-hop nativo)', async () => {
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    const done = openPetzPartnerStore({ productName: 'Ração Golden' });
    await settle();
    await done;

    expect(browserOpen).toHaveBeenCalledTimes(1);
    const url = browserOpen.mock.calls[0][0].url as string;
    expect(url).toContain('/go/petz');
    expect(url).not.toContain('petz.com.br/produto');
    expect(browserClose).not.toHaveBeenCalled();
  });
});

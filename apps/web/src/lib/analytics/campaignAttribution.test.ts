import { beforeEach, describe, expect, it, vi } from 'vitest';

function setLocation(pathname: string, search: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname, search, hostname: 'petmol.com.br' },
    writable: true,
  });
}

describe('campaignAttribution — captura UTM da URL de entrada, 1x por sessão', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  });

  it('captura utm_* da URL quando presentes', async () => {
    setLocation('/register-pet', '?utm_source=meta&utm_medium=cpc&utm_campaign=lancamento_v1');
    const { getCampaignAttribution } = await import('./campaignAttribution');
    const attr = getCampaignAttribution();
    expect(attr.utm_source).toBe('meta');
    expect(attr.utm_medium).toBe('cpc');
    expect(attr.utm_campaign).toBe('lancamento_v1');
    expect(attr.landing_path).toBe('/register-pet');
  });

  it('mantém o primeiro rótulo capturado mesmo navegando pra uma página sem utm_* (first-touch da sessão)', async () => {
    setLocation('/register-pet', '?utm_source=meta&utm_campaign=lancamento_v1');
    const { getCampaignAttribution } = await import('./campaignAttribution');
    const first = getCampaignAttribution();

    // "navega" pra outra página, sem utm_* na URL
    setLocation('/home', '');
    const second = getCampaignAttribution();

    expect(second.utm_source).toBe('meta');
    expect(second.utm_campaign).toBe('lancamento_v1');
    expect(second.landing_path).toBe('/register-pet'); // continua a 1ª página, não /home
    expect(second).toEqual(first);
  });

  it('um utm_campaign NOVO na URL não sobrescreve o que já foi capturado nesta sessão', async () => {
    setLocation('/a', '?utm_campaign=primeira');
    const { getCampaignAttribution } = await import('./campaignAttribution');
    getCampaignAttribution();

    setLocation('/b', '?utm_campaign=segunda');
    const second = getCampaignAttribution();
    expect(second.utm_campaign).toBe('primeira');
  });

  it('sem utm_* nunca: registra host do referrer e landing_path (acesso direto/orgânico com origem conhecida)', async () => {
    setLocation('/loja', '');
    Object.defineProperty(document, 'referrer', { value: 'https://www.google.com/search?q=petmol', configurable: true });
    const { getCampaignAttribution } = await import('./campaignAttribution');
    const attr = getCampaignAttribution();
    expect(attr.utm_source).toBeUndefined();
    expect(attr.referrer_host).toBe('www.google.com');
    expect(attr.landing_path).toBe('/loja');
  });

  it('referrer do próprio domínio não conta como origem externa', async () => {
    setLocation('/loja', '');
    Object.defineProperty(document, 'referrer', { value: 'https://petmol.com.br/home', configurable: true });
    const { getCampaignAttribution } = await import('./campaignAttribution');
    expect(getCampaignAttribution().referrer_host).toBeUndefined();
  });
});

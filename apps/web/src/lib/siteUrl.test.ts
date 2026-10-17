import { afterEach, describe, expect, it, vi } from 'vitest';

async function load() {
  vi.resetModules();
  return (await import('./siteUrl')).SITE_URL;
}

describe('SITE_URL (endereço usado em sitemap, og:image, robots e JSON-LD)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('em produção sem a variável cai no endereço real, nunca em localhost', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(await load()).toBe('https://www.petmol.com.br');
  });

  it('a variável, quando definida, manda', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', ' https://exemplo.com.br ');
    expect(await load()).toBe('https://exemplo.com.br');
  });

  it('em desenvolvimento continua localhost', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(await load()).toBe('http://localhost:3000');
  });
});

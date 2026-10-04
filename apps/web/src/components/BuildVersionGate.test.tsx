/**
 * Reduzido de 60s pra 20s em 04/10/2026 — alguém testando um deploy recém
 * saído não devia esperar quase um minuto pra ver a versão nova sozinho.
 * Este teste trava o novo intervalo e o comportamento básico de recarregar
 * quando a versão embutida no bundle diverge de /version.json.
 */
import { render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadGateWithBakedVersion(sha: string) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_APP_VERSION', sha);
  const mod = await import('./BuildVersionGate');
  return mod.BuildVersionGate;
}

describe('BuildVersionGate', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    reloadSpy = vi.fn();
    // @ts-expect-error -- substituição deliberada só para o teste (jsdom não navega de verdade)
    delete window.location;
    // @ts-expect-error -- mock mínimo, só o campo usado pelo gate
    window.location = { reload: reloadSpy };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('mesma versão embutida e publicada: nunca recarrega', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ v: 'abc123-1' }) }));
    const BuildVersionGate = await loadGateWithBakedVersion('abc123');
    render(<BuildVersionGate />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('versão publicada divergente: recarrega', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ v: 'novo-sha-2' }) }));
    const BuildVersionGate = await loadGateWithBakedVersion('sha-velho');
    render(<BuildVersionGate />);
    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
  });

  it('checa de novo a cada 20s (não mais 60s)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ v: 'abc123-1' }) });
    vi.stubGlobal('fetch', fetchMock);
    const BuildVersionGate = await loadGateWithBakedVersion('abc123');
    render(<BuildVersionGate />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

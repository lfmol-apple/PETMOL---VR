/**
 * Bug real (Android, set/2026): tocar em "Perfil" no Header não abria a
 * tela — o app voltava pra Home ou Loja, dependendo de onde o tutor estava
 * antes. Causa: em erro de chunk (version skew logo após um deploy), o
 * guard recarregava `window.location.href`, que ainda era a página de
 * ORIGEM (o Next só troca a URL depois que o fetch do destino termina).
 * Este arquivo testa a correção: capturar o link realmente clicado e
 * recarregar para ELE, não para onde o tutor já estava.
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChunkReloadGuard, __resetLinkIntentForTests } from './ChunkReloadGuard';

function clickAnchor(href: string, opts: Partial<{ target: string; download: string }> = {}) {
  const a = document.createElement('a');
  a.href = href;
  if (opts.target) a.target = opts.target;
  if (opts.download !== undefined) a.setAttribute('download', opts.download);
  const span = document.createElement('span');
  a.appendChild(span);
  document.body.appendChild(a);
  span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  document.body.removeChild(a);
}

describe('ChunkReloadGuard — recarrega pro destino clicado, não pra origem', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    __resetLinkIntentForTests();
    reloadSpy = vi.fn();
    // @ts-expect-error -- substituição deliberada só para o teste (jsdom não navega de verdade)
    delete window.location;
    // @ts-expect-error -- mock mínimo, só os campos usados pelo guard
    window.location = { href: '/loja', reload: reloadSpy };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ v: 'abc123-1' }) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clicou em /profile, chunk falha durante a navegação → recarrega pra /profile', async () => {
    render(<ChunkReloadGuard />);
    clickAnchor('/profile');

    window.dispatchEvent(Object.assign(new Event('error'), { message: 'Loading chunk 42 failed' }));
    await vi.waitFor(() => {
      expect(window.location.href).toBe('/profile');
    });
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('sem clique recente (erro de chunk não ligado a navegação) → mantém o reload da página atual', async () => {
    render(<ChunkReloadGuard />);

    window.dispatchEvent(Object.assign(new Event('error'), { message: 'Loading chunk 7 failed' }));
    await vi.waitFor(() => {
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
    expect(window.location.href).toBe('/loja');
  });

  it('clique em link externo (target=_blank) não vira destino do reload', async () => {
    render(<ChunkReloadGuard />);
    clickAnchor('/profile', { target: '_blank' });

    window.dispatchEvent(Object.assign(new Event('error'), { message: 'Loading chunk 9 failed' }));
    await vi.waitFor(() => {
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
    expect(window.location.href).toBe('/loja');
  });
});

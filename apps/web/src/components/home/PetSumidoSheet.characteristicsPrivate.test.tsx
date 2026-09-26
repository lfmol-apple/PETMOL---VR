/**
 * "Características únicas (opcional) — só você sabe": o texto NUNCA pode ir
 * pro cartaz compartilhado (reproduzido 26/09/2026 — ia desenhado em
 * maiúsculas no card). O tutor pode guardar ali um detalhe pra conferir quem
 * diz ter achado o pet. Continua sendo salvo no alerta (dono + IA de fotos).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/pwaPlatform', () => ({ isNativeApp: () => false }));
vi.mock('@/lib/osm', () => ({ reverseGeocode: vi.fn(), formatReverseGeocodeResult: vi.fn() }));

import { PetSumidoSheet } from './PetSumidoSheet';

const SECRET = 'cicatriz em forma de L na barriga';

let fetchMock: ReturnType<typeof vi.fn>;
let drawn: string[];

beforeEach(() => {
  drawn = [];
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response);
  vi.stubGlobal('fetch', fetchMock);

  // jsdom não tem canvas: um contexto falso que só anota o texto desenhado.
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'fillText') return (text: string) => { drawn.push(String(text)); };
      if (prop === 'measureText') return (text: string) => ({ width: String(text).length * 10 });
      if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
      return () => {};
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA==');
  // Foto do perfil "não carrega" → cai no fundo de gradiente, sem travar.
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin = '';
    set src(_v: string) { setTimeout(() => this.onerror?.(), 0); }
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function openSheet() {
  render(
    <PetSumidoSheet
      pet={{ pet_id: 'p1', pet_name: 'Baby', species: 'dog' } as never}
      petPhotoUrl="https://cdn.exemplo/baby.jpg"
      editAlertId="a1" initialContact="(31) 97152-7644" initialLocation="Rua das Flores, 10"
      onClose={vi.fn()}
    />,
  );
}

const patchBody = () => {
  const call = fetchMock.mock.calls.find(([u, i]) => String(u).includes('/api/missing-pets/a1') && (i as RequestInit)?.method === 'PATCH');
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : null;
};

describe('Pet Sumido — características únicas ficam privadas', () => {
  it('o cartaz compartilhado não desenha as características, mas o alerta as salva', async () => {
    openSheet();
    const textarea = screen.getByPlaceholderText(/Descreva o que faz Baby único/);
    fireEvent.change(textarea, { target: { value: SECRET } });

    fireEvent.click(screen.getByText(/Salvar e reenviar alerta/));
    await waitFor(() => expect(patchBody()).not.toBeNull());

    expect(drawn.some((t) => t.includes('BABY'))).toBe(true);           // o cartaz foi desenhado
    const all = drawn.join(' | ').toLowerCase();
    expect(all).not.toContain('cicatriz');
    expect(all).not.toContain('barriga');
    expect(patchBody().characteristics).toBe(SECRET);                    // dono + IA continuam tendo
  });

  it('o formulário explica que o texto não aparece no cartaz nem para outras pessoas', () => {
    openSheet();
    expect(screen.getByText(/só você sabe/)).toBeTruthy();
    expect(screen.getByText(/Não aparece no cartaz nem para outras pessoas/)).toBeTruthy();
  });
});

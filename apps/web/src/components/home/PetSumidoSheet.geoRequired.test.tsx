/**
 * Achado 08/10/2026: um alerta real (Théo, Pitanga/PR) notificou 14 usuários
 * sem localização nenhuma — o backend tinha um bypass que, sem coordenada,
 * notificava gente de qualquer lugar do Brasil em vez de respeitar o raio.
 * Decisão de produto: a localização passa a ser OBRIGATÓRIA para CRIAR um
 * alerta (não para editar um já existente — o PATCH não reenvia lat/lng).
 * Estes testes cobrem o lado do formulário: sem GPS, não cria.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/pwaPlatform', () => ({ isNativeApp: () => false }));
vi.mock('@/lib/osm', () => ({ reverseGeocode: vi.fn(), formatReverseGeocodeResult: vi.fn() }));

import { PetSumidoSheet } from './PetSumidoSheet';

let fetchMock: ReturnType<typeof vi.fn>;

function fakeCanvasContext() {
  const store: Record<string, unknown> = {};
  return new Proxy(store, {
    get(target, prop: string) {
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = '';
  naturalWidth = 100;
  naturalHeight = 100;
  set src(_v: string) {
    // jsdom não carrega imagem real — simula falha, que o componente já
    // trata (desenha um placeholder) sem travar o fluxo.
    queueMicrotask(() => this.onerror?.());
  }
}

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: 'mp1', status: 'created' }) }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('Image', FakeImage as unknown as typeof Image);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCanvasContext());
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,aa==');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function openCreateSheet() {
  render(
    <PetSumidoSheet
      pet={{ pet_id: 'p1', pet_name: 'Baby', species: 'dog' } as never}
      petPhotoUrl="https://cdn.exemplo/baby.jpg"
      initialContact="(31) 97152-7644"
      initialLocation="Rua das Flores, 10"
      onClose={vi.fn()}
    />,
  );
  return document.body; // a folha renderiza num portal
}

const cta = () => screen.getByText(/Gerar alerta e card/);
const createCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/api/missing-pets'));

describe('Pet Sumido — localização obrigatória para criar o alerta', () => {
  it('sem suporte a geolocalização: avisa e NÃO cria o alerta', async () => {
    vi.stubGlobal('navigator', {} as unknown as Navigator);
    openCreateSheet();

    fireEvent.click(cta());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Precisamos da sua localização/);
    expect(createCalls().length).toBe(0);
  });

  it('usuário nega a permissão de localização: avisa e NÃO cria o alerta', async () => {
    const getCurrentPosition = vi.fn((_ok, err) => err?.({ code: 1, message: 'denied' }));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } } as unknown as Navigator);
    openCreateSheet();

    fireEvent.click(cta());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Permita o acesso à localização/);
    expect(createCalls().length).toBe(0);
  });

  it('com localização concedida: cria o alerta com o lat/lng reais', async () => {
    const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: -19.92, longitude: -43.94 } }));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } } as unknown as Navigator);
    openCreateSheet();

    fireEvent.click(cta());

    await waitFor(() => expect(createCalls().length).toBe(1));
    const [, init] = createCalls()[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.lat).toBe(-19.92);
    expect(body.lng).toBe(-43.94);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

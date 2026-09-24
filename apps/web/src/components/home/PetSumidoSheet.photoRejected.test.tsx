import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/pwaPlatform', () => ({ isNativeApp: () => false }));
vi.mock('@/lib/osm', () => ({ reverseGeocode: vi.fn(), formatReverseGeocodeResult: vi.fn() }));

import { PetSumidoSheet } from './PetSumidoSheet';

let uploadStatus: number;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  uploadStatus = 422;
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).endsWith('/upload-photo')) {
      return {
        ok: uploadStatus < 300, status: uploadStatus,
        json: async () => (uploadStatus === 422 ? { detail: 'Não foi possível aprovar esta imagem.' } : { status: 'pending', message: 'Precisa de verificação.' }),
      } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function openSheet(props: Record<string, unknown> = {}) {
  render(
    <PetSumidoSheet
      pet={{ pet_id: 'p1', pet_name: 'Baby', species: 'dog' } as never}
      editAlertId="a1" initialContact="(31) 97152-7644" initialLocation="Rua das Flores, 10"
      onClose={vi.fn()} {...props}
    />,
  );
  return document.body;      // a folha renderiza num portal
}

async function pickPhoto(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(container.querySelector('img[src^="data:"]')).toBeTruthy());
}

const cta = () => screen.getByText(/Salvar e reenviar alerta/);

describe('Pet Sumido — foto que não é de um pet', () => {
  it('avisa em vermelho NA tela do formulário, com o nome, e não gera cartaz nem alerta', async () => {
    const container = openSheet();
    await pickPhoto(container);
    fireEvent.click(cta());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Não conseguimos identificar Baby nessa foto/);
    expect(alert.textContent).toMatch(/fotografar Baby agora/);
    expect(alert.className).toMatch(/rose/);                              // vermelho
    expect(alert.closest('.overflow-y-auto')).toBeNull();                 // rodapé fixo: visível sem rolar
    // ficou no formulário: nada de cartaz, nem PATCH do alerta
    expect(screen.getByText(/Falta: foto/)).toBeTruthy();                 // a foto recusada foi descartada
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).includes('/api/missing-pets/a1') && (i as RequestInit)?.method === 'PATCH')).toBe(false);
    expect(container.querySelector('img[src^="data:"]')).toBeNull();
  });

  it('com foto de perfil, volta pra ela e avisa que foi mantida', async () => {
    const container = openSheet({ petPhotoUrl: 'https://cdn.exemplo/baby.jpg' });
    await pickPhoto(container);
    fireEvent.click(cta());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/mantivemos a foto do perfil de Baby/);
    expect(container.querySelector('img[src="https://cdn.exemplo/baby.jpg"]')).toBeTruthy();
    expect(container.querySelector('img[src^="data:"]')).toBeNull();
  });

  it('escolher outra foto limpa o aviso', async () => {
    const container = openSheet();
    await pickPhoto(container);
    fireEvent.click(cta());
    await screen.findByRole('alert');
    await pickPhoto(container);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('revisão adicional (pending) não bloqueia o alerta e não mostra o aviso vermelho', async () => {
    uploadStatus = 200;
    const container = openSheet();
    await pickPhoto(container);
    fireEvent.click(cta());
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/upload-photo'))).toBe(true));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

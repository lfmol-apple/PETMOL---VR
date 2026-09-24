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
        json: async () => (uploadStatus === 422 ? { detail: 'Não foi possível aprovar esta imagem.' } : uploadStatus === 413 ? { detail: 'Imagem muito grande.' } : { status: 'pending', message: 'Precisa de verificação.' }),
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

const uploadCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/upload-photo')).length;

describe('Pet Sumido — foto que não é de um pet', () => {
  it('avisa em vermelho NA HORA em que a foto é escolhida, com o nome — sem precisar tocar em nada', async () => {
    const container = openSheet();
    await pickPhoto(container);          // só escolher a foto (nenhum toque em "Gerar alerta")

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Não conseguimos identificar Baby nessa foto/);
    expect(alert.textContent).toMatch(/fotografar Baby agora/);
    expect(alert.className).toMatch(/rose/);                              // vermelho
    expect(alert.closest('.overflow-y-auto')).toBeNull();                 // rodapé fixo: visível sem rolar
    expect(screen.getByText(/Falta: foto/)).toBeTruthy();                 // a foto recusada foi descartada
    expect(container.querySelector('img[src^="data:"]')).toBeNull();
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).includes('/api/missing-pets/a1') && (i as RequestInit)?.method === 'PATCH')).toBe(false);
  });

  it('com foto de perfil, volta pra ela e avisa que foi mantida', async () => {
    const container = openSheet({ petPhotoUrl: 'https://cdn.exemplo/baby.jpg' });
    await pickPhoto(container);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/mantivemos a foto do perfil de Baby/);
    expect(container.querySelector('img[src="https://cdn.exemplo/baby.jpg"]')).toBeTruthy();
    expect(container.querySelector('img[src^="data:"]')).toBeNull();
  });

  it('escolher outra foto limpa o aviso e verifica a nova', async () => {
    const container = openSheet();
    await pickPhoto(container);
    await screen.findByRole('alert');
    uploadStatus = 200;                                                   // a próxima foto passa
    await pickPhoto(container);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(uploadCalls()).toBe(2);
  });

  it('enquanto verifica, o botão mostra "Verificando a foto…" e fica desabilitado', async () => {
    let release: (v: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => { release = res; }));
    const container = openSheet();
    await pickPhoto(container);
    const btn = (await screen.findByText(/Verificando a foto/)).closest('button')!;
    expect(btn.disabled).toBe(true);
    release({ ok: false, status: 422, json: async () => ({}) } as Response);
    await screen.findByRole('alert');
  });

  it('revisão adicional (pending) não bloqueia o alerta nem mostra o aviso vermelho', async () => {
    uploadStatus = 200;
    const container = openSheet();
    await pickPhoto(container);
    await waitFor(() => expect(uploadCalls()).toBe(1));
    expect(screen.queryByRole('alert')).toBeNull();
    expect((cta().closest('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('falha de rede na verificação não trava: a verificação é refeita ao gerar o alerta', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const container = openSheet();
    await pickPhoto(container);
    await waitFor(() => expect((cta().closest('button') as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(cta());                                               // 2ª tentativa acontece aqui
    await screen.findByRole('alert');                                     // e a recusa (422) aparece
    expect(uploadCalls()).toBe(2);
  });

  it('foto pesada demais (413) também avisa em vermelho e é descartada', async () => {
    uploadStatus = 413;
    const container = openSheet();
    await pickPhoto(container);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/pesada demais para enviar \(máximo 8 MB\)/);
    expect(container.querySelector('img[src^="data:"]')).toBeNull();
  });

  it('foto já verificada ao escolher não é enviada de novo ao gerar o alerta', async () => {
    uploadStatus = 200;
    const container = openSheet();
    await pickPhoto(container);
    await waitFor(() => expect(uploadCalls()).toBe(1));
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);   // jsdom não desenha; basta saber que gerou
    fireEvent.click(cta());
    await waitFor(() => expect(getContext).toHaveBeenCalled());          // passou da etapa da foto e foi desenhar o cartaz
    expect(uploadCalls()).toBe(1);                                        // sem reenviar a foto
    getContext.mockRestore();
  });
});

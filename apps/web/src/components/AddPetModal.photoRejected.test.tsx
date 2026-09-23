import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/v1Metrics', () => ({ trackV1Metric: vi.fn() }));
vi.mock('@/hooks/useKeyboardSheetViewport', () => ({ useKeyboardSheetViewport: () => undefined }));
// o seletor real usa câmera/galeria: aqui só entrega uma foto quando tocado
vi.mock('./PetPhotoPicker', () => ({
  PetPhotoPicker: ({ onConfirm }: { onConfirm: (d: string) => void }) => (
    <button type="button" onClick={() => onConfirm('data:image/jpeg;base64,AAAA')}>escolher-foto</button>
  ),
}));

import { AddPetModal } from './AddPetModal';

let photoStatuses: number[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  photoStatuses = [];
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).startsWith('data:')) return { blob: async () => new Blob(['x'], { type: 'image/jpeg' }) } as Response;
    if (/\/pets\/pet-1\/photo$/.test(String(url))) {
      const status = photoStatuses.shift() ?? 200;
      return { ok: status < 300, status, json: async () => (status === 422 ? { detail: 'Não foi possível aprovar esta imagem.' } : { status: 'approved' }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ id: 'pet-1' }) } as Response;   // POST /pets
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function fillAndSubmit() {
  const onClose = vi.fn();
  const onComplete = vi.fn();
  render(<AddPetModal onClose={onClose} onComplete={onComplete} />);
  fireEvent.click(screen.getByText('Ex: Mel'));                     // abre o campo de nome
  fireEvent.change(screen.getByPlaceholderText('Ex: Mel'), { target: { value: 'Baby' } });
  fireEvent.click(screen.getByText('Pronto'));
  fireEvent.click(screen.getByText('Outro'));                      // sem raça obrigatória
  fireEvent.click(screen.getAllByLabelText('Adicionar foto do pet')[0]);
  fireEvent.click(screen.getByText('escolher-foto'));
  fireEvent.click(screen.getByText('Adicionar pet'));
  return { onClose, onComplete };
}

describe('AddPetModal — foto que não é de um pet', () => {
  it('avisa com gentileza, cita o nome e oferece fotografar de novo na hora', async () => {
    photoStatuses = [422];
    const { onComplete, onClose } = await fillAndSubmit();

    const notice = await screen.findByText(/Não conseguimos identificar Baby nessa foto/);
    expect(notice.textContent).toMatch(/Esse espaço é reservado para a foto do seu pet/);
    expect(notice.textContent).toMatch(/fotografar Baby agora/);
    expect(screen.getByText(/Baby foi salvo/)).toBeTruthy();       // o cadastro não se perde
    expect(screen.getByText('Fotografar Baby')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('nova foto aprovada reenvia pro MESMO pet e fecha', async () => {
    photoStatuses = [422, 200];
    const { onClose, onComplete } = await fillAndSubmit();
    await screen.findByText('Fotografar Baby');

    fireEvent.click(screen.getByText('Fotografar Baby'));
    fireEvent.click(screen.getByText('escolher-foto'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    const petPosts = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/pets'));
    expect(petPosts).toHaveLength(1);                               // não recria o pet
    const photoPosts = fetchMock.mock.calls.filter(([u]) => /\/pets\/pet-1\/photo$/.test(String(u)));
    expect(photoPosts).toHaveLength(2);
    expect(onComplete).toHaveBeenCalledTimes(2);                    // atualiza a lista de novo
  });

  it('nova foto recusada mostra o pedido de novo, sem fechar', async () => {
    photoStatuses = [422, 422];
    const { onClose } = await fillAndSubmit();
    await screen.findByText('Fotografar Baby');
    fireEvent.click(screen.getByText('Fotografar Baby'));
    fireEvent.click(screen.getByText('escolher-foto'));
    await waitFor(() => expect(screen.getByText(/Não conseguimos identificar Baby nessa foto/)).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('"Agora não" fecha e o pet continua salvo', async () => {
    photoStatuses = [422];
    const { onClose } = await fillAndSubmit();
    await screen.findByText('Fotografar Baby');
    fireEvent.click(screen.getByText('Agora não'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('foto aprovada de primeira segue o caminho de sempre (fecha, sem aviso)', async () => {
    photoStatuses = [200];
    const { onClose } = await fillAndSubmit();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Não conseguimos identificar/)).toBeNull();
  });
});

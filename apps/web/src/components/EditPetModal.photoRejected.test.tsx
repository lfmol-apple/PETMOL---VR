import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/v1Metrics', () => ({ trackV1Metric: vi.fn(), isPetProfileCompleted: () => false }));
vi.mock('@/hooks/useKeyboardSheetViewport', () => ({ useKeyboardSheetViewport: () => undefined }));
vi.mock('./PetPhotoPicker', () => ({
  PetPhotoPicker: ({ onConfirm }: { onConfirm: (d: string) => void }) => (
    <button type="button" onClick={() => onConfirm('data:image/jpeg;base64,AAAA')}>escolher-foto</button>
  ),
}));

import { EditPetModal } from './EditPetModal';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).startsWith('data:')) return { blob: async () => new Blob(['x'], { type: 'image/jpeg' }) } as Response;
    return { ok: false, status: 422, json: async () => ({ detail: 'Não foi possível aprovar esta imagem.' }) } as Response;
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('EditPetModal — foto que não é de um pet', () => {
  it('mostra o pedido gentil com o nome, FORA da área que rola (sem precisar rolar pra ver)', async () => {
    const onSave = vi.fn();
    const pet = { pet_id: 'p1', pet_name: 'Baby', species: 'dog', breed: 'SRD' } as never;
    render(<EditPetModal pet={pet} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getAllByRole('button').find((b) => b.className.includes('rounded-full') && b.className.includes('border-dashed'))!);
    fireEvent.click(screen.getByText('escolher-foto'));
    fireEvent.click(screen.getByText('Salvar'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Não conseguimos identificar Baby nessa foto/);
    expect(alert.textContent).toMatch(/fotografar Baby agora/);
    expect(alert.closest('.overflow-y-auto')).toBeNull();          // rodapé fixo, não o corpo rolável
    expect(onSave).not.toHaveBeenCalled();
    await waitFor(() => expect((screen.getByText('Salvar') as HTMLElement).closest('button')!.disabled).toBe(false));
  });
});

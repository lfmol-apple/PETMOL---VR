import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@zxing/browser', () => ({ BrowserMultiFormatReader: class { decodeFromVideoElement() { return Promise.resolve({ stop() {} }); } } }));
vi.mock('@/lib/backStack', () => ({ useBackHandler: () => {} }));

import { StoreBarcodeScanner } from './StoreBarcodeScanner';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('StoreBarcodeScanner', () => {
  it('sem permissão de câmera: explica e oferece voltar para a busca por nome (sem digitação de código)', async () => {
    const denied = Object.assign(new Error('x'), { name: 'NotAllowedError' });
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(denied) } });
    const onClose = vi.fn();
    render(<StoreBarcodeScanner onDetected={vi.fn()} onClose={onClose} />);
    expect(await screen.findByText('O PETMOL precisa da câmera')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/código/i)).toBeNull();
    fireEvent.click(screen.getByText('Buscar pelo nome'));
    expect(onClose).toHaveBeenCalled();
  });

  it('aparelho sem câmera/API: mostra que a leitura não está disponível', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });
    render(<StoreBarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Não foi possível abrir a câmera')).toBeTruthy());
  });

  it('o botão de fechar chama onClose', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });
    const onClose = vi.fn();
    render(<StoreBarcodeScanner onDetected={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Fechar leitor'));
    expect(onClose).toHaveBeenCalled();
  });
});

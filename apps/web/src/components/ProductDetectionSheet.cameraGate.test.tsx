import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/backStack', () => ({ useBackHandler: () => undefined }));
vi.mock('@/hooks/useKeyboardSheet', () => ({ useKeyboardSheet: () => ({ current: null }) }));
vi.mock('@/lib/analytics/storage', () => ({ trackEvent: vi.fn(async () => undefined) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ tutor: null }) }));
vi.mock('@zxing/browser', () => ({ BrowserMultiFormatReader: class {}, BrowserCodeReader: class { static releaseAllStreams() {} } }));
vi.mock('@zxing/library', async (orig) => ({ ...(await orig<object>()) }));

import { ProductDetectionSheetGold } from './ProductDetectionSheet';

function setPermission(state: string | null) {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: state ? { query: vi.fn(async () => ({ state })) } : undefined,
  });
}

afterEach(() => { cleanup(); window.localStorage.clear(); });

const props = { petId: 'p1', petName: 'Baby', defaultMode: 'scan' as const, allowScanning: true, onProductConfirmed: vi.fn(), onClose: vi.fn() };

describe('ProductDetectionSheet — portão da câmera', () => {
  it('permissão negada: mostra "A câmera está bloqueada" com galeria, digitar e passo a passo', async () => {
    setPermission('denied');
    render(<ProductDetectionSheetGold {...props} />);
    expect(await screen.findByText('A câmera está bloqueada')).toBeTruthy();
    expect(screen.getByText('Escolher foto da galeria')).toBeTruthy();
    expect(screen.getByText('Digitar o nome do produto')).toBeTruthy();
    expect(screen.getByText('Já liberei — tentar de novo')).toBeTruthy();
  });

  it('permissão desconhecida: pede com a tela nossa antes do pedido do sistema', async () => {
    setPermission('prompt');
    render(<ProductDetectionSheetGold {...props} />);
    expect(await screen.findByText('Vamos ler o código de barras')).toBeTruthy();
    expect(screen.getByText('Permitir câmera e escanear')).toBeTruthy();
    expect(screen.getByText('Prefiro digitar o nome ou usar uma foto')).toBeTruthy();
  });

  it('sem Permissions API (iOS) e flag "denied" salva: vai direto ao bloqueado', async () => {
    setPermission(null);
    window.localStorage.setItem('petmol_camera_state_v1', 'denied');
    render(<ProductDetectionSheetGold {...props} />);
    await waitFor(() => expect(screen.getByText('A câmera está bloqueada')).toBeTruthy());
  });
});

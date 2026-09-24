import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// A folha do scanner (que carrega a biblioteca ZXing) só deve ser baixada ao tocar em "Escanear".
const sheetModuleLoaded = vi.fn();
vi.mock('@/components/ProductDetectionSheet', () => {
  sheetModuleLoaded();
  return { ProductDetectionSheetGold: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>folha-do-scanner</button> };
});

import { ProductBarcodeScanner } from './ProductBarcodeScanner';

afterEach(cleanup);

describe('ProductBarcodeScanner — folha carregada sob demanda', () => {
  it('não carrega a folha até tocar em Escanear; ao tocar, ela aparece', async () => {
    render(<ProductBarcodeScanner petId="p1" onProductConfirmed={vi.fn()} />);
    expect(sheetModuleLoaded).not.toHaveBeenCalled();
    expect(screen.queryByText('folha-do-scanner')).toBeNull();

    fireEvent.click(screen.getAllByText(/Escanear produto/)[0]);
    expect(await screen.findByText('folha-do-scanner')).toBeTruthy();
    expect(sheetModuleLoaded).toHaveBeenCalledTimes(1);
  });
});

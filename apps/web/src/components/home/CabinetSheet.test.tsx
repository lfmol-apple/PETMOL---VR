import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchCabinet: vi.fn(), getCachedCabinet: vi.fn().mockReturnValue(null), addCabinetItem: vi.fn(), updateCabinetItem: vi.fn(), deleteCabinetItem: vi.fn(),
}));
vi.mock('@/lib/cabinetApi', () => api);
const search = vi.hoisted(() => ({ searchAwinCatalog: vi.fn() }));
vi.mock('@/features/commerce/productPricing', () => search);
vi.mock('@/features/commerce/AffiliateCatalogSearch', () => ({
  AffiliateCatalogSearch: ({ initialQuery }: { initialQuery: string }) => <div data-testid="loja">{initialQuery}</div>,
}));
vi.mock('@/features/commerce/StoreBarcodeScanner', () => ({ StoreBarcodeScanner: () => null }));
vi.mock('@/lib/productScanner', () => ({ identifyProductByBarcode: vi.fn() }));
vi.mock('@/features/interactions/userPromptChannel', () => ({ showAppToast: vi.fn() }));

import { CabinetSheet } from './CabinetSheet';

const item = (o: Record<string, unknown>) => ({ id: 'i1', pet_id: 'p1', name: 'Gel dental', category: 'higiene', ...o });
const props = { open: true, onClose: () => {}, petId: 'p1', petName: 'Mel', species: 'dog' };

describe('CabinetSheet', () => {
  afterEach(() => cleanup());
  beforeEach(() => { vi.clearAllMocks(); api.getCachedCabinet.mockReturnValue(null); search.searchAwinCatalog.mockResolvedValue([]); });

  it('lista vazia convida a guardar o primeiro produto', async () => {
    api.fetchCabinet.mockResolvedValue([]);
    render(<CabinetSheet {...props} />);
    expect(await screen.findByText(/Guarde aqui o que Mel usa/)).toBeTruthy();
  });

  it('guarda um produto digitado (nome livre) com prazo', async () => {
    api.fetchCabinet.mockResolvedValue([]);
    api.addCabinetItem.mockResolvedValue({ ok: true, data: item({ name: 'Hidratante de patinhas' }) });
    render(<CabinetSheet {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar um produto' }));
    fireEvent.change(screen.getByLabelText('Nome do produto'), { target: { value: 'Hidratante de patinhas' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar “Hidratante de patinhas”/ }));
    fireEvent.click(screen.getByRole('radio', { name: '1 mês' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.addCabinetItem).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'Hidratante de patinhas', duration_days: 30 })));
    expect(await screen.findByText('Hidratante de patinhas')).toBeTruthy();
  });

  it('item acabando sobe para "Acabando" e "Comprar novamente" abre a busca da Loja', async () => {
    api.fetchCabinet.mockResolvedValue([
      item({ id: 'a', name: 'Shampoo', days_left: 40, duration_days: 60 }),
      item({ id: 'b', name: 'Gel dental', days_left: 3, duration_days: 30 }),
    ]);
    render(<CabinetSheet {...props} />);
    expect(await screen.findByText('Acabando')).toBeTruthy();
    expect(screen.getByText('Acaba em 3 dias')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Comprar novamente' })[0]);
    expect((await screen.findByTestId('loja')).textContent).toBe('Gel dental');
  });

  it('abre na hora com a lista em cache, sem "Carregando…"', async () => {
    api.getCachedCabinet.mockReturnValue([item({ name: 'Shampoo' })]);
    api.fetchCabinet.mockReturnValue(new Promise(() => {}));
    render(<CabinetSheet {...props} />);
    expect(screen.getByText('Shampoo')).toBeTruthy();
    expect(screen.queryByText('Carregando…')).toBeNull();
  });

  it('produto sem foto ganha a foto do catálogo (mesmo GTIN) e é guardada', async () => {
    api.fetchCabinet.mockResolvedValue([item({ name: 'Gel dental', gtin: '7891234567895', image_url: null })]);
    search.searchAwinCatalog.mockResolvedValue([{ gtin: '7891234567895', title: 'Gel dental Pet', image_url: 'https://x/img.png' }]);
    api.updateCabinetItem.mockResolvedValue({ ok: true, data: item({ name: 'Gel dental', image_url: 'https://x/img.png' }) });
    render(<CabinetSheet {...props} />);
    await waitFor(() => expect(api.updateCabinetItem).toHaveBeenCalledWith('p1', 'i1', { image_url: 'https://x/img.png' }));
  });

  it('"Troquei por uma nova" reinicia a contagem', async () => {
    api.fetchCabinet.mockResolvedValue([item({ days_left: -2, duration_days: 30 })]);
    api.updateCabinetItem.mockResolvedValue({ ok: true, data: item({ days_left: 30, duration_days: 30 }) });
    render(<CabinetSheet {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Troquei por uma nova' }));
    await waitFor(() => expect(api.updateCabinetItem).toHaveBeenCalledWith('p1', 'i1', { restarted_today: true }));
    expect(await screen.findByText('Acaba em 30 dias')).toBeTruthy();
  });

  it('gato: areia fixa em Essenciais; escolher o prazo cria o item com contagem', async () => {
    api.fetchCabinet.mockResolvedValue([]);
    api.addCabinetItem.mockResolvedValue({ ok: true, data: item({ id: 'areia', name: 'Areia higiênica', days_left: 30, duration_days: 30 }) });
    render(<CabinetSheet {...props} species="cat" staples={[{ key: 'litter', name: 'Areia higiênica', query: 'areia higiênica gatos' }]} />);
    expect(await screen.findByTestId('essencial-vazio')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '1 mês' }));
    await waitFor(() => expect(api.addCabinetItem).toHaveBeenCalledWith('p1', { name: 'Areia higiênica', duration_days: 30 }));
    expect(await screen.findByText('Acaba em 30 dias')).toBeTruthy();
    expect(screen.queryByTestId('essencial-vazio')).toBeNull();
  });

  it('tempo livre: o tutor digita quanto dura (ex.: 6 semanas = 42 dias)', async () => {
    api.fetchCabinet.mockResolvedValue([]);
    api.addCabinetItem.mockResolvedValue({ ok: true, data: item({ name: 'Shampoo', duration_days: 42, days_left: 42 }) });
    render(<CabinetSheet {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar um produto' }));
    fireEvent.change(screen.getByLabelText('Nome do produto'), { target: { value: 'Shampoo' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar “Shampoo”/ }));
    fireEvent.change(screen.getByLabelText('Tempo que dura'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'semanas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar' }));
    expect(await screen.findByText('Prazo atual: 42 dias')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.addCabinetItem).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'Shampoo', duration_days: 42 })));
  });

  it('recusa tempo fora de 1 dia a 2 anos', async () => {
    api.fetchCabinet.mockResolvedValue([]);
    render(<CabinetSheet {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar um produto' }));
    fireEvent.change(screen.getByLabelText('Nome do produto'), { target: { value: 'Shampoo' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar “Shampoo”/ }));
    fireEvent.change(screen.getByLabelText('Tempo que dura'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'meses' } });
    fireEvent.change(screen.getByLabelText('Tempo que dura'), { target: { value: '40' } });
    expect((screen.getByRole('button', { name: 'Usar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Use entre 1 dia e 2 anos.')).toBeTruthy();
  });

  it('comedouro: "Dura muito tempo" guarda sem aviso de acabando e sem botão de trocar', async () => {
    api.fetchCabinet.mockResolvedValue([]);
    api.addCabinetItem.mockResolvedValue({ ok: true, data: item({ name: 'Comedouro inox', duration_days: 36500, days_left: 36500 }) });
    render(<CabinetSheet {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar um produto' }));
    fireEvent.change(screen.getByLabelText('Nome do produto'), { target: { value: 'Comedouro inox' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar “Comedouro inox”/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Dura muito tempo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.addCabinetItem).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'Comedouro inox', duration_days: 36500 })));
    expect(await screen.findByText('Dura muito tempo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Troquei por uma nova' })).toBeNull();
    expect(screen.queryByText('Acabando')).toBeNull();
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FoodDurationAdjustSheet } from './FoodDurationAdjustSheet';

const fetchMock = vi.fn();

function setup(over: Partial<Parameters<typeof FoodDurationAdjustSheet>[0]> = {}) {
  const onAdjusted = vi.fn();
  const onClose = vi.fn();
  render(
    <FoodDurationAdjustSheet
      open petId="p1" petLabel="do Thor" elapsedDays={12} currentDurationDays={30}
      onClose={onClose} onAdjusted={onAdjusted} {...over}
    />,
  );
  return { onAdjusted, onClose };
}

beforeEach(() => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ previous_duration_days: 30, duration_days: 14 }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

describe('FoodDurationAdjustSheet', () => {
  it('"Quase acabando" envia remaining=almost e devolve a nova duração', async () => {
    const { onAdjusted } = setup();
    fireEvent.click(screen.getByText('Quase acabando'));
    await waitFor(() => expect(onAdjusted).toHaveBeenCalledWith({ previousDurationDays: 30, durationDays: 14 }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/health/pets/p1/feeding/plan/adjust');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ action: 'remaining', remaining: 'almost' });
  });

  it('permite digitar a duração em dias (set_duration)', async () => {
    const { onAdjusted } = setup();
    fireEvent.change(screen.getByLabelText('Duração em dias'), { target: { value: '21' } });
    fireEvent.click(screen.getByText('Salvar duração'));
    await waitFor(() => expect(onAdjusted).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'set_duration', duration_days: 21 });
  });

  it('recusa duração menor do que já passou', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Duração em dias'), { target: { value: '5' } });
    expect((screen.getByText('Salvar duração') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Use de 12 a 365 dias/)).toBeTruthy();
  });

  it('pacote recente: esconde "Quanto resta?" e deixa só a duração', () => {
    setup({ elapsedDays: 1 });
    expect(screen.queryByText('Quase acabando')).toBeNull();
    expect(screen.getByLabelText('Duração em dias')).toBeTruthy();
  });

  it('mostra erro quando o servidor recusa', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { onAdjusted } = setup();
    fireEvent.click(screen.getByText('Ainda bastante'));
    await screen.findByRole('alert');
    expect(onAdjusted).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { FoodDurationAdjustSheet } from './FoodDurationAdjustSheet';

const fetchMock = vi.fn();

function setup(over: Partial<Parameters<typeof FoodDurationAdjustSheet>[0]> = {}) {
  const onAdjusted = vi.fn();
  const onClose = vi.fn();
  render(
    <FoodDurationAdjustSheet
      open petId="p1" petLabel="do Thor" startDate="2026-10-11" elapsedDays={12} currentDurationDays={30}
      onClose={onClose} onAdjusted={onAdjusted} {...over}
    />,
  );
  return { onAdjusted, onClose };
}

beforeEach(() => {
  fetchMock.mockResolvedValue({ ok: true, json: async (): Promise<unknown> => ({ previous_duration_days: 30, duration_days: 21 }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); fetchMock.mockReset(); vi.unstubAllGlobals(); });

describe('FoodDurationAdjustSheet — o tutor escolhe a duração', () => {
  it('começa na duração atual e salva exatamente o número que o tutor digitou', async () => {
    const { onAdjusted } = setup();
    expect((screen.getByLabelText('Duração em dias') as HTMLInputElement).value).toBe('30');
    fireEvent.change(screen.getByLabelText('Duração em dias'), { target: { value: '21' } });
    fireEvent.click(screen.getByText('Salvar duração'));
    await waitFor(() => expect(onAdjusted).toHaveBeenCalledWith({ previousDurationDays: 30, durationDays: 21 }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/health/pets/p1/feeding/plan/adjust');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ action: 'set_duration', duration_days: 21 });
  });

  it('+ e − mudam um dia e a data de fim acompanha', () => {
    setup();
    fireEvent.click(screen.getByLabelText('Mais um dia'));
    expect((screen.getByLabelText('Duração em dias') as HTMLInputElement).value).toBe('31');
    expect(screen.getByText(/Vai acabar em/).textContent).toContain('11/11/2026'); // 11/10 + 31 dias
    fireEvent.click(screen.getByLabelText('Menos um dia'));
    fireEvent.click(screen.getByLabelText('Menos um dia'));
    expect((screen.getByLabelText('Duração em dias') as HTMLInputElement).value).toBe('29');
  });

  it('não deixa escolher menos do que já passou nem passar de 365', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Duração em dias'), { target: { value: '5' } });
    expect((screen.getByText('Salvar duração') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Use de 12 a 365 dias/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Duração em dias'), { target: { value: '400' } });
    expect((screen.getByText('Salvar duração') as HTMLButtonElement).disabled).toBe(true);
  });

  it('não oferece nenhuma estimativa pronta (sem "Quanto resta?")', () => {
    setup();
    expect(screen.queryByText(/Quanto resta/)).toBeNull();
    expect(screen.queryByText('Quase acabando')).toBeNull();
  });

  it('só habilita salvar quando o número muda', () => {
    setup();
    expect((screen.getByText('Salvar duração') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Duração em dias'), { target: { value: '28' } });
    expect((screen.getByText('Salvar duração') as HTMLButtonElement).disabled).toBe(false);
  });

  it('mostra erro quando o servidor recusa', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async (): Promise<unknown> => ({}) });
    const { onAdjusted } = setup();
    fireEvent.change(screen.getByLabelText('Duração em dias'), { target: { value: '28' } });
    fireEvent.click(screen.getByText('Salvar duração'));
    await screen.findByRole('alert');
    expect(onAdjusted).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchHeatCycles: vi.fn(),
  createHeatCycle: vi.fn(),
  updateHeatCycle: vi.fn(),
  deleteHeatCycle: vi.fn(),
}));
vi.mock('@/lib/heatApi', () => api);
vi.mock('@/features/interactions/userPromptChannel', () => ({ showAppToast: vi.fn() }));

import { HeatCycleButton } from './HeatCycle';

const cycle = (over: Record<string, unknown> = {}) => ({
  id: 'c1', pet_id: 'p1', started_on: '2026-01-10', ended_on: '2026-01-24', mated_on: null, notes: null, ...over,
});

describe('HeatCycleButton', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());

  it('sem registros: abre o sheet e registra "começou o cio hoje" com um toque', async () => {
    api.fetchHeatCycles.mockResolvedValue([]);
    api.createHeatCycle.mockResolvedValue({ ok: true, data: cycle({ id: 'novo', ended_on: null }) });
    render(<HeatCycleButton petId="p1" petName="Mel" species="dog" />);
    await waitFor(() => expect(api.fetchHeatCycles).toHaveBeenCalledWith('p1'));
    fireEvent.click(screen.getByRole('button', { name: 'Cio' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Começou o cio hoje' }));
    await waitFor(() => expect(api.createHeatCycle).toHaveBeenCalledTimes(1));
    expect(api.createHeatCycle.mock.calls[0][0]).toBe('p1');
    expect(api.createHeatCycle.mock.calls[0][1]).toHaveProperty('started_on');
  });

  it('cio em andamento: botão fica "em andamento" e o sheet oferece "O cio terminou hoje"', async () => {
    api.fetchHeatCycles.mockResolvedValue([cycle({ ended_on: null })]);
    api.updateHeatCycle.mockResolvedValue({ ok: true, data: cycle() });
    render(<HeatCycleButton petId="p1" petName="Mel" species="dog" />);
    const btn = await screen.findByRole('button', { name: 'Cio — em andamento' });
    fireEvent.click(btn);
    fireEvent.click(await screen.findByRole('button', { name: 'O cio terminou hoje' }));
    await waitFor(() => expect(api.updateHeatCycle).toHaveBeenCalledTimes(1));
    expect(api.updateHeatCycle.mock.calls[0][2]).toHaveProperty('ended_on');
  });

  it('gata: explica que só registra (sem previsão)', async () => {
    api.fetchHeatCycles.mockResolvedValue([]);
    render(<HeatCycleButton petId="p1" petName="Mia" species="cat" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cio' }));
    expect(await screen.findByText(/Gatas têm ciclos bem irregulares/)).toBeTruthy();
  });
});

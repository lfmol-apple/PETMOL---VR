import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchHeatCycles: vi.fn(),
  createHeatCycle: vi.fn(),
  updateHeatCycle: vi.fn(),
  deleteHeatCycle: vi.fn(),
  fetchHeatSettings: vi.fn(),
  saveHeatSettings: vi.fn(),
}));
vi.mock('@/lib/heatApi', () => api);
vi.mock('@/features/interactions/userPromptChannel', () => ({ showAppToast: vi.fn() }));

import { HeatCycleButton } from './HeatCycle';

const cycle = (over: Record<string, unknown> = {}) => ({
  id: 'c1', pet_id: 'p1', started_on: '2026-01-10', ended_on: '2026-01-24', mated_on: null, notes: null, ...over,
});

describe('HeatCycleButton', () => {
  beforeEach(() => { vi.clearAllMocks(); api.fetchHeatSettings.mockResolvedValue({ enabled: true, interval_days: 180, duration_days: 21 }); });
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

  it('desativado: 1º toque abre a configuração (5/6 meses e duração) e ativa', async () => {
    api.fetchHeatSettings.mockResolvedValue(null);
    api.fetchHeatCycles.mockResolvedValue([]);
    api.saveHeatSettings.mockResolvedValue({ ok: true, data: { enabled: true, interval_days: 150, duration_days: 7 } });
    render(<HeatCycleButton petId="p1" petName="Mel" species="dog" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cio' }));
    fireEvent.click(await screen.findByRole('button', { name: 'De 5 em 5 meses' }));
    fireEvent.click(screen.getByRole('button', { name: '1 semana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ativar acompanhamento' }));
    await waitFor(() => expect(api.saveHeatSettings).toHaveBeenCalledWith('p1', { enabled: true, interval_days: 150, duration_days: 7 }));
    expect(await screen.findByRole('button', { name: 'Começou o cio hoje' })).toBeTruthy();
  });

  it('padrão da cadela: 6 meses e 3 semanas', async () => {
    api.fetchHeatSettings.mockResolvedValue(null);
    api.fetchHeatCycles.mockResolvedValue([]);
    api.saveHeatSettings.mockResolvedValue({ ok: true, data: { enabled: true, interval_days: 180, duration_days: 21 } });
    render(<HeatCycleButton petId="p1" petName="Mel" species="dog" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cio' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar acompanhamento' }));
    await waitFor(() => expect(api.saveHeatSettings).toHaveBeenCalledWith('p1', { enabled: true, interval_days: 180, duration_days: 21 }));
  });

  it('gata: configuração própria (semanas), padrão 3 semanas e 1 semana', async () => {
    api.fetchHeatSettings.mockResolvedValue(null);
    api.fetchHeatCycles.mockResolvedValue([]);
    api.saveHeatSettings.mockResolvedValue({ ok: true, data: { enabled: true, interval_days: 21, duration_days: 7 } });
    render(<HeatCycleButton petId="p1" petName="Mia" species="cat" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cio' }));
    expect(await screen.findByText(/temporadas/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ativar acompanhamento' }));
    await waitFor(() => expect(api.saveHeatSettings).toHaveBeenCalledWith('p1', { enabled: true, interval_days: 21, duration_days: 7 }));
  });

  it('ativado: botão rosa; desativar volta ao texto simples', async () => {
    api.fetchHeatCycles.mockResolvedValue([]);
    api.saveHeatSettings.mockResolvedValue({ ok: true, data: { enabled: false, interval_days: 180, duration_days: 21 } });
    render(<HeatCycleButton petId="p1" petName="Mel" species="dog" />);
    const btn = await screen.findByRole('button', { name: 'Cio' });
    await waitFor(() => expect(btn.className).toContain('bg-rose-500'));
    fireEvent.click(btn);
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar acompanhamento' }));
    await waitFor(() => expect(btn.className).toContain('bg-transparent'));
  });
});

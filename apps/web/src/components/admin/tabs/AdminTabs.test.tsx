import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ adminApi: vi.fn() }));
vi.mock('@/components/admin/AdminUi', async (orig) => ({ ...(await orig<object>()), adminApi: api.adminApi }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => 't' }));

import { EmailsTab } from './EmailsTab';
import { PetsSumidosTab } from './PetsSumidosTab';
import { DesempenhoTab } from './DesempenhoTab';

const camp = (over: Record<string, unknown> = {}) => ({
  id: 'c1', name: 'Black Friday', subject: 'Oi {nome}', body: 'corpo', template: 'custom', created_at: null,
  sent: 0, control: 0, last_sent_at: null, state: null, ...over,
});

describe('abas do painel', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());

  it('E-mails: envio para todos exige digitar a quantidade e não tem limite semanal', async () => {
    api.adminApi.mockImplementation(async (path: string) => {
      if (path === '/email-campaigns') return { segments: { todos: 'Todos com e-mail' }, campaigns: [camp()] };
      if (path.endsWith('/preview')) return { will_send: 42, audience_total: 42, already_received: 0, sample: { subject: 'Oi Ana', text: '' } };
      return { started: true };
    });
    render(<EmailsTab />);
    await screen.findByText('Black Friday');
    fireEvent.click(screen.getByLabelText('Todos'));
    fireEvent.click(screen.getByRole('button', { name: 'Ver quantos recebem' }));
    const send = await screen.findByRole('button', { name: 'Enviar para 42' });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('Digite 42 para confirmar'), { target: { value: '42' } });
    expect((send as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(api.adminApi.mock.calls.some(([p, i]) => p === '/email-campaigns/c1/send' && JSON.parse(i.body).confirm_count === 42)).toBe(true));
  });

  it('E-mails: campanha antiga mostra o painel completo de sempre e pode ser removida da lista', async () => {
    api.adminApi.mockResolvedValue({ segments: {}, campaigns: [camp({ id: 'h1', name: 'Recado Importante', template: 'recado', sent: 120, control: 13 })] });
    render(<EmailsTab />);
    await screen.findByText('Remover campanha da lista');
    fireEvent.click(screen.getByRole('button', { name: 'Remover campanha da lista' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, remover' }));
    await waitFor(() => expect(api.adminApi).toHaveBeenCalledWith('/email-campaigns/h1', { method: 'DELETE' }));
  });

  it('Pets sumidos: mostra quem avisou e quantos foram notificados', async () => {
    api.adminApi.mockResolvedValue({ total: 3, active: 1, items: [{
      id: 'm1', pet_name: 'Mel', species: 'dog', breed: 'Golden', status: 'active', photo_url: null, created_at: '2026-11-08T12:00:00Z', found_at: null,
      last_seen_location: 'Rua A', radius_km: 2, reporter_type: 'tutor_app', public_slug: null, tutor_name: 'Ana', tutor_email: 'ana@x.com',
      notified: 17, found_reports: 1, sightings: 2,
    }] });
    render(<PetsSumidosTab />);
    await screen.findByText('Mel');
    expect(screen.getByText(/17 notificados/)).toBeTruthy();
    expect(screen.getByText(/ana@x.com/)).toBeTruthy();
  });

  it('Desempenho: mostra os 4 números, hoje × ontem', async () => {
    const totals = { downloads: 5, cadastros: 4, pets: 3, alimentacao: 2 };
    api.adminApi.mockResolvedValue({ totals, series: [{ date: '2026-11-08', ...totals }] });
    render(<DesempenhoTab />);
    await waitFor(() => expect(screen.getAllByText('Cadastrou a alimentação').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Downloads').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Se cadastrou').length).toBeGreaterThan(0);
  });
});

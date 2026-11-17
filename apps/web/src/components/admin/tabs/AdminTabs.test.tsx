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

  it('Desempenho: mostra os 5 números (inclui notificações ativas), hoje × ontem', async () => {
    const totals = { downloads: 5, cadastros: 4, pets: 3, alimentacao: 2, notificacoes: 1, localizacao: 1 };
    api.adminApi.mockResolvedValue({ totals, series: [{ date: '2026-11-08', ...totals }] });
    render(<DesempenhoTab />);
    await waitFor(() => expect(screen.getAllByText('Cadastrou a alimentação').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Downloads').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Se cadastrou').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Notificações ativas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Localização ativa').length).toBeGreaterThan(0);          // o 6º card
  });

  it('Desempenho: percentuais de pet, ração e notificações sobre "Se cadastrou"; downloads sem percentual', async () => {
    const totals = { downloads: 50, cadastros: 8, pets: 6, alimentacao: 2, notificacoes: 4, localizacao: 2 };
    api.adminApi.mockResolvedValue({ totals, series: [{ date: '2026-11-08', ...totals }] });
    render(<DesempenhoTab />);
    await waitFor(() => expect(screen.getAllByTestId('pct-periodo-pets').length).toBe(1));
    expect(screen.getByTestId('pct-periodo-pets').textContent).toContain('75%');
    expect(screen.getByTestId('pct-periodo-alimentacao').textContent).toContain('25%');
    expect(screen.getByTestId('pct-periodo-notificacoes').textContent).toContain('50%');
    expect(screen.getByTestId('pct-periodo-localizacao').textContent).toContain('25%');
    expect(screen.queryByTestId('pct-periodo-downloads')).toBeNull();
    expect(screen.queryByTestId('pct-periodo-cadastros')).toBeNull();
    expect(screen.getByTestId('pct-hoje-notificacoes').textContent).toContain('50%');
    expect(screen.getAllByText('base dos percentuais').length).toBe(2);   // hoje × ontem e período
  });
});

describe('Pets sumidos: quem encontrou', () => {
  afterEach(() => cleanup());
  it('mostra se o achado veio de outra pessoa ou só do tutor (possível teste) e rotula expirado', async () => {
    const base = { species: 'dog', breed: null, photo_url: null, created_at: null, found_at: null, last_seen_location: null, radius_km: null, reporter_type: null, public_slug: null, tutor_name: 'Ana', tutor_email: null, notified: 0, found_reports: 0, sightings: 0 };
    api.adminApi.mockResolvedValue({ total: 3, active: 0, items: [
      { ...base, id: '1', pet_name: 'Rex', status: 'found', found_by: 'terceiro', third_party_reports: 1 },
      { ...base, id: '2', pet_name: 'Mel', status: 'found', found_by: 'sem_relato', third_party_reports: 0 },
      { ...base, id: '3', pet_name: 'Bob', status: 'expired', found_by: null, third_party_reports: 0 },
    ] });
    render(<PetsSumidosTab />);
    await screen.findByText('Rex');
    const t = screen.getAllByTestId('quem-achou').map((e) => e.textContent);
    expect(t[0]).toMatch(/outra pessoa/); expect(t[1]).toMatch(/possível teste/);
    expect(screen.getAllByText('Expirado').length).toBe(1);
  });
});

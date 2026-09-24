import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

import { UsersSection } from './sections';

const SUMMARY = {
  total_users: 63,
  push: { active: 40, none: 23, ios: 22, android: 15, web: 4 },
  location: { gps: 30, gps_fresh: 18, city_only: 10, ip_only: 3, none: 20, fresh_days: 30 },
  combined: { both: 25, only_push: 15, only_location: 5, neither: 18 },
};
const base = {
  last_activity: '2026-09-24T10:00:00Z', activity_status: 'active', pets: 1, pet_thumbnails: [], has_feeding: false, active_control_pets: 0,
  last_platform: 'web', device_type: 'desktop', app_version_label: 'Web (build abc1234)', email_verified: true, push_last_seen_at: null,
};
const ITEMS = [
  { ...base, user_id: 'u1', name: 'Ana', email: 'ana@x.com', created_at: '2026-09-23T22:00:00Z', city: 'Belo Horizonte', state: 'MG',
    push_active: true, push_platforms: ['ios', 'web'], push_last_seen_at: '2026-09-24T10:00:00Z',
    location_source: 'gps', location_shared: true, location_updated_at: '2026-09-24T09:00:00Z', location_fresh: true },
  { ...base, user_id: 'u2', name: 'Bia', email: 'bia@x.com', created_at: '2026-09-22T12:00:00Z', city: null, state: null,
    push_active: false, push_platforms: [], location_source: 'city', location_shared: false, location_updated_at: null, location_fresh: false },
];
let calls: string[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url); calls.push(u);
    if (u.includes('/permissions/summary')) return { ok: true, json: async () => SUMMARY } as Response;
    if (u.includes('/permissions/history')) return { ok: true, json: async () => ({ items: [] }) } as Response;
    return { ok: true, json: async () => ({ total: 2, page: 1, page_size: 50, sort: 'created_at', direction: 'desc', items: ITEMS }) } as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const usersCalls = () => calls.filter((c) => c.includes('/users?') || c.endsWith('/users'));

describe('Tutores e Pets — permissões e filtros', () => {
  it('mostra o resumo de notificação e localização acima da tabela', async () => {
    render(<UsersSection filter={{} as never} />);
    expect(await screen.findByText('Notificação ativa')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('Compartilham localização')).toBeTruthy();
    expect(screen.getByText('Nenhum dos dois')).toBeTruthy();
    expect(screen.getByText(/18 nos últimos 30 dias/)).toBeTruthy();
  });

  it('cada tutor mostra o estado de notificação (com aparelhos) e de localização', async () => {
    render(<UsersSection filter={{} as never} />);
    const ana = within((await screen.findByText('ana@x.com')).closest('tr')!);
    expect(ana.getByText('Ativa')).toBeTruthy();
    expect(ana.getByText('iPhone')).toBeTruthy();
    expect(ana.getByText('Navegador')).toBeTruthy();
    expect(ana.getByText('Compartilha (GPS)')).toBeTruthy();
    expect(ana.getByText(/23\/09\/26 19:00/)).toBeTruthy();                 // horário de São Paulo
    const bia = within(screen.getByText('bia@x.com').closest('tr')!);
    expect(bia.getByText('Sem notificação')).toBeTruthy();
    expect(bia.getByText('Não compartilha')).toBeTruthy();
    expect(bia.getByText('Só a cidade')).toBeTruthy();                        // cidade do cadastro ≠ compartilhou
  });

  it('clicar em "Nenhum dos dois" filtra sem notificação e sem localização', async () => {
    render(<UsersSection filter={{} as never} />);
    fireEvent.click(await screen.findByText('Nenhum dos dois'));
    await waitFor(() => expect(usersCalls().some((c) => c.includes('push=none') && c.includes('location=none'))).toBe(true));
    expect(await screen.findByText('2 filtros ativos')).toBeTruthy();
  });

  it('os novos filtros chegam ao servidor e "limpar filtros" volta ao começo', async () => {
    render(<UsersSection filter={{} as never} />);
    await screen.findByText('ana@x.com');
    fireEvent.change(screen.getByLabelText('Aparelho com aviso'), { target: { value: 'ios' } });
    fireEvent.change(screen.getByLabelText('Atividade'), { target: { value: 'dormant' } });
    fireEvent.change(screen.getByLabelText('Pets'), { target: { value: 'no' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'no' } });
    fireEvent.change(screen.getByLabelText('Alimentação'), { target: { value: 'yes' } });
    await waitFor(() => {
      const last = usersCalls().at(-1)!;
      expect(last).toContain('push_platform=ios');
      expect(last).toContain('activity=dormant');
      expect(last).toContain('has_pet=no');
      expect(last).toContain('email_verified=no');
      expect(last).toContain('has_feeding=yes');
    });
    fireEvent.click(screen.getByText('limpar filtros'));
    await waitFor(() => expect(usersCalls().at(-1)).not.toContain('push_platform'));
    expect(screen.queryByText('limpar filtros')).toBeNull();
  });
});

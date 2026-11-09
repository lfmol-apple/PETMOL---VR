import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

const account = {
  user_id: 'u1', name: 'Karen', email: 'karen@example.com', phone: '11999990000', whatsapp: true,
  postal_code: null, street: null, number: null, complement: null, neighborhood: null,
  city: 'Osasco', state: 'SP', country: 'BR', email_verified: true,
  terms_accepted: true, terms_version: '1.0', terms_accepted_at: '2026-10-15T11:00:00Z',
  login_methods: ['senha'], lat: null, lng: null, location_source: null, location_updated_at: null,
  monthly_checkin_day: 1, monthly_checkin_hour: 20,
  created_at: '2026-10-15T11:00:00Z', updated_at: '2026-10-15T11:00:00Z',
};

const row = {
  user_id: 'u1', email: 'karen@example.com', name: 'Karen', created_at: '2026-10-15T11:00:00Z',
  last_activity: null, activity_status: 'active', pets: 1, pet_thumbnails: [], has_feeding: false,
  active_control_pets: 0, last_platform: 'android', device_type: 'android', app_version_label: 'Android (build x)',
  city: 'Osasco', state: 'SP', email_verified: true, push_active: true, push_platforms: [], push_last_seen_at: null,
  location_source: null, location_shared: false, location_updated_at: null, location_fresh: false,
  phone: '11999990000', whatsapp: true, neighborhood: null, country: 'BR', login_methods: ['senha'],
  terms_accepted: true, terms_version: '1.0', terms_accepted_at: null, checkin_day: 1, checkin_hour: 20,
  first_seen: null, ip_city: 'Osasco', ip_region: 'São Paulo', origin_campaign: 'instagram_out', origin_source: 'instagram',
};

import { TutorsSection } from './TutorsSection';

afterEach(() => vi.restoreAllMocks());

describe('TutorsSection', () => {
  it('mostra dados de conta e edita só o campo alterado', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const isPatch = init?.method === 'PATCH';
      const body = url.includes('/accounts/')
        ? (isPatch ? { ...account, name: 'Karen Reis' } : account)
        : { total: 1, page: 1, page_size: 50, items: [row] };
      return { ok: true, status: 200, json: async () => body } as Response;
    }));

    render(<TutorsSection filter={{}} />);
    await waitFor(() => expect(screen.getByText('instagram_out')).toBeTruthy());
    expect(screen.getByText('11999990000')).toBeTruthy();
    // sem endereço declarado (city/state existem no mock, então o declarado vence); sem chips de e-mail/termos
    expect(screen.queryByText(/e-mail verificado|e-mail não verificado|termos/)).toBeNull();

    fireEvent.click(screen.getByText('Editar'));
    const nameInput = await screen.findByDisplayValue('Karen');
    fireEvent.change(nameInput, { target: { value: 'Karen Reis' } });
    fireEvent.click(screen.getByText('Salvar alterações'));

    await waitFor(() => expect(screen.getByText('Salvo.')).toBeTruthy());
    const patch = calls.find((c) => c.init?.method === 'PATCH');
    expect(patch?.url).toContain('/api/v1/admin/accounts/u1');
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ name: 'Karen Reis' });
  });
});


describe('TutorsSection — local pelo IP', () => {
  it('sem endereço declarado, mostra a cidade do acesso com a marca "pelo acesso (IP)"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ total: 1, page: 1, page_size: 50, items: [{ ...row, city: null, state: null }] }),
    } as Response)));
    render(<TutorsSection filter={{}} />);
    await waitFor(() => expect(screen.getByText('Osasco / São Paulo')).toBeTruthy());
    expect(screen.getByText('pelo acesso (IP)')).toBeTruthy();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
const showAppToast = vi.fn();
vi.mock('@/features/interactions/userPromptChannel', () => ({ showAppToast: (...a: unknown[]) => showAppToast(...a) }));
const hook = {
  permission: 'granted' as NotificationPermission,
  requestPermission: vi.fn().mockResolvedValue(true),
  subscribeToPush: vi.fn().mockResolvedValue(true),
  isSubscribed: true,
};
vi.mock('@/features/interactions/useNotificationPermissionController', () => ({
  useNotificationPermissionController: () => hook,
}));

import { RoutineBathButton } from './RoutineBath';

const OFF = { enabled: false, interval_days: 15, time: '10:00', with_grooming: false, tz: 'America/Sao_Paulo' };
const ON = { ...OFF, enabled: true, last_bath_on: '2026-10-10', next_at: '2026-10-25T13:30:00Z', petshop_phone: '11999998888', petshop_name: 'Petshop X' };

function mockApi(get: unknown | null) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return { ok: true, json: async () => ({ ...(get as object), ...JSON.parse(String(init.body)) }) };
    if (init?.method === 'POST') return { ok: true, json: async () => ({ ...(get as object), last_bath_on: '2026-10-18' }) };
    if (get === null) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, json: async () => get };
  });
  vi.stubGlobal('fetch', f);
  return f;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('petmol_routine_bath_intro_v1', JSON.stringify({ shown: 3, day: '2000-01-01', opened: true }));
  hook.isSubscribed = true;
  hook.permission = 'granted';
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); showAppToast.mockClear(); });

describe('RoutineBathButton', () => {
  it('servidor com o recurso desligado (404): não desenha nada', async () => {
    const f = mockApi(null);
    const { container } = render(<RoutineBathButton petId="p1" petName="Baby" />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(container.querySelector('button')).toBeNull();
  });

  it('desligado: risquinho de inativo; ligado: verde e sem risquinho', async () => {
    mockApi(OFF);
    const first = render(<RoutineBathButton petId="p1" petName="Baby" />);
    await screen.findByRole('button', { name: 'Rotina de banho' });
    expect(screen.getByTestId('banho-inativo')).toBeTruthy();
    first.unmount();
    mockApi(ON);
    render(<RoutineBathButton petId="p1" petName="Baby" />);
    await screen.findByRole('button', { name: 'Rotina de banho ligada' });
    expect(screen.queryByTestId('banho-inativo')).toBeNull();
  });

  it('ligar grava 15 dias por padrão, com hora e fuso', async () => {
    const f = mockApi(OFF);
    render(<RoutineBathButton petId="p1" petName="Baby" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rotina de banho' }));
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'Lembrete de banho' })); });
    const put = f.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT');
    expect(String(put![0])).toContain('/pets/p1/routine/bath');
    expect(JSON.parse(String((put![1] as RequestInit).body))).toMatchObject({ enabled: true, interval_days: 15, time: '10:00' });
  });

  it('"Outro" aceita qualquer número de dias', async () => {
    const f = mockApi(ON);
    render(<RoutineBathButton petId="p1" petName="Baby" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rotina de banho ligada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Outro' }));
    const input = screen.getByLabelText('Dias entre os banhos');
    await act(async () => { fireEvent.change(input, { target: { value: '10' } }); fireEvent.blur(input); });
    const put = f.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT').pop();
    expect(JSON.parse(String((put![1] as RequestInit).body)).interval_days).toBe(10);
  });

  it('"Dei banho hoje" registra e o WhatsApp abre a conversa do petshop sem texto', async () => {
    const f = mockApi(ON);
    render(<RoutineBathButton petId="p1" petName="Baby" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rotina de banho ligada' }));
    const wa = screen.getByRole('link', { name: /Abrir WhatsApp/ });
    expect(wa.getAttribute('href')).toBe('https://wa.me/5511999998888');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Dei banho hoje/ })); });
    expect(f.mock.calls.some(([u, init]) => String(u).endsWith('/routine/bath/done') && (init as RequestInit).method === 'POST')).toBe(true);
    expect(showAppToast).toHaveBeenCalled();
  });

  it('sem número do petshop: o WhatsApp só abre o app', async () => {
    mockApi({ ...ON, petshop_phone: null, petshop_name: null });
    render(<RoutineBathButton petId="p1" petName="Baby" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rotina de banho ligada' }));
    expect(screen.getByRole('link', { name: /Abrir WhatsApp/ }).getAttribute('href')).toBe('whatsapp://');
  });
});

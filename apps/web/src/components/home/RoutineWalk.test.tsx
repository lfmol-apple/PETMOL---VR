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

import { RoutineWalkButton } from './RoutineWalk';

const OFF = { enabled: false, days: [1, 2, 3, 4, 5], times: ['18:00'], tz: 'America/Sao_Paulo' };

function mockApi(get: unknown | null) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return { ok: true, json: async () => JSON.parse(String(init.body)) };
    if (get === null) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, json: async () => get };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  localStorage.clear();
  hook.isSubscribed = true;
  hook.permission = 'granted';
  hook.requestPermission.mockClear();
  hook.subscribeToPush.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('RoutineWalkButton', () => {
  it('servidor com o recurso desligado (404): não desenha nada', async () => {
    const f = mockApi(null);
    const { container } = render(<RoutineWalkButton petId="p1" petName="Baby" />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(container.querySelector('button')).toBeNull();
  });

  it('recurso ligado: mostra o relógio e, ao ligar o passeio, grava com dias, horário e fuso', async () => {
    const f = mockApi(OFF);
    render(<RoutineWalkButton petId="p1" petName="Baby" />);
    const clock = await screen.findByRole('button', { name: /Rotina/ });
    fireEvent.click(clock);
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'Lembrete de passeio' })); });
    const put = f.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT');
    expect(put).toBeTruthy();
    expect(String(put![0])).toContain('/pets/p1/routine/walk');
    const body = JSON.parse(String((put![1] as RequestInit).body));
    expect(body).toMatchObject({ enabled: true, days: [1, 2, 3, 4, 5], times: ['18:00'] });
    expect(typeof body.tz).toBe('string');
    expect(hook.requestPermission).not.toHaveBeenCalled();   // já tinha permissão
  });

  it('sem notificações ativas: pede permissão ao ligar o primeiro interruptor', async () => {
    hook.isSubscribed = false; hook.permission = 'default';
    mockApi(OFF);
    render(<RoutineWalkButton petId="p1" petName="Baby" />);
    fireEvent.click(await screen.findByRole('button', { name: /Rotina/ }));
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'Lembrete de passeio' })); });
    expect(hook.requestPermission).toHaveBeenCalled();
    expect(hook.subscribeToPush).toHaveBeenCalled();
  });

  it('permissão negada: avisa o tutor, mas ainda grava a preferência', async () => {
    hook.isSubscribed = false; hook.permission = 'denied';
    hook.requestPermission.mockResolvedValueOnce(false);
    const f = mockApi(OFF);
    render(<RoutineWalkButton petId="p1" petName="Baby" />);
    fireEvent.click(await screen.findByRole('button', { name: /Rotina/ }));
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'Lembrete de passeio' })); });
    expect(await screen.findByText(/permita as notificações/i)).toBeTruthy();
    expect(f.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')).toBe(true);
  });

  it('o último dia da semana não pode ser desmarcado', async () => {
    const f = mockApi({ ...OFF, enabled: true, days: [3] });
    render(<RoutineWalkButton petId="p1" petName="Baby" />);
    fireEvent.click(await screen.findByRole('button', { name: /Rotina/ }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Qua' })); });
    expect(f.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });

  it('o tutor escolhe 1x, 2x ou 3x por dia e depois ajusta os horários', async () => {
    const f = mockApi({ ...OFF, enabled: true });
    render(<RoutineWalkButton petId="p1" petName="Baby" />);
    fireEvent.click(await screen.findByRole('button', { name: /Rotina/ }));
    const puts = () => f.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    // Começa em 1x, com um só horário.
    expect(screen.getByRole('button', { name: '1x' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    // 2x: aparece o segundo horário.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '2x' })); });
    expect(puts().at(-1).times).toEqual(['07:30', '18:00']);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    // 3x e depois volta para 1x: ficam só os primeiros.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '3x' })); });
    expect(puts().at(-1).times).toHaveLength(3);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '1x' })); });
    expect(puts().at(-1).times).toHaveLength(1);
    // Ajusta o horário do passeio.
    await act(async () => { fireEvent.change(screen.getByLabelText('Horário do passeio 1'), { target: { value: '06:30' } }); });
    expect(puts().at(-1).times).toEqual(['06:30']);
  });

  it('mostra o resumo e "Confirmar" fecha a janela e avisa que ficou confirmado', async () => {
    mockApi({ enabled: true, days: [1, 2, 3, 4, 5], times: ['07:30', '18:00'], tz: 'America/Sao_Paulo' });
    render(<RoutineWalkButton petId="p1" petName="Baby" />);
    fireEvent.click(await screen.findByRole('button', { name: /Rotina/ }));
    expect(screen.getByTestId('rotina-resumo').textContent).toBe('Vamos avisar às 07:30 e 18:00, de seg a sex.');
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(showAppToast).toHaveBeenCalledWith(expect.stringContaining('confirmado'), expect.anything());
  });

  it('1ª visita mostra o balão; depois de abrir a Rotina ele não volta', async () => {
    mockApi(OFF);
    const first = render(<RoutineWalkButton petId="p1" petName="Baby" />);
    expect(await screen.findByText(/Novo: lembrete de passeio/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Rotina/ }));
    first.unmount();
    render(<RoutineWalkButton petId="p1" petName="Baby" />);
    await screen.findByRole('button', { name: /Rotina/ });
    expect(screen.queryByText(/Novo: lembrete de passeio/)).toBeNull();
  });
});

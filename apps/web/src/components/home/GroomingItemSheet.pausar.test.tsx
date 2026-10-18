import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/backStack', () => ({ useBackHandler: () => undefined }));
vi.mock('@/hooks/useKeyboardSheet', () => ({ useKeyboardSheet: () => ({ current: null }) }));
vi.mock('@/components/ModalPortal', () => ({ ModalPortal: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/features/interactions/usePushOneTimeAsk', () => ({ usePushOneTimeAsk: () => ({ shouldAsk: false, markAsked: vi.fn() }) }));
vi.mock('@/features/interactions/useNotificationPermissionController', () => ({
  useNotificationPermissionController: () => ({ permission: 'granted', requestPermission: vi.fn(), subscribeToPush: vi.fn() }),
}));
vi.mock('@/features/notifications/pushService', () => ({
  scheduleUniqueReminder: vi.fn(), buildRemindAt: vi.fn(() => '2999-01-01T12:00:00.000Z'), subtractDays: (d: string) => d,
}));

import { GroomingItemSheet } from './GroomingItemSheet';

const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];

beforeEach(() => {
  calls.length = 0;
  (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => undefined;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: String(url), method: init?.method ?? 'GET', body });
    const json = String(url).endsWith('/grooming-routine') ? { active: body?.active, resumed_on: body?.active ? '2026-10-18' : null } : {};
    return { ok: true, status: 200, json: async () => json, text: async () => '' };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const iso = (off: number) => {
  const d = new Date(); d.setDate(d.getDate() + off);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const rec = (over: Record<string, unknown> = {}) => ({
  id: 'g1', type: 'bath_grooming', date: iso(-40), location: 'Mundo dos Bichos', location_phone: '11999998888',
  next_recommended_date: iso(-5), frequency_days: 45, ...over,
}) as never;

function open(routine: { active: boolean; resumed_on?: string | null }, records: unknown[] = [rec(), rec({ id: 'g0', date: iso(-85), next_recommended_date: iso(-40) })]) {
  const onRoutineChange = vi.fn();
  render(<GroomingItemSheet petId="p1" petName="Baby" groomingRecords={records as never} routine={routine}
    onRoutineChange={onRoutineChange} onClose={vi.fn()} onRefresh={async () => undefined} />);
  return { onRoutineChange };
}

describe('GroomingItemSheet — desativar e retomar os lembretes', () => {
  it('ao desligar/religar pelo interruptor (no fim), a tela volta ao topo, onde ficam o aviso e o botão Reativar', async () => {
    const scrollTo = vi.fn();
    (Element.prototype as unknown as { scrollTo: unknown }).scrollTo = scrollTo;
    open({ active: true, resumed_on: null });
    fireEvent.click(screen.getByText('Lembretes'));
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'Lembretes de banho e tosa' })); });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('ativo: mostra a linha "Lembretes de banho e tosa · Ativos"; desligar salva e avisa o histórico fica', async () => {
    const { onRoutineChange } = open({ active: true, resumed_on: null });
    fireEvent.click(screen.getByText('Lembretes'));
    const sw = screen.getByRole('switch', { name: 'Lembretes de banho e tosa' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByText('Ativos').length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(sw); });
    const put = calls.find((c) => c.method === 'PUT');
    expect(put!.url).toContain('/pets/p1/grooming-routine');
    expect(put!.body).toEqual({ active: false });
    expect(onRoutineChange).toHaveBeenCalledWith({ active: false, resumed_on: null });
  });

  it('desativado: nada é cobrado (sem "Já deu?" nem "Mudar a data"), mas o histórico e o resto ficam intactos', () => {
    open({ active: false, resumed_on: null });
    expect(screen.getByTestId('lembretes-desativados')).toBeTruthy();
    expect(screen.getByText('Lembretes desativados')).toBeTruthy();                 // status do topo
    expect(screen.queryByTestId('ja-deu')).toBeNull();
    expect(screen.queryByText('Mudar a data do próximo banho')).toBeNull();
    expect(screen.getByText(/Histórico \(2\)/)).toBeTruthy();                        // histórico completo
    expect(screen.getByText('Último serviço')).toBeTruthy();
    expect(screen.getByText('Agendar via WhatsApp')).toBeTruthy();
    expect(screen.getByText('Registrar banho/tosa')).toBeTruthy();                   // registrar continua possível
    fireEvent.click(screen.getByText('Lembretes'));
    expect(screen.getByRole('switch', { name: 'Lembretes de banho e tosa' }).getAttribute('aria-checked')).toBe('false');
  });

  it('"Reativar lembretes" salva active:true', async () => {
    const { onRoutineChange } = open({ active: false, resumed_on: null });
    await act(async () => { fireEvent.click(screen.getByText('Reativar lembretes')); });
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ active: true });
    expect(onRoutineChange).toHaveBeenCalledWith({ active: true, resumed_on: '2026-10-18' });
  });

  it('retomado, sem registro novo: não está "atrasado"; pede o último banho e mantém o histórico todo', () => {
    open({ active: true, resumed_on: iso(0) });
    expect(screen.queryByTestId('ja-deu')).toBeNull();
    expect(screen.queryByText(/Previsto para/)).toBeNull();
    expect(screen.getByText('Sem agendamento')).toBeTruthy();
    expect(screen.getByTestId('recomecar')).toBeTruthy();
    expect(screen.getByText(/Histórico \(2\)/)).toBeTruthy();
    fireEvent.click(screen.getByText('✅ Registrar banho'));
    expect(screen.getByText(/Quando foi o/)).toBeTruthy();
  });

  it('retomado com registro novo: volta a agendar normalmente e o convite some', () => {
    open({ active: true, resumed_on: iso(-2) }, [rec({ id: 'novo', date: iso(-1), next_recommended_date: iso(44) }), rec({ id: 'g0', date: iso(-85) })]);
    expect(screen.queryByTestId('recomecar')).toBeNull();
    expect(screen.getByText('Em 44 dias')).toBeTruthy();
  });
});

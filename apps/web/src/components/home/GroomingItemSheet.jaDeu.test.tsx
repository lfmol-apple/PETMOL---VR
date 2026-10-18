import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
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

function open(records: unknown[]) {
  return render(<GroomingItemSheet initialPanel="full" petId="p1" petName="Baby" groomingRecords={records as never} onClose={vi.fn()} onRefresh={async () => undefined} />);
}

describe('GroomingItemSheet — cartão "Já deu?"', () => {
  it('passou da data: pergunta; em dia: não aparece', () => {
    open([rec()]);
    expect(screen.getByTestId('ja-deu')).toBeTruthy();
    expect(screen.getByText(/Já deu\?/)).toBeTruthy();
    expect(screen.getByText('✅ Já dei')).toBeTruthy();
    expect(screen.getByText('📅 Ainda não')).toBeTruthy();
    expect(screen.getByText('Mudou a rotina?')).toBeTruthy();
    cleanup();
    open([rec({ next_recommended_date: iso(10) })]);
    expect(screen.queryByTestId('ja-deu')).toBeNull();
  });

  it('"Já dei" + Ontem: registra um serviço novo repetindo tipo e petshop; não mexe nos antigos', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Já dei'));
    fireEvent.click(screen.getByRole('button', { name: 'Ontem' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Registrar' })); });
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/pets/p1/grooming'));
    expect(post).toBeTruthy();
    expect(post!.body).toMatchObject({ type: 'bath_grooming', date: iso(-1), location: 'Mundo dos Bichos', location_phone: '11999998888', frequency_days: 45 });
    expect(post!.body!.next_recommended_date).toBe(iso(-1 + 45));
    expect(calls.some((c) => c.method === 'PATCH' || c.method === 'DELETE')).toBe(false);
  });

  it('"Ainda não" + Amanhã: só muda a data do próximo e guarda o reagendamento (sem criar registro)', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('📅 Ainda não'));
    fireEvent.click(screen.getByRole('button', { name: 'Amanhã' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Agendar para/ })); });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.url).toContain('/pets/p1/grooming/g1');
    expect(patch!.body).toMatchObject({ next_recommended_date: iso(1), rescheduled_count: 1, reminder_enabled: true });
    const hist = patch!.body!.reschedule_history as Array<{ from: string; to: string }>;
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ from: iso(-5), to: iso(1) });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('"Mudar a data do próximo banho" (dentro de Lembretes) abre o seletor mesmo em dia, e "Voltar" fecha', async () => {
    open([rec({ next_recommended_date: iso(10) })]);
    expect(screen.queryByTestId('ja-deu')).toBeNull();
    fireEvent.click(screen.getByText('Lembretes'));
    fireEvent.click(screen.getByText('Mudar a data do próximo banho'));
    await waitFor(() => expect(screen.getByText(/Quando vai ser o próximo/)).toBeTruthy());
    fireEvent.click(screen.getByText('Voltar'));
    expect(screen.queryByTestId('ja-deu')).toBeNull();
  });

  it('"Mudou a rotina?" abre a edição do registro (campo "A cada (dias)")', () => {
    open([rec()]);
    fireEvent.click(screen.getByText('Mudou a rotina?'));
    expect(screen.getByText(/A cada \(dias\)/)).toBeTruthy();
  });
});

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
  localStorage.clear();
  (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => undefined;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const d = (off: number) => { const t = new Date(); t.setDate(t.getDate() + off); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const rec = (over: Record<string, unknown> = {}) => ({
  id: 'g1', type: 'bath', date: d(-10), location: 'Mundo dos Bichos', location_phone: '11999998888',
  next_recommended_date: d(35), frequency_days: 45, alert_days_before: 3, ...over,
}) as never;

function open(records: unknown[]) {
  render(<GroomingItemSheet petId="p1" petName="Baby" groomingRecords={records as never} routine={{ active: true, resumed_on: null }}
    onRoutineChange={vi.fn()} onClose={vi.fn()} onRefresh={async () => undefined} />);
}
const register = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Registrar (banho e tosa|banho|tosa)$/i })); }); };
const post = () => calls.find((c) => c.method === 'POST' && c.url.endsWith('/pets/p1/grooming'))!;

describe('"Dei banho hoje" — formulário de registro', () => {
  it('abre com tudo preenchido: tipo do último, data de hoje, repetir a cada do último, 3 dias antes', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    expect(screen.getByText('O que foi feito?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Banho', pressed: true })).toBeTruthy();   // tipo do último registro
    expect((screen.getByLabelText('Repetir a cada (dias)') as HTMLInputElement).value).toBe('45');
    expect((screen.getByLabelText('Dias de antecedência do lembrete') as HTMLInputElement).value).toBe('3');
    await register();
    expect(post().body).toMatchObject({ type: 'bath', date: d(0), frequency_days: 45, alert_days_before: 3, location: 'Mundo dos Bichos' });
  });

  it('o tutor escolhe Banho ou Banho e Tosa (ou Tosa)', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    fireEvent.click(screen.getByRole('button', { name: 'Banho e Tosa' }));
    expect(screen.getByRole('button', { name: 'Registrar banho e tosa' })).toBeTruthy();
    await register();
    expect(post().body).toMatchObject({ type: 'bath_grooming' });
  });

  it('a data pode ser mudada, inclusive para antes (Ontem / outra data passada)', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    fireEvent.click(screen.getByRole('button', { name: 'Ontem' }));
    await register();
    expect(post().body).toMatchObject({ date: d(-1) });
  });

  it('sem registro anterior: Repetir a cada vem 30 e o tutor muda para quantos quiser', async () => {
    open([]);
    fireEvent.click(screen.getByText('✅ Informar o último banho'));
    const freq = screen.getByLabelText('Repetir a cada (dias)') as HTMLInputElement;
    expect(freq.value).toBe('30');
    fireEvent.change(freq, { target: { value: '17' } });
    await register();
    expect(post().body).toMatchObject({ frequency_days: 17 });
  });

  it('Lembrete: Semanalmente / A cada 15 dias / A cada mês definem o intervalo entre banhos', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    const freq = () => (screen.getByLabelText('Repetir a cada (dias)') as HTMLInputElement).value;
    fireEvent.click(screen.getByRole('button', { name: 'Semanalmente' }));
    expect(freq()).toBe('7');
    fireEvent.click(screen.getByRole('button', { name: 'A cada 15 dias' }));
    expect(freq()).toBe('15');
    fireEvent.click(screen.getByRole('button', { name: 'A cada mês' }));
    expect(freq()).toBe('30');
    await register();
    expect(post().body).toMatchObject({ frequency_days: 30 });
  });

  it('Lembrete: "Lembrar X dias antes" com X livre', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    fireEvent.click(screen.getByRole('button', { name: 'Lembrar X dias antes' }));
    fireEvent.change(screen.getByLabelText('Dias de antecedência do lembrete'), { target: { value: '5' } });
    await register();
    expect(post().body).toMatchObject({ alert_days_before: 5 });
  });

  it('sem número de WhatsApp salvo: pede nome e WhatsApp do petshop e grava no registro', async () => {
    open([rec({ location: '', location_phone: '' })]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    expect(screen.getByTestId('petshop-campos')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome do petshop'), { target: { value: 'Petshop X' } });
    fireEvent.change(screen.getByLabelText('WhatsApp do petshop'), { target: { value: '(11) 98888-7777' } });
    await register();
    expect(post().body).toMatchObject({ location: 'Petshop X', location_phone: '(11) 98888-7777' });
  });

  it('com número de WhatsApp já salvo: não pergunta de novo, e o botão do WhatsApp continua na tela', () => {
    open([rec()]);
    expect(screen.getByText('Agendar via WhatsApp')).toBeTruthy();
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    expect(screen.queryByTestId('petshop-campos')).toBeNull();
  });

  it('intervalo inválido não registra', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    fireEvent.change(screen.getByLabelText('Repetir a cada (dias)'), { target: { value: '0' } });
    await register();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

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
const br = (off: number) => { const t = new Date(); t.setDate(t.getDate() + off); return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`; };
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
    expect(screen.getByTestId('form-registrar')).toBeTruthy();
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

  it('a data já vem digitável (hoje) com o dia da semana na frente; pode ser mudada, inclusive para antes', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    const campo = screen.getByPlaceholderText('DD/MM/AAAA') as HTMLInputElement;
    expect(campo.value).toBe(br(0));                              // hoje por padrão, sem botões Hoje/Ontem
    expect(screen.queryByRole('button', { name: 'Hoje' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ontem' })).toBeNull();
    fireEvent.change(campo, { target: { value: '19/10/2026' } });
    expect(screen.getByTestId('dia-da-semana').textContent).toBe('Segunda-feira');
    fireEvent.change(campo, { target: { value: br(-3) } });
    await register();
    expect(post().body).toMatchObject({ date: d(-3) });
  });

  it('sem registro anterior: Repetir a cada vem 15 e o tutor muda para quantos quiser', async () => {
    open([]);
    fireEvent.click(screen.getByText('✅ Informar o último banho'));
    const freq = screen.getByLabelText('Repetir a cada (dias)') as HTMLInputElement;
    expect(freq.value).toBe('15');
    fireEvent.change(freq, { target: { value: '17' } });
    await register();
    expect(post().body).toMatchObject({ frequency_days: 17 });
  });

  it('Lembrete: "Lembrar X dias antes" com X livre (e não há atalhos de intervalo: "Repetir a cada" resolve)', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    expect(screen.queryByRole('button', { name: 'Semanalmente' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'A cada 15 dias' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'A cada mês' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Dias de antecedência do lembrete'), { target: { value: '5' } });
    await register();
    expect(post().body).toMatchObject({ alert_days_before: 5 });
  });

  it('só dois tipos (Banho / Banho e Tosa) — quase ninguém faz só tosa', () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    expect(screen.getByRole('button', { name: 'Banho' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Banho e Tosa' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tosa' })).toBeNull();
  });

  it('hora e minuto do lembrete são escolhidos e gravados', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    fireEvent.change(screen.getByLabelText('Hora do lembrete'), { target: { value: '07:45' } });
    await register();
    expect(post().body).toMatchObject({ scheduled_time: '07:45' });
  });

  it('petshop: sem número salvo, os campos vêm vazios e o que o tutor digitar é gravado', async () => {
    open([rec({ location: '', location_phone: '' })]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    expect((screen.getByLabelText('WhatsApp do petshop') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Nome do petshop'), { target: { value: 'Petshop X' } });
    fireEvent.change(screen.getByLabelText('WhatsApp do petshop'), { target: { value: '(11) 98888-7777' } });
    await register();
    expect(post().body).toMatchObject({ location: 'Petshop X', location_phone: '(11) 98888-7777' });
  });

  it('petshop: com número já salvo, o campo vem preenchido (dá para editar) e o botão do WhatsApp continua na tela', async () => {
    open([rec()]);
    expect(screen.getByText('Agendar via WhatsApp')).toBeTruthy();
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    expect((screen.getByLabelText('WhatsApp do petshop') as HTMLInputElement).value).toBe('11999998888');
    fireEvent.change(screen.getByLabelText('WhatsApp do petshop'), { target: { value: '11977776666' } });
    await register();
    expect(post().body).toMatchObject({ location_phone: '11977776666' });
  });

  it('intervalo inválido não registra', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    fireEvent.change(screen.getByLabelText('Repetir a cada (dias)'), { target: { value: '0' } });
    await register();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('na tela rápida dá para adicionar/alterar o WhatsApp do petshop sem registrar banho (PATCH só de nome e telefone)', async () => {
    open([rec({ location: '', location_phone: '' })]);
    fireEvent.click(screen.getByText('Adicionar o WhatsApp do petshop'));
    fireEvent.change(screen.getByLabelText('Nome do petshop (editar)'), { target: { value: 'Petshop Y' } });
    fireEvent.change(screen.getByLabelText('WhatsApp do petshop (editar)'), { target: { value: '(11) 95555-4444' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })); });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.url).toContain('/pets/p1/grooming/g1');
    expect(patch!.body).toEqual({ location: 'Petshop Y', location_phone: '(11) 95555-4444' });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('com número salvo o link vira "Alterar o WhatsApp do petshop" e abre preenchido', () => {
    open([rec()]);
    fireEvent.click(screen.getByText('Alterar o WhatsApp do petshop'));
    expect((screen.getByLabelText('WhatsApp do petshop (editar)') as HTMLInputElement).value).toBe('11999998888');
  });
});

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
  id: 'g1', type: 'bath_grooming', date: d(-10), location: 'Mundo dos Bichos', location_phone: '11999998888',
  next_recommended_date: d(35), frequency_days: 45, ...over,
}) as never;

function open(records: unknown[], routine = { active: true as boolean, resumed_on: null as string | null }) {
  render(<GroomingItemSheet petId="p1" petName="Baby" groomingRecords={records as never} routine={routine}
    onRoutineChange={vi.fn()} onClose={vi.fn()} onRefresh={async () => undefined} />);
}

describe('GroomingItemSheet — tela rápida (abre primeiro)', () => {
  it('em dia: mostra o próximo banho e "Dei banho hoje"; WhatsApp e "Histórico e ajustes" ao alcance; o resto fica escondido', () => {
    open([rec()]);
    expect(screen.getByTestId('em-dia').textContent).toContain('Próximo banho e tosa de Baby');
    expect(screen.getByText('✅ Dei banho hoje')).toBeTruthy();
    expect(screen.getByText('Agendar via WhatsApp')).toBeTruthy();
    expect(screen.getByText('Histórico e ajustes')).toBeTruthy();
    // a gestão não aparece na tela rápida
    expect(screen.queryByText('Último serviço')).toBeNull();
    expect(screen.queryByText('Registrar banho/tosa')).toBeNull();
    expect(screen.queryByText(/Histórico \(/)).toBeNull();
  });

  it('em dia: "Dei banho hoje" → Registrar cria o serviço novo repetindo tipo e petshop (2 toques)', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✅ Dei banho hoje'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Registrar (banho e tosa|banho|tosa)$/i })); });
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/pets/p1/grooming'));
    expect(post!.body).toMatchObject({ type: 'bath_grooming', date: d(0), location: 'Mundo dos Bichos', frequency_days: 45 });
  });

  it('em dia: "Mudar a data" edita o banho programado aqui mesmo (só a data do próximo)', async () => {
    open([rec()]);
    fireEvent.click(screen.getByText('✏️ Mudar a data'));
    expect(screen.getByText(/Quando vai ser o próximo/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Amanhã' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Agendar para/ })); });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.url).toContain('/pets/p1/grooming/g1');
    expect(patch!.body).toMatchObject({ next_recommended_date: d(1), rescheduled_count: 1 });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('passou da data: abre direto no "Já deu?" (Já dei / Ainda não)', () => {
    open([rec({ date: d(-60), next_recommended_date: d(-15) })]);
    expect(screen.getByTestId('ja-deu')).toBeTruthy();
    expect(screen.getByText('✅ Já dei')).toBeTruthy();
    expect(screen.getByText('📅 Ainda não')).toBeTruthy();
    expect(screen.queryByTestId('em-dia')).toBeNull();
  });

  it('nunca controlou: pergunta o último banho e registra do zero (sem registro anterior)', async () => {
    open([]);
    expect(screen.getByTestId('primeiro-banho').textContent).toContain('Quando foi o último banho de Baby?');
    fireEvent.click(screen.getByText('✅ Informar o último banho'));
    fireEvent.change(screen.getByPlaceholderText('DD/MM/AAAA'), { target: { value: br(-1) } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Registrar (banho e tosa|banho|tosa)$/i })); });
    const post = calls.find((c) => c.method === 'POST');
    expect(post!.body).toMatchObject({ type: 'bath_grooming', date: d(-1), frequency_days: 15 });   // padrão: 15 dias
  });

  it('desativado: só o aviso com "Reativar lembretes"', () => {
    open([rec()], { active: false, resumed_on: null });
    expect(screen.getByTestId('lembretes-desativados')).toBeTruthy();
    expect(screen.queryByTestId('em-dia')).toBeNull();
    expect(screen.queryByTestId('ja-deu')).toBeNull();
  });

  it('"Histórico e ajustes" leva à tela completa (nada se perdeu) e a seta volta à rápida', () => {
    open([rec()]);
    fireEvent.click(screen.getByText('Histórico e ajustes'));
    expect(screen.getByText('Último serviço')).toBeTruthy();
    expect(screen.getByText('Registrar banho/tosa')).toBeTruthy();
    expect(screen.getByText(/Histórico \(1\)/)).toBeTruthy();
    expect(screen.getByText('Lembretes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Voltar/i }));
    expect(screen.queryByText('Último serviço')).toBeNull();
    expect(screen.getByTestId('em-dia')).toBeTruthy();
  });

  it('o cartão do banho e tosa vem primeiro e o interruptor logo abaixo (compacto), na tela rápida e na completa', () => {
    open([rec()]);
    const topo = screen.getByTestId('lembretes-topo');
    expect(topo.textContent).toContain('Lembretes de banho e tosa');
    // ordem: cartão do banho e tosa ANTES do interruptor
    const emDia = screen.getByTestId('em-dia');
    expect(emDia.compareDocumentPosition(topo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Lembretes de banho e tosa' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByText('Histórico e ajustes'));
    expect(screen.getByTestId('lembretes-topo')).toBeTruthy();
  });

  it('desativar direto pelo interruptor (tela rápida): salva active:false e o histórico fica', async () => {
    const onRoutineChange = vi.fn();
    render(<GroomingItemSheet petId="p1" petName="Baby" groomingRecords={[rec()] as never} routine={{ active: true, resumed_on: null }}
      onRoutineChange={onRoutineChange} onClose={vi.fn()} onRefresh={async () => undefined} />);
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'Lembretes de banho e tosa' })); });
    const put = calls.find((c) => c.method === 'PUT');
    expect(put!.url).toContain('/pets/p1/grooming-routine');
    expect(put!.body).toEqual({ active: false });
    expect(onRoutineChange).toHaveBeenCalled();
  });

  it('desativado: o interruptor continua no topo (desligado) e o aviso explica como voltar', () => {
    open([rec()], { active: false, resumed_on: null });
    expect(screen.getByRole('switch', { name: 'Lembretes de banho e tosa' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('lembretes-desativados').textContent).toContain('interruptor');
  });

  it('"Registrar com mais detalhes" abre o formulário completo de sempre', () => {
    open([rec()]);
    fireEvent.click(screen.getByText('Registrar com mais detalhes'));
    expect(screen.getByText(/Repetir a cada/)).toBeTruthy();
  });
});

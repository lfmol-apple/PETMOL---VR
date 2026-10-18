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
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Registrar' })); });
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/pets/p1/grooming'));
    expect(post!.body).toMatchObject({ type: 'bath_grooming', date: d(0), location: 'Mundo dos Bichos', frequency_days: 45 });
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
    fireEvent.click(screen.getByRole('button', { name: 'Ontem' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Registrar' })); });
    const post = calls.find((c) => c.method === 'POST');
    expect(post!.body).toMatchObject({ type: 'bath_grooming', date: d(-1), frequency_days: 30 });   // padrão do app para banho + tosa
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

  it('"Registrar com mais detalhes" abre o formulário completo de sempre', () => {
    open([rec()]);
    fireEvent.click(screen.getByText('Registrar com mais detalhes'));
    expect(screen.getByText(/Repetir a cada/)).toBeTruthy();
  });
});

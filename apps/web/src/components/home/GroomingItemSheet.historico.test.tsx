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

const rec = (id: string, date: string, over: Record<string, unknown> = {}) => ({
  id, type: 'bath_grooming', date, location: 'Mundo dos Bichos', ...over,
}) as never;

const d = (off: number) => { const t = new Date(); t.setDate(t.getDate() + off); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

// intervalos de 40, 44 e 47 dias (mediana 44), com valor nos dois mais antigos
function records(freq: number) {
  return [
    rec('a', d(-10), { next_recommended_date: d(-10 + freq), frequency_days: freq }),
    rec('b', d(-57)),
    rec('c', d(-101), { cost: 145 }),
    rec('d', d(-141), { cost: 145 }),
  ];
}

function open(recs: unknown[], routine = { active: true as boolean, resumed_on: null as string | null }) {
  render(<GroomingItemSheet initialPanel="full" petId="p1" petName="Baby" groomingRecords={recs as never} routine={routine}
    onRoutineChange={vi.fn()} onClose={vi.fn()} onRefresh={async () => undefined} />);
}

describe('GroomingItemSheet — histórico mais rico', () => {
  it('resumo (média e total), próximo destacado, intervalos entre serviços e "Ver todos"', () => {
    open(records(45));
    const resumo = screen.getByTestId('historico-resumo').textContent!;
    expect(resumo).toContain('média a cada 44 dias');
    expect(resumo).toContain('R$ 290,00');
    expect(screen.getByText(/Histórico \(4\)/)).toBeTruthy();
    expect(screen.queryByTestId('historico-proximo')).toBeNull();        // fechado por padrão
    fireEvent.click(screen.getByText(/Histórico \(4\)/));
    expect(screen.getByTestId('historico-proximo').textContent).toContain('Próximo:');
    // 3 primeiros + botão; 2 intervalos entre os 3 visíveis
    expect(screen.getAllByTestId('historico-intervalo')).toHaveLength(2);
    fireEvent.click(screen.getByText('Ver os 4 serviços'));
    expect(screen.getAllByTestId('historico-intervalo')).toHaveLength(3);
    expect(screen.getByText('Mostrar menos')).toBeTruthy();
    // editar/remover continuam em todas as linhas
    expect(screen.getAllByRole('button', { name: 'Editar' }).length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByRole('button', { name: 'Remover' })).toHaveLength(4);
  });

  it('mostra "Reagendado de …" quando o tutor mudou a data do próximo', () => {
    const recs = records(45);
    (recs[0] as unknown as Record<string, unknown>).reschedule_history = [{ from: d(-3), to: d(35), at: new Date().toISOString() }];
    open(recs);
    fireEvent.click(screen.getByText(/Histórico \(4\)/));
    expect(screen.getByTestId('historico-proximo').textContent).toContain('Reagendado de');
  });

  it('com poucos registros não aparece resumo nem "Ver todos"', () => {
    open([rec('a', d(-10), { next_recommended_date: d(35), frequency_days: 45 })]);
    expect(screen.queryByTestId('historico-resumo')).toBeNull();
    expect(screen.queryByText(/Ver os/)).toBeNull();
  });
});

describe('GroomingItemSheet — intervalo sugerido', () => {
  it('lembrete em 15 dias e hábito de 44: sugere; "Usar 44 dias" só troca o intervalo e a data do próximo', async () => {
    open(records(15));
    fireEvent.click(screen.getByText('Lembretes'));
    expect(screen.getByTestId('intervalo-sugerido').textContent).toContain('44 dias');
    await act(async () => { fireEvent.click(screen.getByText('Usar 44 dias')); });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.url).toContain('/pets/p1/grooming/a');
    expect(patch!.body).toMatchObject({ frequency_days: 44, next_recommended_date: d(-10 + 44), reminder_enabled: true });
    expect(calls.some((c) => c.method === 'POST' || c.method === 'DELETE')).toBe(false);
  });

  it('lembrete já perto do hábito (45 vs 44): não sugere', () => {
    open(records(45));
    expect(screen.queryByTestId('intervalo-sugerido')).toBeNull();
  });

  it('"Agora não" esconde e lembra a escolha', () => {
    open(records(15));
    fireEvent.click(screen.getByText('Lembretes'));
    fireEvent.click(screen.getByText('Agora não'));
    expect(screen.queryByTestId('intervalo-sugerido')).toBeNull();
    cleanup();
    open(records(15));
    fireEvent.click(screen.getByText('Lembretes'));
    expect(screen.queryByTestId('intervalo-sugerido')).toBeNull();
  });

  it('lembretes desativados: sem sugestão e sem linha de próximo, mas o histórico rico continua', () => {
    open(records(15), { active: false, resumed_on: null });
    fireEvent.click(screen.getByText('Lembretes'));
    fireEvent.click(screen.getByText(/Histórico \(4\)/));
    expect(screen.queryByTestId('intervalo-sugerido')).toBeNull();
    expect(screen.queryByTestId('historico-proximo')).toBeNull();
    expect(screen.getByTestId('historico-resumo')).toBeTruthy();
  });
});

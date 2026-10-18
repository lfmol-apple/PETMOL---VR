import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/backStack', () => ({ useBackHandler: () => undefined }));
vi.mock('@/hooks/useKeyboardSheet', () => ({ useKeyboardSheet: () => ({ current: null }) }));
vi.mock('@/components/ModalPortal', () => ({ ModalPortal: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/features/interactions/usePushOneTimeAsk', () => ({ usePushOneTimeAsk: () => ({ shouldAsk: false, markAsked: vi.fn() }) }));
vi.mock('@/features/interactions/useNotificationPermissionController', () => ({
  useNotificationPermissionController: () => ({ permission: 'granted', requestPermission: vi.fn(), subscribeToPush: vi.fn() }),
}));
vi.mock('@/features/notifications/pushService', () => ({
  scheduleUniqueReminder: vi.fn(), buildRemindAt: vi.fn(() => null), subtractDays: vi.fn(),
}));

import { GroomingItemSheet } from './GroomingItemSheet';

afterEach(cleanup);

const iso = (off: number) => {
  const d = new Date(); d.setDate(d.getDate() + off);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const rec = (over: Record<string, unknown>) => ({
  id: 'g1', type: 'bath_grooming', date: iso(-40), location: 'Mundo dos Bichos', location_phone: '11999998888',
  next_recommended_date: iso(-5), frequency_days: 45, cost: 145, ...over,
}) as never;

function open(records: unknown[]) {
  return render(<GroomingItemSheet initialPanel="full" petId="p1" petName="Baby" groomingRecords={records as never} onClose={vi.fn()} onRefresh={async () => undefined} />);
}

describe('GroomingItemSheet — o que não pode se perder', () => {
  it('mantém último serviço, WhatsApp, histórico, registrar e mudar a data do próximo', () => {
    open([rec({}), rec({ id: 'g2', date: iso(-85), next_recommended_date: iso(-40) })]);
    expect(screen.getByText('Higiene e Petshop')).toBeTruthy();
    expect(screen.getByText('Último serviço')).toBeTruthy();
    expect(screen.getByText('Agendar via WhatsApp')).toBeTruthy();
    expect(screen.getByText(/Histórico \(2\)/)).toBeTruthy();
    expect(screen.getByText('Registrar banho/tosa')).toBeTruthy();
    // tela simples: histórico e lembretes são linhas fechadas — nada some, só abre ao tocar
    fireEvent.click(screen.getByText('Lembretes'));
    expect(screen.getByText('Mudar a data do próximo banho')).toBeTruthy();   // antes: "Editar próximo agendamento"
    fireEvent.click(screen.getByText(/Histórico \(2\)/));
    expect(screen.getAllByText(/Mundo dos Bichos/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Editar|Remover/ }).length).toBeGreaterThan(0);
  });

  it('passou da data: não acusa "Atrasado há N dias"; diz a data prevista', () => {
    open([rec({})]);
    expect(screen.queryByText(/Atrasado há/)).toBeNull();
    expect(screen.getByText(/Previsto para/)).toBeTruthy();
  });

  it('em dia mantém "Em N dias"', () => {
    open([rec({ date: iso(-5), next_recommended_date: iso(10) })]);
    expect(screen.getByText('Em 10 dias')).toBeTruthy();
  });
});

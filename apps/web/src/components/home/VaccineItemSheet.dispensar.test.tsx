import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/backStack', () => ({ useBackHandler: () => undefined }));
vi.mock('@/hooks/useKeyboardSheet', () => ({ useKeyboardSheet: () => ({ current: null }) }));
vi.mock('@/components/ModalPortal', () => ({ ModalPortal: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ tutor: { id: 'u1' } }) }));
vi.mock('@/features/interactions/usePushOneTimeAsk', () => ({ usePushOneTimeAsk: () => ({ shouldAsk: false, markAsked: vi.fn(), open: false, dismiss: vi.fn() }) }));
vi.mock('@/features/interactions/useNotificationPermissionController', () => ({
  useNotificationPermissionController: () => ({ permission: 'granted', requestPermission: vi.fn(), subscribeToPush: vi.fn() }),
}));
vi.mock('@/features/ai/aiPhotoConsent', () => ({ ensureAiPhotoConsent: vi.fn(async () => true), fetchAiPhotoConsent: vi.fn(async () => true) }));

import { VaccineItemSheet } from './VaccineItemSheet';

afterEach(cleanup);

const d = (off: number) => { const t = new Date(); t.setDate(t.getDate() + off); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const vac = (id: string, name: string, type: string, applied: string, next: string) =>
  ({ id, pet_id: 'p1', vaccine_name: name, vaccine_type: type, date_administered: applied, next_dose_date: next, is_confirmed: true }) as never;

function open(vaccines: unknown[], onDismissReminder = vi.fn()) {
  render(
    <VaccineItemSheet
      petId="p1" petName="Aron" petSpecies="cat" vaccines={vaccines as never}
      onClose={vi.fn()} onQuickAdd={vi.fn()} onFullFormVaccine={vi.fn()} onEditVaccine={vi.fn()} onDeleteVaccine={vi.fn()}
      onDismissReminder={onDismissReminder} onDeleteAllVaccines={vi.fn()} onRefreshVaccines={vi.fn()}
      pendingCardFiles={[]} setPendingCardFiles={vi.fn()} importingCard={false}
      handleFilesSelectedAppend={vi.fn()} handleProcessCards={async () => undefined}
    />,
  );
  return onDismissReminder;
}

describe('VaccineItemSheet — saída para a vacina "vencida" que ficou para trás', () => {
  it('vacina de "Revisar" tem "Não preciso mais deste lembrete" e o toque chama o handler com o registro', () => {
    const antiga = vac('antiga', 'Antirrábica', 'rabies', d(-800), d(-435));
    const onDismiss = open([antiga]);
    fireEvent.click(screen.getByText('Não preciso mais deste lembrete'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect((onDismiss.mock.calls[0][0] as { id: string }).id).toBe('antiga');
  });

  it('o caso do Aron: "V4" antigo + "V4" novo (um com código, outro sem) = mesma vacina → NÃO aparece em "Revisar"', () => {
    const lista = [
      { ...(vac('a1', 'V4', 'multiple', d(-1065), d(-700)) as object), vaccine_code: null },
      { ...(vac('a3', 'V4', 'multiple', d(-4), d(361)) as object), vaccine_code: 'CAT_POLYVALENT' },
    ];
    open(lista);
    expect(screen.queryByText('Não preciso mais deste lembrete')).toBeNull();
    expect(screen.queryByText(/vale revisar|para revisar/)).toBeNull();
  });

  it('o caso do Percy: V5 antiga × V4 nova são vacinas diferentes — o app NÃO decide: a V5 segue em Revisar, com aviso neutro e a escolha do tutor', () => {
    const onDismiss = open([vac('p2', 'V5', 'multiple', d(-680), d(-674)), vac('p4', 'V4', 'multiple', d(-4), d(361))]);
    expect(screen.getAllByText(/vale revisar|para revisar/).length).toBeGreaterThan(0);                // continua pendente
    const aviso = screen.getByText(/Há um registro mais recente de vacina polivalente: V4/);
    expect(aviso.textContent).toContain('Se o seu veterinário considerou este registro atendido');   // informa, não julga
    expect(aviso.textContent).not.toMatch(/substitu|equivale|cobre|não precisa/i);                      // sem afirmação clínica
    fireEvent.click(screen.getByText('Não preciso mais deste lembrete'));                              // decisão do tutor
    expect((onDismiss.mock.calls[0][0] as { id: string }).id).toBe('p2');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MedicationItemSheet } from './MedicationItemSheet';
import type { PetEventRecord } from '@/lib/petEvents';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

// Achado real (29/09/2026): a tela mostrava "Nenhum remédio em andamento"
// por um instante — antes do fetch de petEvents terminar — mesmo pra pet
// que JÁ tem medicação cadastrada, e só depois trocava pro conteúdo certo.
// `eventsLoading` existe pra distinguir "ainda carregando" de "realmente
// vazio"; estes testes travam que a tela usa esse sinal corretamente.

afterEach(() => cleanup());

const baseProps = {
  petId: 'pet-1',
  petName: 'Baby',
  petSpecies: 'dog',
  petPhotoUrl: null,
  onClose: vi.fn(),
  onRefresh: vi.fn().mockResolvedValue(undefined),
};

function renderSheet(overrides: Partial<React.ComponentProps<typeof MedicationItemSheet>> = {}) {
  return render(
    <MedicationItemSheet
      {...baseProps}
      petEvents={[]}
      eventsLoading={false}
      {...overrides}
    />,
  );
}

describe('MedicationItemSheet — não mostra "vazio" enquanto ainda está carregando', () => {
  it('com eventsLoading=true e sem dados ainda, NÃO mostra "Nenhum remédio em andamento"', () => {
    renderSheet({ eventsLoading: true, petEvents: [] });
    expect(screen.queryByText(/Nenhum remédio em andamento/i)).toBeNull();
  });

  it('com eventsLoading=false e sem dados de verdade, mostra "Nenhum remédio em andamento"', () => {
    renderSheet({ eventsLoading: false, petEvents: [] });
    expect(screen.getByText(/Nenhum remédio em andamento/i)).toBeTruthy();
  });

  it('badge do cabeçalho mostra "Carregando…" em vez de "Nenhuma medicação" enquanto eventsLoading=true', () => {
    renderSheet({ eventsLoading: true, petEvents: [] });
    expect(screen.getByText('Carregando…')).toBeTruthy();
    expect(screen.queryByText('Nenhuma medicação')).toBeNull();
  });

  it('quando os dados chegam (petEvents preenchido) mesmo com eventsLoading=false, mostra o conteúdo real', () => {
    const ev: PetEventRecord = {
      id: 'ev-1',
      pet_id: 'pet-1',
      type: 'medicacao',
      title: 'Amoxicilina',
      scheduled_at: '2026-09-20T08:00:00',
      status: 'active',
      extra_data: JSON.stringify({ treatment_days: 5, applied_dates: ['2026-09-20'] }),
    } as unknown as PetEventRecord;
    renderSheet({ eventsLoading: false, petEvents: [ev] });
    expect(screen.queryByText(/Nenhum remédio em andamento/i)).toBeNull();
  });
});

// Achado real (11/10/2026): o único jeito de pular um dia era toque-e-segure
// (480ms) num texto pequeno embaixo da grade, sem nenhum botão visível —
// "difícil demais pro tutor adivinhar" (relato de tutor real sobre doses
// perdidas sem explicação). Tocar num dia atrasado/hoje agora abre um menu
// com as duas opções à vista, em vez de aplicar a dose na hora.
describe('MedicationItemSheet — dia atrasado abre menu "tomou ou pulou" (em vez de toque-e-segure escondido)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T12:00:00'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function medEvent(): PetEventRecord {
    return {
      id: 'ev-cisti',
      pet_id: 'pet-1',
      type: 'medicacao',
      title: 'Cistimicin',
      scheduled_at: '2026-10-05T08:00:00',
      status: 'active',
      extra_data: JSON.stringify({
        frequency_mode: 'vezes_dia', times_per_day: 1, first_dose_time: '08:00',
        reminder_times: ['08:00'], treatment_days: 30, applied_dates: [],
      }),
    } as unknown as PetEventRecord;
  }

  it('toca no dia de hoje (atrasado, sem dose) → menu abre com as duas opções visíveis', () => {
    renderSheet({ eventsLoading: false, petEvents: [medEvent()] });
    fireEvent.click(screen.getByTitle('12/10 — toque pra marcar tomada ou pular o dia'));
    expect(screen.getByText('Marcar como tomada')).toBeTruthy();
    expect(screen.getByText('Pular este dia')).toBeTruthy();
  });

  it('"Pular este dia" chama skip-dose com a data certa', async () => {
    renderSheet({ eventsLoading: false, petEvents: [medEvent()] });
    fireEvent.click(screen.getByTitle('12/10 — toque pra marcar tomada ou pular o dia'));
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    await act(async () => { fireEvent.click(screen.getByText('Pular este dia')); });
    expect(fetchMock).toHaveBeenCalled();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/events/ev-cisti/skip-dose');
    expect(JSON.parse(opts.body)).toEqual({ date: '2026-10-12' });
  });

  it('"Marcar como tomada" chama apply-dose com a data certa', async () => {
    renderSheet({ eventsLoading: false, petEvents: [medEvent()] });
    fireEvent.click(screen.getByTitle('12/10 — toque pra marcar tomada ou pular o dia'));
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    await act(async () => { fireEvent.click(screen.getByText('Marcar como tomada')); });
    expect(fetchMock).toHaveBeenCalled();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/events/ev-cisti/apply-dose');
    expect(JSON.parse(opts.body)).toEqual({ date: '2026-10-12' });
  });

  it('"Cancelar" fecha o menu sem chamar a API', () => {
    renderSheet({ eventsLoading: false, petEvents: [medEvent()] });
    fireEvent.click(screen.getByTitle('12/10 — toque pra marcar tomada ou pular o dia'));
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByText('Marcar como tomada')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

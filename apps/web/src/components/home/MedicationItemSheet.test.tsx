import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MedicationItemSheet } from './MedicationItemSheet';
import type { PetEventRecord } from '@/lib/petEvents';

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

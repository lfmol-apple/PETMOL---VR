import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/I18nContext', () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ tutor: { id: 'tutor-1' } }) }));
vi.mock('@/features/commerce/AffiliateCatalogSearch', () => ({ AffiliateCatalogSearch: () => null }));
vi.mock('@/components/CoachMark', () => ({ CoachMark: () => null }));

import { QuickAddVaccineModal } from './QuickAddVaccineModal';
import { VaccineItemSheet } from './VaccineItemSheet';
import { VaccineDateStep } from './VaccineDateStep';

// 24/09/2026, meio-dia LOCAL (independe do fuso onde o teste roda)
const NOW = new Date(2026, 8, 24, 12, 0, 0);

/** As quatro datas do pedido, relativas a NOW. */
const CASES = [
  ['hoje', '2026-09-24'],
  ['ontem', '2026-09-23'],
  ['há seis meses', '2026-03-24'],
  ['há um ano', '2025-09-24'],
] as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const dateInput = () => screen.getByLabelText(/Data da aplicação/) as HTMLInputElement;

describe('VaccineDateStep', () => {
  it('sugere hoje, mostra a data claramente e não deixa escolher o futuro', () => {
    render(<VaccineDateStep vaccineName="Antirrábica" onSave={vi.fn()} />);
    expect(dateInput().value).toBe('2026-09-24');
    expect(dateInput().max).toBe('2026-09-24');
    expect(screen.getByText(/A próxima dose é calculada a partir dela/)).toBeTruthy();
  });

  it('data futura ou apagada desabilita Salvar e avisa', () => {
    const onSave = vi.fn();
    render(<VaccineDateStep vaccineName="Antirrábica" onSave={onSave} />);
    fireEvent.change(dateInput(), { target: { value: '2026-09-25' } });
    expect((screen.getByText('Salvar vacina') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/não pode ser no futuro/);
    fireEvent.change(dateInput(), { target: { value: '' } });
    expect((screen.getByText('Salvar vacina') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Salvar vacina'));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('Registro rápido (modal) — escolher a vacina NÃO salva; a data é do tutor', () => {
  const vaccines = [{ type: 'multiple' as const, name: 'V10', icon: '💉', code: 'DOG_POLYVALENT_V8' }];

  function open() {
    const handle = vi.fn().mockResolvedValue(undefined);
    const onOpenFullForm = vi.fn();
    render(<QuickAddVaccineModal quickAddData={{ vaccine_type: 'rabies', vaccine_name: '', date_administered: '', next_dose_date: '', veterinarian: '' }}
      commonVaccines={vaccines} handleQuickAddVaccine={handle} onClose={vi.fn()} onOpenFullForm={onOpenFullForm} />);
    fireEvent.click(screen.getByText('V10 / V8'));
    return { handle, onOpenFullForm };
  }

  it('tocar na vacina só abre o passo de data (nada gravado)', () => {
    const { handle } = open();
    expect(handle).not.toHaveBeenCalled();
    expect(dateInput().value).toBe('2026-09-24');
    expect(screen.queryByText('Esse mês')).toBeNull();     // data "1º do mês" inventada saiu
  });

  it.each(CASES)('vacina aplicada %s (%s) é salva com essa data exata', async (_l, iso) => {
    const { handle } = open();
    fireEvent.change(dateInput(), { target: { value: iso } });
    fireEvent.click(screen.getByText('Salvar vacina'));
    await waitFor(() => expect(handle).toHaveBeenCalledTimes(1));
    expect(handle.mock.calls[0][0]).toMatchObject({ type: 'multiple', code: 'DOG_POLYVALENT_V8' });
    expect(handle.mock.calls[0][1]).toBe('today');
    expect(handle.mock.calls[0][2]).toBe(iso);
  });

  it('"Não lembro a data" segue existindo e NÃO manda data (registro fica como estimativa)', async () => {
    const { handle } = open();
    fireEvent.click(screen.getByText('Não lembro a data'));
    await waitFor(() => expect(handle).toHaveBeenCalledTimes(1));
    expect(handle.mock.calls[0][1]).toBe('unknown');
    expect(handle.mock.calls[0][2]).toBeUndefined();
  });

  it('a vacina escolhida não se perde ao ir pro formulário completo', () => {
    const { onOpenFullForm } = open();
    fireEvent.click(screen.getByText('health.full_form'));
    expect(onOpenFullForm).toHaveBeenCalledWith({ vaccine_type: 'multiple', vaccine_name: 'V10' });
  });
});

describe('Carteirinha — o chip do registro rápido não grava mais direto com a data de hoje', () => {
  function openSheet(overrides: Record<string, unknown> = {}) {
    const onDirectSaveVaccine = vi.fn().mockResolvedValue(undefined);
    const onFullFormVaccine = vi.fn();
    render(<VaccineItemSheet petId="p1" petName="Rex" petSpecies="dog" vaccines={[]}
      onClose={vi.fn()} onQuickAdd={vi.fn()} onFullFormVaccine={onFullFormVaccine}
      onDirectSaveVaccine={onDirectSaveVaccine} onEditVaccine={vi.fn()} onDeleteVaccine={vi.fn()}
      onDeleteAllVaccines={vi.fn()} onRefreshVaccines={vi.fn()} pendingCardFiles={[]}
      setPendingCardFiles={vi.fn()} importingCard={false} handleFilesSelectedAppend={vi.fn()}
      handleProcessCards={vi.fn()} {...overrides} />);
    fireEvent.click(screen.getByText('Registro rápido'));            // expande o bloco
    return { onDirectSaveVaccine, onFullFormVaccine };
  }

  it('tocar no chip abre o passo de data e NÃO salva', () => {
    const { onDirectSaveVaccine } = openSheet();
    fireEvent.click(screen.getByText('Antirrábica'));
    expect(onDirectSaveVaccine).not.toHaveBeenCalled();
    expect(dateInput().value).toBe('2026-09-24');
    expect(screen.getByText('Cancelar')).toBeTruthy();
  });

  it.each(CASES)('vacina aplicada %s (%s): salva com a data escolhida', async (_l, iso) => {
    const { onDirectSaveVaccine } = openSheet();
    fireEvent.click(screen.getByText('Antirrábica'));
    fireEvent.change(dateInput(), { target: { value: iso } });
    fireEvent.click(screen.getByText('Salvar vacina'));
    await waitFor(() => expect(onDirectSaveVaccine).toHaveBeenCalledTimes(1));
    expect(onDirectSaveVaccine.mock.calls[0][0]).toMatchObject({ type: 'rabies', code: 'rabies' });
    expect(onDirectSaveVaccine.mock.calls[0][2]).toBe(iso);
  });

  it('cancelar volta pra lista de vacinas sem gravar nada', () => {
    const { onDirectSaveVaccine } = openSheet();
    fireEvent.click(screen.getByText('Antirrábica'));
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onDirectSaveVaccine).not.toHaveBeenCalled();
    expect(screen.getByText('Tosse dos canis')).toBeTruthy();       // lista de chips de volta
  });

  it('sem salvamento direto disponível, cai no formulário completo (que já tem o seletor de data)', () => {
    const { onFullFormVaccine } = openSheet({ onDirectSaveVaccine: undefined });
    fireEvent.click(screen.getByText('Antirrábica'));
    expect(onFullFormVaccine).toHaveBeenCalledWith(expect.objectContaining({ vaccine_type: 'rabies', date_administered: '2026-09-24' }));
  });
});

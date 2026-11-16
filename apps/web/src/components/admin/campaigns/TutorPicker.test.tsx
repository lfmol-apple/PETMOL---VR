import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ searchTutors: vi.fn(), lookupTutors: vi.fn() }));
vi.mock('./api', () => api);
import { TutorPicker } from './TutorPicker';
import { buildFilter, defaultCond, describeCond, emptyFilter } from './filters';

const field = { field: 'tutor_selected', label: 'Tutores escolhidos por mim (um a um)', group: 'Tutor', scope: 'tutor' as const, ops: ['in'], values: null, approximate: false, origin: 'Escolha manual', precision: 'exata' };

describe('TutorPicker', () => {
  afterEach(() => cleanup());

  it('busca, marca e desmarca tutores; avisa quem não recebe push', async () => {
    api.searchTutors.mockResolvedValue({ tutors: [
      { id: 'u1', name: 'Maria Silva', email: 'm@x.com', pets: ['Thor'], reachable: true },
      { id: 'u2', name: 'João', email: 'j@x.com', pets: [], reachable: false },
    ] });
    const onChange = vi.fn();
    const { rerender } = render(<TutorPicker value={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Buscar tutor/), { target: { value: 'ma' } });
    expect(await screen.findByText('Maria Silva')).toBeTruthy();
    expect(screen.getByText(/não recebe push/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Escolher Maria Silva'));
    expect(onChange).toHaveBeenCalledWith(['u1']);
    rerender(<TutorPicker value={['u1']} onChange={onChange} />);
    await waitFor(() => expect(screen.getByText('Escolhidos: 1')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Tirar Maria Silva'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('filtro: exige ao menos 1 tutor e envia só a lista de ids', () => {
    const c = defaultCond(field);
    const st = { ...emptyFilter(), blocks: [{ id: 'b', op: 'and' as const, petScope: 'any' as const, conds: [c] }] };
    expect(buildFilter(st, [field]).ready).toBe(false);
    c.value = ['u1', 'u2'];
    const built = buildFilter(st, [field]);
    expect(built.ready).toBe(true);
    expect(JSON.stringify(built.filter)).toContain('"field":"tutor_selected","op":"in","value":["u1","u2"]');
    expect(describeCond(c, field)).toBe('Tutores escolhidos por mim (um a um): 2 tutores');
  });
});

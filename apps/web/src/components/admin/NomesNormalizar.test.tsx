import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ adminApi: vi.fn() }));
vi.mock('@/components/admin/AdminUi', async (orig) => ({ ...(await orig<object>()), adminApi: api.adminApi }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => 't' }));
import { NomesNormalizar, type NamesResp } from './NomesNormalizar';

const base: NamesResp = { reachable: 100, classified: 60, classified_percent: 60, by_ibge: 55, by_manual: 5, by_email: 0, unusable_name: 2, pending_tutors: 40, pending_names: 2, enabled: true,
  pending: [{ key: 'ZILDA', name: 'Zilda', tutors: 3 }, { key: 'ORLEI', name: 'Orlei', tutors: 1 }], decided: [{ key: 'ADAIR', sex: 'female' }] };

describe('Normalizar nomes (página temporária)', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());
  it('mostra a cobertura, grava só primeiro nome → sexo e permite desfazer; nunca mostra e-mail', async () => {
    api.adminApi.mockImplementation(async (path: string, init?: RequestInit) => (!init ? base : { ok: true }));
    render(<NomesNormalizar />);
    await screen.findByText('Zilda');
    expect(screen.getByText('60%')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/@/);
    fireEvent.click(screen.getAllByRole('button', { name: 'Mulher' })[0]);
    await waitFor(() => expect(api.adminApi.mock.calls.some(([p, i]) => p === '/tutor-names/ZILDA' && i?.method === 'PUT' && JSON.parse(i.body).sex === 'female')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer ADAIR' }));
    await waitFor(() => expect(api.adminApi.mock.calls.some(([p, i]) => p === '/tutor-names/ADAIR' && i?.method === 'DELETE')).toBe(true));
  });
  it('avisa quando o filtro Tutor/Tutora ainda está desligado', async () => {
    api.adminApi.mockResolvedValue({ ...base, enabled: false });
    render(<NomesNormalizar />);
    expect(await screen.findByText(/desligado em produção/)).toBeTruthy();
  });
});

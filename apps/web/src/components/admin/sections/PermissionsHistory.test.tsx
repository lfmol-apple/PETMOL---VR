import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

import { PermissionsHistory } from './PermissionsHistory';

const snap = (id: string, kind: string, taken_at: string, v: Record<string, number>) => ({
  id, kind, taken_at, total_users: 63, push_ios: 22, push_android: 15, push_web: 4, only_push: 0, only_location: 0,
  push_active: 40, gps: 30, gps_fresh: 18, both: 25, neither: 18, ...v,
});
const BASE = snap('s1', 'baseline', '2026-09-24T23:00:00Z', {});
const LATER = snap('s2', 'daily', '2026-10-05T23:00:00Z', { gps_fresh: 27, neither: 12, push_active: 44 });
let calls: { url: string; method?: string }[];
let items: unknown[];

beforeEach(() => {
  calls = [];
  items = [BASE];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method });
    if (init?.method === 'POST') { items = [BASE, LATER]; return { ok: true, json: async () => ({ items }) } as Response; }
    return { ok: true, json: async () => ({ items }) } as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Evolução das permissões', () => {
  it('só com a linha de base: mostra a data (horário de São Paulo) e os valores de partida', async () => {
    render(<PermissionsHistory />);
    expect(await screen.findByText(/Linha de base gravada em/)).toBeTruthy();
    expect(screen.getByText('24/09/26 20:00')).toBeTruthy();              // 23:00 UTC = 20:00 em SP
    expect(screen.getByText('Localização atualizada (30 dias)')).toBeTruthy();
    expect(screen.queryByText(/sem mudança/)).toBeNull();                  // ainda não há comparação
  });

  it('"Gravar agora" faz POST e passa a mostrar a evolução (ganho verde, queda de "nenhum" também é ganho)', async () => {
    render(<PermissionsHistory />);
    fireEvent.click(await screen.findByText('Gravar agora'));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/permissions/snapshots'))).toBe(true));
    await screen.findByText('+9');                                         // GPS atualizado 18 → 27
    const down = screen.getByText('-6');                                   // "nenhum dos dois" 18 → 12
    expect(down.className).toMatch(/emerald/);                             // caiu = bom
    expect(screen.getByText('+4').className).toMatch(/emerald/);
    expect(screen.getAllByText('sem mudança').length).toBeGreaterThan(0);
  });

  it('lista todas as fotografias ao pedir', async () => {
    items = [BASE, LATER];
    render(<PermissionsHistory />);
    fireEvent.click(await screen.findByText('ver as 2 fotografias'));
    expect(await screen.findByText('Linha de base')).toBeTruthy();
    expect(screen.getByText('Diária')).toBeTruthy();
  });
});

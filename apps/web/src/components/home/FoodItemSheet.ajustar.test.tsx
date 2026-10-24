import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/v1Metrics', () => ({ trackV1Metric: vi.fn() }));
vi.mock('@/lib/backStack', () => ({ useBackHandler: () => undefined }));
vi.mock('@/components/ModalPortal', () => ({ ModalPortal: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/features/interactions/usePushOneTimeAsk', () => ({ usePushOneTimeAsk: () => ({ shouldAsk: false, markAsked: vi.fn() }) }));
vi.mock('@/features/interactions/useNotificationPermissionController', () => ({
  useNotificationPermissionController: () => ({ permission: 'granted', requestPermission: vi.fn(), subscribeToPush: vi.fn() }),
}));
vi.mock('@/features/commerce/homeContextualCommerce', () => ({ resolveFoodCommerceSnapshot: vi.fn(async () => null) }));
vi.mock('@/features/commerce/MonetizedOffersList', () => ({ MonetizedOffersList: () => null }));
vi.mock('@/features/commerce/AffiliateCatalogSearch', () => ({ AffiliateCatalogSearch: () => null }));
vi.mock('@/components/CoachMark', () => ({ CoachMark: () => null }));
vi.mock('@/components/FoodControlTab', () => ({ FoodControlTab: () => null }));
vi.mock('@/components/ProductBarcodeScanner', () => ({
  ProductBarcodeScanner: (p: { label?: string; onProductConfirmed?: (x: unknown) => void }) => (
    <button type="button" onClick={() => p.onProductConfirmed?.({ barcode: '789', name: 'Premier Pet Adultos', category: 'food', found: true })}>
      {p.label ?? 'scanner'}
    </button>
  ),
}));

import { FoodItemSheet } from './FoodItemSheet';

const calls: { url: string; method: string; body?: string }[] = [];
const pet = { pet_id: 'p1', pet_name: 'Thor', species: 'dog', sex: 'male' } as never;

function isoDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const mkPlan = (duration: number) => ({
  species: 'dog', country_code: 'BR', enabled: true, mode: 'kibble', food_brand: 'Ração Premium Adulto',
  package_size_kg: 10, daily_amount_g: 333, duration_days: duration, last_refill_date: isoDaysAgo(12),
  items: [{ id: 'i1', food_brand: 'Ração Premium Adulto', package_size_kg: 10, duration_days: duration, last_refill_date: isoDaysAgo(12), is_primary: true, mode: 'kibble' }],
});

let current = mkPlan(30);

beforeEach(() => {
  calls.length = 0;
  current = mkPlan(30);
  (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => undefined;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit): Promise<unknown> => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (String(url).includes('/feeding/plan/adjust')) {
      const b = JSON.parse(String(init?.body));
      const to = b.duration_days;
      const previous = current.duration_days;
      current = mkPlan(to);
      return { ok: true, status: 200, json: async () => ({ status: 'ok', previous_duration_days: previous, duration_days: to }), text: async (): Promise<string> => '' };
    }
    return { ok: true, status: 200, json: async () => ({ status: 'ok', pet_id: 'p1', plan: current, estimate: null }), text: async (): Promise<string> => '' };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('FoodItemSheet — Editar duração', () => {
  it('link no card → tutor escolhe os dias → aviso com Desfazer que restaura a duração', async () => {
    render(<FoodItemSheet pet={pet} onClose={vi.fn()} initialPlan={current as never} />);
    fireEvent.click(await screen.findByText('Editar duração'));
    fireEvent.change(await screen.findByLabelText('Duração em dias'), { target: { value: '21' } });
    fireEvent.click(screen.getByText('Salvar duração'));

    expect(await screen.findByText(/Duração alterada de/)).toBeTruthy();
    const adj = calls.find((c) => c.url.includes('/plan/adjust'))!;
    expect(JSON.parse(adj.body!)).toEqual({ action: 'set_duration', duration_days: 21 });

    fireEvent.click(screen.getByText('Desfazer'));
    await waitFor(() => {
      const undo = calls.filter((c) => c.url.includes('/plan/adjust'))[1];
      expect(undo && JSON.parse(undo.body!)).toEqual({ action: 'set_duration', duration_days: 30 });
    });
    await waitFor(() => expect(screen.queryByText(/Duração alterada de/)).toBeNull());
  });
});

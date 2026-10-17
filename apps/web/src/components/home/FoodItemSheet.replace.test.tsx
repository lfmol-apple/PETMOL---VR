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

const calls: { url: string; method: string }[] = [];
const pet = { pet_id: 'p1', pet_name: 'Marley', species: 'dog' } as never;
const plan = {
  species: 'dog', country_code: 'BR', enabled: true, mode: 'kibble', food_brand: 'Royal Canin Urinary',
  package_size_kg: 7, daily_amount_g: 150, last_refill_date: '2026-09-02', items: [
    { id: 'i1', food_brand: 'Royal Canin Urinary', package_size_kg: 7, daily_amount_g: 150, is_primary: true, mode: 'kibble' },
  ],
} as never;

beforeEach(() => {
  calls.length = 0;
  (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => undefined;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    return { ok: true, status: init?.method === 'DELETE' ? 204 : 200, json: async () => ({ status: 'ok', pet_id: 'p1', plan }), text: async () => '' };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('FoodItemSheet — Trocar ração', () => {
  it('abrir e cancelar NÃO apaga a ração atual', async () => {
    render(<FoodItemSheet pet={pet} onClose={vi.fn()} initialPlan={plan} />);
    fireEvent.click(await screen.findByText('Trocar ração'));
    expect(await screen.findByText('Como Marley se alimenta?')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('escolher a nova ração encerra a antiga como "switched"', async () => {
    render(<FoodItemSheet pet={pet} onClose={vi.fn()} initialPlan={plan} />);
    fireEvent.click(await screen.findByText('Trocar ração'));
    fireEvent.click(await screen.findByText('Escanear código de barras'));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('reason=switched'))).toBe(true));
  });
});

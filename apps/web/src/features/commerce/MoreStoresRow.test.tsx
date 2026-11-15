import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const nav = vi.hoisted(() => ({ navigateToPartnerUrl: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));
vi.mock('@/lib/analytics/click', () => ({ trackClick: vi.fn() }));
vi.mock('@/features/interactions/userPromptChannel', () => ({ showAppToast: vi.fn() }));
vi.mock('@/lib/clipboard', () => ({ copyText: vi.fn().mockResolvedValue(true) }));

import * as partners from './homeShoppingPartners';
import { MoreStoresRow } from './MoreStoresRow';

beforeEach(() => { vi.spyOn(window, 'open').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Ver em outras lojas', () => {
  it('Amazon: o MESMO link de afiliado da Loja (com etiqueta), só com a busca trocada pelo termo', () => {
    const amazon = partners.HOME_SHOPPING_PARTNERS.find((p) => p.id === 'amazon')!;
    const base = new URL(partners.resolvePartnerUrl(amazon, '', '')!);
    expect(partners.openPartnerAffiliateLink(amazon, { surface: 't', term: 'gel dental canino' })).toBe(true);
    const opened = new URL(String((window.open as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]));
    expect(opened.hostname).toBe(base.hostname);
    expect(opened.searchParams.get('tag')).toBe(base.searchParams.get('tag'));
    expect(opened.searchParams.get('tag')).toBeTruthy();
    expect(opened.searchParams.get('k')).toBe('gel dental canino');
  });

  it('mostra as três opções com os rótulos pedidos', () => {
    render(<MoreStoresRow term="shampoo" source="t" />);
    expect(screen.getByRole("button", { name: "Ver na Amazon" })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver no Mercado Livre' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver na Shopee' })).toBeTruthy();
  });

  it('Shopee e Mercado Livre abrem o link curto de afiliado (nunca busca sem comissão) e copiam o termo', async () => {
    const copy = vi.fn().mockResolvedValue(true);
    const r1 = await partners.openMoreStore('shopee', 'gel dental', copy);
    expect(r1).toEqual({ opened: true, copied: true });
    expect(copy).toHaveBeenCalledWith('gel dental');
    const shopee = partners.HOME_SHOPPING_PARTNERS.find((p) => p.id === 'shopee')!;
    expect(partners.resolvePartnerUrl(shopee, '', '')).toMatch(/^https:\/\/s\.shopee\.com\.br\//);
    const ml = partners.HOME_SHOPPING_PARTNERS.find((p) => p.id === 'mercadolivre')!;
    expect(partners.resolvePartnerUrl(ml, '', '')).toMatch(/^https:\/\/meli\.la\//);
    expect((await partners.openMoreStore('mercadolivre', '', copy)).copied).toBe(false);   // sem termo, nada a copiar
  });

  it('o clique na Amazon abre a URL com tag', async () => {
    render(<MoreStoresRow term="areia higiênica" source="t" />);
    fireEvent.click(screen.getByRole("button", { name: "Ver na Amazon" }));
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    const opened = String((window.open as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(opened).toContain('amazon.com.br/s?k=');
    expect(opened).toContain('tag=');
  });
});

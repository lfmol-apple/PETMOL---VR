/**
 * Bug real 11/09/2026: "o preço não carrega de primeira, só depois de
 * fechar/reabrir o app". Causa raiz no backend (ver
 * services/price-service/tests/test_commerce_offers_enrichment_pending.py):
 * na 1ª consulta de um produto nunca visto, o enriquecimento de identidade
 * podia não terminar a tempo — o backend agora sinaliza
 * status="enrichment_pending" nesse caso em vez de fingir "sem oferta".
 *
 * Este arquivo testa a ponta que fecha o ciclo: useCommerceOffers precisa
 * tentar de novo automaticamente (bounded, com backoff curto) até o
 * backend responder "ready" — sem exigir nenhuma ação do usuário, tudo na
 * MESMA abertura do app.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommerceOffers } from './useCommerceOffers';
import * as productPricing from './productPricing';
import type { CommerceOffer } from './productPricing';

const fakeOffer: CommerceOffer = {
  merchant: 'cobasi',
  url: 'https://www.cobasi.com.br/produto/p',
  link_type: 'affiliate_product',
  price: 49.9,
};

describe('useCommerceOffers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('1) produto já enriquecido: uma chamada, status ready, sem retry', async () => {
    const spy = vi
      .spyOn(productPricing, 'fetchCommerceOffersWithStatus')
      .mockResolvedValue({ offers: [fakeOffer], status: 'ready' });

    const { result } = renderHook(() => useCommerceOffers('Ração X', 7.5, '789'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.offers).toEqual([fakeOffer]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('2/4) produto realmente sem oferta (ready + []) não gera retry', async () => {
    const spy = vi
      .spyOn(productPricing, 'fetchCommerceOffersWithStatus')
      .mockResolvedValue({ offers: [], status: 'ready' });

    const { result } = renderHook(() => useCommerceOffers('Produto Sem Oferta', undefined, '000'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.offers).toEqual([]);

    // avança bem além de qualquer backoff — se fosse retry indevido,
    // spy teria mais de 1 chamada.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('3) enrichment lento resolve automaticamente: pending → pending → ready, sem interação do usuário', async () => {
    const spy = vi
      .spyOn(productPricing, 'fetchCommerceOffersWithStatus')
      .mockResolvedValueOnce({ offers: [], status: 'enrichment_pending' })
      .mockResolvedValueOnce({ offers: [], status: 'enrichment_pending' })
      .mockResolvedValueOnce({ offers: [fakeOffer], status: 'ready' });

    const { result } = renderHook(() => useCommerceOffers('Produto Novo', undefined, '111'));

    // 1ª tentativa: ainda "Buscando..."
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loading).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    // avança o 1º backoff (600ms) → 2ª tentativa, ainda pendente
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(result.current.loading).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);

    // avança o 2º backoff (1300ms) → 3ª tentativa, agora ready com preço
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.offers).toEqual([fakeOffer]);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('enrichment falha definitivamente (pending sem fim): para no limite de tentativas, nunca loop infinito', async () => {
    const spy = vi
      .spyOn(productPricing, 'fetchCommerceOffersWithStatus')
      .mockResolvedValue({ offers: [], status: 'enrichment_pending' });

    const { result } = renderHook(() => useCommerceOffers('Sempre Pendente', undefined, '222'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // tentativa 1
      await vi.advanceTimersByTimeAsync(700); // tentativa 2
      await vi.advanceTimersByTimeAsync(1400); // tentativa 3 (última — RETRY_DELAYS_MS tem só 2 backoffs)
    });

    expect(result.current.loading).toBe(false); // desiste, não fica pendurado pra sempre
    expect(result.current.offers).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(3);

    // nenhuma tentativa a mais, mesmo esperando bem mais
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('5) desmontar o componente cancela retries pendentes', async () => {
    const spy = vi
      .spyOn(productPricing, 'fetchCommerceOffersWithStatus')
      .mockResolvedValue({ offers: [], status: 'enrichment_pending' });

    const { unmount } = renderHook(() => useCommerceOffers('Produto Qualquer', undefined, '333'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // 1ª tentativa dispara
    });
    expect(spy).toHaveBeenCalledTimes(1);

    unmount();

    // mesmo avançando o tempo dos backoffs depois de desmontado, não pode
    // disparar mais nenhuma chamada
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('7) trocar de produto (logout/login, ou card seguinte) não herda o estado de retry do anterior', async () => {
    const spy = vi
      .spyOn(productPricing, 'fetchCommerceOffersWithStatus')
      .mockResolvedValueOnce({ offers: [], status: 'enrichment_pending' }) // produto A, tentativa 1
      .mockResolvedValueOnce({ offers: [], status: 'enrichment_pending' }); // produto B (nova conta), tentativa 1 — não "tentativa 2" de A

    const { result, rerender } = renderHook(
      ({ gtin }: { gtin: string }) => useCommerceOffers('Produto', undefined, gtin),
      { initialProps: { gtin: 'PRODUTO_A' } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith('Produto', undefined, 'PRODUTO_A');

    // troca de produto/conta ANTES do 1º backoff de A completar
    spy.mockResolvedValueOnce({ offers: [{ ...fakeOffer, merchant: 'cobasi' }], status: 'ready' });
    rerender({ gtin: 'PRODUTO_B' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenLastCalledWith('Produto', undefined, 'PRODUTO_B');

    // avançar o tempo não deve fazer o efeito antigo (de A) contaminar o
    // estado atual (de B) com uma tentativa fantasma
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.loading).toBe(false);
  });
});

'use client';

import { useEffect, useState } from 'react';
import { fetchCommerceOffers, type CommerceOffer } from './productPricing';

/**
 * Fonte única de ofertas monetizáveis — usada por toda tela de "Comprar
 * novamente" (Home, ficha da ração, ficha de antiparasitário). Mesma
 * query/peso/GTIN/nome/marca reais sempre resolvem a mesma lista.
 *
 * `gtin` é opcional (ver fetchCommerceOffers). `name`/`brand` são opcionais
 * e ajudam a Cobasi a resolver quando `query` vem pobre.
 *
 * Discovery on-demand da Shopee: a primeira abertura pode agendar a busca
 * da oferta no servidor e voltar sem Shopee. Quando há GTIN e a primeira
 * resposta não trouxe Shopee, este hook faz UMA única reconsulta atrasada
 * (sem polling, sem loop) — se o discovery terminou rápido, a oferta
 * aparece; se não, a lista segue sem Shopee, sem travar a UI.
 */
const SHOPEE_DISCOVERY_RETRY_MS = 4500;

export function useCommerceOffers(
  query: string,
  packageSizeKg?: number | null,
  gtin?: string | null,
  enabled = true,
  extra?: { name?: string | null; brand?: string | null; species?: string | null },
) {
  const [offers, setOffers] = useState<CommerceOffer[]>([]);
  const [loading, setLoading] = useState(enabled);
  const name = extra?.name ?? undefined;
  const brand = extra?.brand ?? undefined;
  const species = extra?.species ?? undefined;

  useEffect(() => {
    if (!enabled) {
      setOffers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setOffers([]);

    const lookup = {
      query,
      packageSizeKg: packageSizeKg ?? undefined,
      gtin: gtin ?? undefined,
      name: name ?? undefined,
      brand: brand ?? undefined,
      species: species ?? undefined,
    };

    fetchCommerceOffers(lookup).then((result) => {
      if (cancelled) return;
      setOffers(result);
      setLoading(false);

      const hasShopee = result.some((o) => o.merchant === 'shopee');
      if (!hasShopee && gtin) {
        // Uma única reconsulta controlada — nunca em loop.
        retryTimer = setTimeout(() => {
          fetchCommerceOffers(lookup).then((retry) => {
            if (cancelled) return;
            if (retry.some((o) => o.merchant === 'shopee') || retry.length > result.length) {
              setOffers(retry);
            }
          });
        }, SHOPEE_DISCOVERY_RETRY_MS);
      }
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [query, packageSizeKg, gtin, enabled, name, brand, species]);

  return { offers, loading };
}

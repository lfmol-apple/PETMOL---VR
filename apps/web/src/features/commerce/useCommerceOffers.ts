'use client';

import { useEffect, useState } from 'react';
import { fetchCommerceOffers, type CommerceOffer } from './productPricing';

/**
 * Fonte única de ofertas monetizáveis — usada por toda tela de "Comprar
 * novamente" (Home, ficha da ração, ficha de antiparasitário). Mesma
 * query/peso/GTIN reais sempre resolvem a mesma lista, em qualquer tela.
 *
 * `gtin` é opcional (ver fetchCommerceOffers) — nenhuma tela hoje tem
 * GTIN disponível, então nenhuma precisa passar isso ainda.
 */
export function useCommerceOffers(query: string, packageSizeKg?: number | null, gtin?: string | null) {
  const [offers, setOffers] = useState<CommerceOffer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setOffers([]);
    fetchCommerceOffers(query, packageSizeKg ?? undefined, gtin ?? undefined).then((result) => {
      if (!cancelled) {
        setOffers(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [query, packageSizeKg, gtin]);

  return { offers, loading };
}

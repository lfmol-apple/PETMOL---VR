'use client';

import { useEffect, useState } from 'react';
import { fetchCommerceOffers, type CommerceOffer } from './productPricing';

/**
 * Fonte única de ofertas monetizáveis — usada por toda tela de "Comprar
 * novamente" (Home, ficha da ração, ficha de antiparasitário). Mesma
 * query/peso/GTIN reais sempre resolvem a mesma lista, em qualquer tela.
 *
 * `gtin` é opcional (ver fetchCommerceOffers) — ração e antiparasitário
 * passam hoje (via barcode escaneado, ver petCareDomain.ts
 * processFood/processParasite e MonetizedOffersListProps.gtin); nem toda
 * tela tem um GTIN real disponível, então segue opcional.
 */
export function useCommerceOffers(query: string, packageSizeKg?: number | null, gtin?: string | null) {
  const [offers, setOffers] = useState<CommerceOffer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setOffers([]);
    fetchCommerceOffers(query, packageSizeKg ?? undefined, gtin ?? undefined)
      .then((result) => {
        if (!cancelled) {
          setOffers(result);
          setLoading(false);
        }
      })
      // fetchCommerceOffers já captura erro de rede internamente e resolve
      // com [], mas sem este catch qualquer rejeição inesperada (ex.: um
      // throw síncrono antes do try interno) deixava `loading` preso em
      // `true` pra sempre — "Buscando opções de compra..." nunca saía da
      // tela (achado em produção, card do "Loja do Pet" no primeiro boot).
      .catch(() => {
        if (!cancelled) {
          setOffers([]);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [query, packageSizeKg, gtin]);

  return { offers, loading };
}

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

    // Rede de segurança: fetchCommerceOffers já tem timeout de 5s + catch
    // interno, e o hook já tinha .catch() (ver comentário abaixo) — mesmo
    // assim, em produção, o card ficava preso em "Buscando opções de
    // compra..." indefinidamente logo após um logout+login dentro da MESMA
    // sessão do app (sem reload de página — o dono confirmou o gatilho
    // exato). Não conseguimos reproduzir/isolar a causa exata dessa
    // condição de corrida no bootstrap pós-login com certeza total, então
    // em vez de mais uma hipótese: se por QUALQUER motivo o carregamento
    // não resolver em 8s (bem acima do timeout de 5s do fetch em si), força
    // a saída do estado de loading. O card cai no fallback "sem oferta"
    // (que já existe e é seguro) em vez de travar pra sempre — o usuário
    // nunca mais fica olhando "Buscando..." indefinidamente, seja qual for
    // a causa raiz.
    const hardTimeout = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
      }
    }, 8000);

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
      })
      .finally(() => clearTimeout(hardTimeout));

    return () => {
      cancelled = true;
      clearTimeout(hardTimeout);
    };
  }, [query, packageSizeKg, gtin]);

  return { offers, loading };
}

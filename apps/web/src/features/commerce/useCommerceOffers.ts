'use client';

import { useEffect, useState } from 'react';
import { fetchCommerceOffersWithStatus, type CommerceOffer } from './productPricing';

// Backoff curto entre retries automáticos quando a consulta não terminou
// de forma definitiva — status="enrichment_pending" (identidade do
// produto ainda em preparo na 1ª consulta, ver
// commerce_offers.py::get_commerce_offers_with_status) OU
// status="transient_error" (rede/timeout/502/503/504/429, comum logo após
// o login com o proxy/sessão ainda estabilizando — ver
// isTransientFetchError em productPricing.ts). No máximo 2 retries (3
// tentativas no total) — nunca infinito, e nunca pra "sem oferta"
// definitivo (status="ready" com lista vazia não tenta de novo).
const RETRY_DELAYS_MS = [600, 1300];

// Rede de segurança final, bem acima do pior caso teórico da sequência de
// retries (3 tentativas × até ~2.5s cada + os backoffs acima ≈ 9.4s) —
// nunca deveria disparar na prática (o loop de retry já se encerra
// sozinho), existe só pra garantir que NENHUM bug futuro deixe o card
// preso em "Buscando..." pra sempre.
const HARD_TIMEOUT_MS = 12000;

/**
 * Fonte única de ofertas monetizáveis — usada por toda tela de "Comprar
 * novamente" (Home, ficha da ração, ficha de antiparasitário). Mesma
 * query/peso/GTIN reais sempre resolvem a mesma lista, em qualquer tela.
 *
 * `gtin` é opcional (ver fetchCommerceOffers) — ração e antiparasitário
 * passam hoje (via barcode escaneado, ver petCareDomain.ts
 * processFood/processParasite e MonetizedOffersListProps.gtin); nem toda
 * tela tem um GTIN real disponível, então segue opcional.
 *
 * BUG ENCONTRADO 11/09/2026: na 1ª vez que um produto nunca visto é
 * consultado, o backend pode levar mais que o timeout de rede pra
 * terminar de preparar a identidade dele — antes, isso virava silenciosamente
 * uma lista vazia, indistinguível de "sem oferta mesmo", e o preço só
 * aparecia depois de fechar/reabrir o app (nova consulta, já enriquecido).
 * Agora o backend sinaliza status="enrichment_pending" nesse caso, e este
 * hook tenta de novo automaticamente (backoff curto, bem poucas vezes) —
 * o preço aparece sozinho, na MESMA abertura do app, sem exigir reload.
 *
 * BUG ENCONTRADO 12/09/2026: falha transitória de rede (comum logo após
 * o login, com o proxy/sessão do WKWebView ainda estabilizando) virava
 * silenciosamente status="ready" com lista vazia — o mesmo retry acima
 * não disparava, porque só olhava "enrichment_pending". O preço só
 * aparecia depois de fechar e reabrir a Loja (desmonta/remonta = nova
 * tentativa manual). Agora fetchCommerceOffersWithStatus distingue erro
 * transitório ("transient_error") de "sem oferta" definitivo, e o retry
 * abaixo trata os dois status não-terminais da mesma forma.
 */
export function useCommerceOffers(query: string, packageSizeKg?: number | null, gtin?: string | null) {
  const [offers, setOffers] = useState<CommerceOffer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const pendingTimers: ReturnType<typeof setTimeout>[] = [];
    setLoading(true);
    setOffers([]);

    const hardTimeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, HARD_TIMEOUT_MS);

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        pendingTimers.push(setTimeout(resolve, ms));
      });
    }

    async function run() {
      for (let attempt = 0; !cancelled; attempt++) {
        let result: { offers: CommerceOffer[]; status: 'ready' | 'enrichment_pending' | 'transient_error' };
        try {
          result = await fetchCommerceOffersWithStatus(query, packageSizeKg ?? undefined, gtin ?? undefined);
        } catch {
          // fetchCommerceOffersWithStatus já captura erro internamente e
          // nunca relança — este catch é só uma 2ª camada de segurança pra
          // nunca deixar `loading` preso caso algo inesperado escape dali
          // (mesmo padrão de outras chamadas de commerce). Causa
          // desconhecida → terminal, não "transient_error": só a própria
          // função sabe classificar rede/timeout de verdade.
          result = { offers: [], status: 'ready' };
        }
        if (cancelled) return;

        const canRetry = result.status !== 'ready' && attempt < RETRY_DELAYS_MS.length;
        if (!canRetry) {
          setOffers(result.offers);
          setLoading(false);
          return;
        }
        await wait(RETRY_DELAYS_MS[attempt]);
      }
    }

    void run();

    return () => {
      cancelled = true;
      clearTimeout(hardTimeout);
      pendingTimers.forEach(clearTimeout);
    };
  }, [query, packageSizeKg, gtin]);

  return { offers, loading };
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { trackClick } from '@/lib/analytics/click';
import { formatBRLPrice, fetchCommerceOffers, searchAwinCatalog, type AwinSearchResult, type CommerceOffer } from './productPricing';

interface AffiliateCatalogSearchProps {
  petId: string;
}

const MERCHANT_LABELS: Record<string, string> = {
  cobasi: 'Cobasi',
  zeenow: 'Zee Now',
  zeedog: 'Zee Dog',
  petz: 'Petz',
};

function merchantLabel(merchant: string): string {
  return MERCHANT_LABELS[merchant] ?? merchant;
}

type ResolvedOffers = CommerceOffer[] | 'loading' | 'error';

// Substitui o card estático "Cobasi" (Lojas) — em vez de só levar pro site
// de uma loja sem contexto, deixa o tutor achar o produto real dentro do
// catálogo já sincronizado da Awin e comprar direto. GTIN é o que falta pro
// app conseguir exercitar AwinFeedProvider (busca textual normal nunca
// envia GTIN — ver docs/AFFILIATES.md). Multi-loja por natureza — não é
// específico da Cobasi: quando Petz/Zee Now/Zee Dog forem aprovadas e
// sincronizadas, aparecem aqui sem mudar este componente (offer_count > 1
// já monta o grid de preços).
//
// Oferta é resolvida assim que o resultado da busca chega (useEffect
// abaixo), não no toque em "Comprar" — descoberto com um tutor real num
// PWA instalado (iOS): resolver no clique obriga a navegação a acontecer
// depois de um `await`, e nesse contexto específico o clique deixa de se
// comportar como um link de verdade. Pré-resolvendo, "Comprar" vira um
// <a href target="_blank"> real (nunca window.open()/location.href via
// JS) — a navegação mais parecida possível com "tocar num link", que é
// o que as restrições do iOS pra apps instalados esperam. target="_blank"
// sempre, mesmo dentro do PWA instalado: usar a mesma janela
// (location.href) fazia o redirecionamento em cadeia da Awin/Cobasi
// (awin1.com → cobasi.onelink.me → cobasi.com.br) cair na home da
// Cobasi em vez do produto — aba nova evita compartilhar o contexto
// (cookies/ITP) restrito da webview embutida do app instalado.
export function AffiliateCatalogSearch({ petId }: AffiliateCatalogSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AwinSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [failedImageGtins, setFailedImageGtins] = useState<Set<string>>(new Set());
  const [offersByGtin, setOffersByGtin] = useState<Record<string, ResolvedOffers>>({});
  const [storeChoicesForGtin, setStoreChoicesForGtin] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const found = await searchAwinCatalog(trimmed);
      setResults(found);
      setLoading(false);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    for (const item of results) {
      if (offersByGtin[item.gtin] !== undefined) continue;
      setOffersByGtin((prev) => ({ ...prev, [item.gtin]: 'loading' }));
      // Passa pelo commerce engine de verdade (GET /commerce/offers), mas
      // SEM texto de busca — só gtin. Descoberto testando: mandar o título
      // junto fazia o CobasiProvider rodar sua própria busca textual ao
      // vivo (imprecisa) em paralelo, e como a rota preferida é "awin",
      // isso não muda o vencedor, mas evita uma chamada redundante à API
      // da Cobasi. Só gtin faz o CobasiProvider nem tentar (sem query,
      // find_offer retorna cedo — ver cobasi_provider.py), deixando o
      // AwinFeedProvider resolver sozinho o produto certo. Já volta
      // deduplicado por loja — se mais de uma loja tiver o mesmo GTIN,
      // aqui é o grid de preços de verdade.
      fetchCommerceOffers('', undefined, item.gtin)
        .then((offers) => setOffersByGtin((prev) => ({ ...prev, [item.gtin]: offers })))
        .catch(() => setOffersByGtin((prev) => ({ ...prev, [item.gtin]: 'error' })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  function trackBuyClick(gtin: string, offer: CommerceOffer) {
    void trackClick({
      source: 'home',
      cta_type: 'shop_awin_search_buy',
      target: offer.merchant,
      link_type: offer.link_type === 'affiliate_product' ? 'affiliate_product' : 'direct',
      pet_id: petId,
      metadata: { gtin },
    });
    setStoreChoicesForGtin(null);
  }

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar produto..."
          className="w-full border-2 border-gray-200 rounded-2xl pl-10 pr-4 py-3 text-[14px] text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 transition-colors"
        />
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[15px]">🔎</span>
      </div>

      {loading && (
        <p className="text-[12px] text-gray-400 mt-2 px-1">Buscando...</p>
      )}

      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-[12px] text-gray-400 mt-2 px-1">Nenhum produto encontrado para &quot;{query.trim()}&quot;.</p>
      )}

      {results.length > 0 && (
        <div className="mt-2.5 space-y-2 max-h-72 overflow-y-auto">
          {results.map((item) => {
            const resolved = offersByGtin[item.gtin];
            const choosingStore = storeChoicesForGtin === item.gtin;
            const singleOffer = Array.isArray(resolved) && resolved.length === 1 ? resolved[0] : null;
            const multipleOffers = Array.isArray(resolved) && resolved.length > 1 ? resolved : null;
            const unavailable = Array.isArray(resolved) && resolved.length === 0;

            return (
              <div
                key={item.gtin}
                className="p-2.5 bg-white border border-gray-200 rounded-2xl shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 flex-shrink-0 flex items-center justify-center">
                    {item.image_url && !failedImageGtins.has(item.gtin) ? (
                      <img
                        src={item.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={() => setFailedImageGtins((prev) => new Set(prev).add(item.gtin))}
                      />
                    ) : (
                      <span className="text-lg">🛍️</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-gray-900 leading-tight line-clamp-2">{item.title}</p>
                    {typeof item.price === 'number' && (
                      <p className="text-[12px] font-bold text-emerald-700 mt-0.5">
                        {item.offer_count > 1 ? 'A partir de ' : ''}{formatBRLPrice(item.price)}
                        {item.offer_count > 1 && (
                          <span className="block mt-0.5 text-[9px] font-black uppercase tracking-wide text-blue-600 whitespace-nowrap">
                            {merchantLabel(item.merchant)} · +{item.offer_count - 1} loja{item.offer_count - 1 > 1 ? 's' : ''}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {singleOffer && singleOffer.url ? (
                    // <a href target="_blank"> real — navegação nativa do
                    // navegador, sem JS entre o toque e a saída da página,
                    // sempre em aba nova (ver docstring do componente).
                    <a
                      href={singleOffer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackBuyClick(item.gtin, singleOffer)}
                      className="flex-shrink-0 rounded-full bg-emerald-500 text-white text-[11px] font-bold px-3 py-1.5 active:scale-95 transition-all"
                    >
                      🛒 Comprar
                    </a>
                  ) : multipleOffers ? (
                    <button
                      type="button"
                      onClick={() => setStoreChoicesForGtin(choosingStore ? null : item.gtin)}
                      className="flex-shrink-0 rounded-full bg-emerald-500 text-white text-[11px] font-bold px-3 py-1.5 active:scale-95 transition-all"
                    >
                      🛒 Comprar
                    </button>
                  ) : unavailable ? (
                    <span className="flex-shrink-0 rounded-full bg-gray-100 text-gray-400 text-[11px] font-bold px-3 py-1.5">
                      Indisponível
                    </span>
                  ) : (
                    <span className="flex-shrink-0 rounded-full bg-gray-100 text-gray-400 text-[11px] font-bold px-3 py-1.5">
                      ...
                    </span>
                  )}
                </div>

                {choosingStore && multipleOffers && (
                  <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-1.5">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-0.5">Escolha a loja</p>
                    {multipleOffers.map((offer) => (
                      offer.url ? (
                        <a
                          key={offer.merchant}
                          href={offer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => trackBuyClick(item.gtin, offer)}
                          className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-emerald-300 px-3 py-2 transition-all active:scale-[0.98]"
                        >
                          <span className="text-[12px] font-bold text-gray-800">{merchantLabel(offer.merchant)}</span>
                          {typeof offer.price === 'number' && (
                            <span className="text-[12px] font-bold text-emerald-700">{formatBRLPrice(offer.price)}</span>
                          )}
                        </a>
                      ) : null
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

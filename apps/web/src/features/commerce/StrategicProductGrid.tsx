'use client';

/**
 * Grid compartilhado de "produtos estratégicos" (strategicProducts.ts) —
 * único componente de renderização usado tanto pela página pública /loja
 * quanto pela seção de recomendações da Loja do Pet (autenticada). As duas
 * telas só diferem em QUAIS itens passam (todos vs. filtrados por espécie)
 * e no valor de `source` pro rastreamento (public_store vs pet_store) —
 * nunca em como o card é montado ou em qual link é gerado.
 *
 * Cada card é uma busca Amazon (buildAmazonSearchUrl, tag petmol-20) —
 * nunca preço, imagem, ASIN ou afirmação de estoque/desconto (sem PA-API/
 * Creators API ainda, ver docs/AFFILIATES.md). Textos deliberadamente
 * neutros ("Pesquisar na Amazon", "Preço e disponibilidade devem ser
 * confirmados na Amazon").
 */

import Link from 'next/link';
import { buildAmazonSearchUrl } from './amazonAffiliate';
import { STRATEGIC_PRODUCT_CATEGORIES, type StrategicProduct } from './strategicProducts';
import { trackClick } from '@/lib/analytics/click';
import { trackPartnerClicked } from '@/lib/v1Metrics';

export interface StrategicProductGridProps {
  products: StrategicProduct[];
  /** Distingue rastreamento da área pública vs. autenticada — nunca o mesmo valor nas duas. */
  source: 'public_store' | 'pet_store';
  petId?: string | null;
  /** Agrupa por categoria com um título de seção — usado em /loja; a Loja do Pet mostra uma lista só. */
  groupByCategory?: boolean;
  /** Mostra o link "Ver guia" de cada card, quando o produto tem guideSlug. */
  showGuideLinks?: boolean;
}

function ProductCard({
  product,
  source,
  petId,
  showGuideLinks,
}: {
  product: StrategicProduct;
  source: 'public_store' | 'pet_store';
  petId?: string | null;
  showGuideLinks?: boolean;
}) {
  const amazonUrl = buildAmazonSearchUrl(product.searchQuery);

  function handleClick() {
    void trackClick({
      source,
      cta_type: 'strategic_product_search',
      target: 'amazon',
      link_type: 'affiliate_search',
      pet_id: petId ?? undefined,
      metadata: { product_id: product.id, category: product.category },
    });
    trackPartnerClicked({
      source,
      partner: 'amazon',
      pet_id: petId ?? null,
      control_type: product.category,
      product_name: product.title,
    });
  }

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col gap-2.5">
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{product.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-[15px] leading-tight">{product.title}</p>
          <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">{product.blurb}</p>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 leading-snug">
        Preço e disponibilidade devem ser confirmados na Amazon.
      </p>
      <div className="flex items-center gap-2">
        <a
          href={amazonUrl}
          target="_blank"
          rel="sponsored noopener noreferrer"
          onClick={handleClick}
          className="flex-1 flex items-center justify-center rounded-xl bg-gray-900 text-white text-[13px] font-bold py-2.5 active:scale-95 transition-all"
        >
          Pesquisar na Amazon
        </a>
        {showGuideLinks && product.guideSlug && (
          <Link
            href={`/guias/${product.guideSlug}`}
            className="flex-shrink-0 rounded-xl border border-gray-200 text-gray-600 text-[12px] font-semibold px-3 py-2.5 active:scale-95 transition-all"
          >
            Ver guia
          </Link>
        )}
      </div>
    </div>
  );
}

export function StrategicProductGrid({ products, source, petId, groupByCategory = false, showGuideLinks = false }: StrategicProductGridProps) {
  if (products.length === 0) return null;

  if (!groupByCategory) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} source={source} petId={petId} showGuideLinks={showGuideLinks} />
        ))}
      </div>
    );
  }

  const byCategory = new Map<string, StrategicProduct[]>();
  for (const p of products) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  return (
    <div className="space-y-6">
      {Array.from(byCategory.entries()).map(([category, items]) => {
        const meta = STRATEGIC_PRODUCT_CATEGORIES[category as keyof typeof STRATEGIC_PRODUCT_CATEGORIES];
        return (
          <div key={category}>
            <h3 className="text-[13px] font-black uppercase tracking-wide text-gray-500 mb-2.5 flex items-center gap-1.5">
              <span>{meta?.icon}</span>{meta?.label ?? category}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} source={source} petId={petId} showGuideLinks={showGuideLinks} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

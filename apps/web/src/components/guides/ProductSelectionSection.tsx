import Link from 'next/link';
import { headers } from 'next/headers';
import { PRODUCT_COLLECTIONS, type ProductCollection, type ProductPick } from '@/features/guides/productCollections';
import { getGuideBySlug } from '@/features/guides';
import { isNativeAppUserAgent } from '@/lib/nativeApp';
import { AffiliateDisclosure, AmazonDisclosure } from './AffiliateDisclosure';

/**
 * "Produtos selecionados pelo PETMOL" — seção editorial dos Guias.
 *
 * Web: lista os produtos como cards editoriais com um CTA discreto "Ver na
 * Amazon" que abre o link de afiliado do usuário (`affiliateUrl`, verbatim)
 * em nova aba. Sem preço, rating, review ou desconto.
 *
 * App nativo: os cards comerciais (links de afiliado Amazon) NÃO são
 * renderizados — regras da Amazon Associates para aplicativos + as
 * proteções web-only já existentes de /recommendations. O conteúdo
 * editorial dos guias continua aparecendo normalmente; só esta seção some.
 */
function ProductCardItem({ item }: { item: ProductPick }) {
  const relatedGuide = item.relatedGuideSlug ? getGuideBySlug(item.relatedGuideSlug) : undefined;
  return (
    <li className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[14px] font-bold leading-snug text-slate-900">{item.name}</p>
      <p className="mt-1 text-[13px] leading-snug text-slate-500">{item.editorialNote}</p>
      {relatedGuide && (
        <Link
          href={`/guias/${relatedGuide.slug}`}
          className="mt-2 text-[12px] font-semibold text-blue-600 hover:underline"
        >
          Guia relacionado: {relatedGuide.title}
        </Link>
      )}
      <a
        href={item.affiliateUrl}
        target="_blank"
        rel="sponsored nofollow noopener noreferrer"
        className="mt-3 inline-flex w-fit items-center gap-1 rounded-xl border border-[#0056D2]/20 bg-blue-50 px-3.5 py-2 text-[13px] font-bold text-[#0056D2] transition-colors hover:bg-blue-100"
      >
        Ver na Amazon
        <span aria-hidden>→</span>
      </a>
    </li>
  );
}

function CollectionBlock({ collection }: { collection: ProductCollection }) {
  const hasItems = collection.items.length > 0;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[16px] font-black text-slate-900">
          <span aria-hidden className="mr-1.5">
            {collection.icon}
          </span>
          {collection.label}
        </h3>
        {hasItems && (
          <span className="text-[12px] text-slate-400">
            {collection.items.length} {collection.items.length === 1 ? 'item' : 'itens'}
          </span>
        )}
      </div>
      <p className="mt-1 text-[13px] text-slate-500">{collection.description}</p>
      {hasItems ? (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {collection.items.map((item) => (
            <ProductCardItem key={item.asin} item={item} />
          ))}
        </ul>
      ) : (
        <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Seleções em preparação
        </span>
      )}
    </div>
  );
}

export async function ProductSelectionSection() {
  // App nativo: não renderiza a área comercial (ver comentário no topo).
  const isNativeApp = isNativeAppUserAgent((await headers()).get('user-agent'));
  if (isNativeApp) return null;

  const collections = PRODUCT_COLLECTIONS.filter((c) => c.items.length > 0);
  if (collections.length === 0) return null;

  return (
    <section aria-labelledby="produtos-selecionados" className="mt-12">
      <h2
        id="produtos-selecionados"
        className="text-[13px] font-black uppercase tracking-wide text-slate-400"
      >
        Produtos selecionados pelo PETMOL
      </h2>
      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-slate-500">
        Complemento aos guias: uma lista curta de produtos que ajudam na rotina com cães e gatos,
        organizada por necessidade. A escolha do que entra aqui segue os critérios dos guias — os
        links levam à Amazon.com.br e nada nesta seção muda a conclusão de um texto.
      </p>
      <div className="mt-4">
        <AmazonDisclosure />
      </div>
      <div className="mt-3">
        <AffiliateDisclosure variant="compact" />
      </div>
      <div className="mt-6 space-y-8">
        {collections.map((collection) => (
          <CollectionBlock key={collection.id} collection={collection} />
        ))}
      </div>
    </section>
  );
}

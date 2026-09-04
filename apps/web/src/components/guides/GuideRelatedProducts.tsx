import { headers } from 'next/headers';
import { getProductsForGuide } from '@/features/guides/productCollections';
import { isNativeAppUserAgent } from '@/lib/nativeApp';
import { AmazonDisclosure } from './AffiliateDisclosure';

/**
 * Bloco contextual de produtos no fim de um guia — no máximo 3 itens, só
 * quando existe relação editorial de verdade (`relatedGuideSlug`). É apoio
 * ao conteúdo, não vitrine: fica depois das fontes e dos guias relacionados.
 *
 * App nativo: não renderiza (ToS Amazon Associates para apps + proteção
 * web-only já existente). O guia em si aparece igual.
 */
export async function GuideRelatedProducts({ slug }: { slug: string }) {
  const isNativeApp = isNativeAppUserAgent((await headers()).get('user-agent'));
  if (isNativeApp) return null;

  const products = getProductsForGuide(slug, 3);
  if (products.length === 0) return null;

  return (
    <section aria-labelledby="produtos-do-guia" className="mt-10">
      <h2 id="produtos-do-guia" className="text-[13px] font-black uppercase tracking-wide text-slate-400">
        Produtos que se encaixam neste guia
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
        Opções na Amazon.com.br que atendem aos critérios acima. Confira sempre as especificações na
        página do produto antes de comprar.
      </p>
      <ul className="mt-3 space-y-2">
        {products.map((item) => (
          <li
            key={item.asin}
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4"
          >
            <p className="text-[14px] font-bold leading-snug text-slate-900">{item.name}</p>
            <p className="mt-1 text-[13px] leading-snug text-slate-500">{item.editorialNote}</p>
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
        ))}
      </ul>
      <div className="mt-3">
        <AmazonDisclosure />
      </div>
    </section>
  );
}

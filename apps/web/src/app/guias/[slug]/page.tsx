import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getAllGuides,
  getGuideBySlug,
  getGuideCategory,
  getRelatedGuides,
} from '@/features/guides';
import { GuideBlocks } from '@/components/guides/GuideBlocks';
import { GuideHero } from '@/components/guides/GuideHero';
import { GuideCard } from '@/components/guides/GuideCard';
import { EditorialByline } from '@/components/guides/EditorialByline';
import { SourcesList } from '@/components/guides/SourcesList';
import { AffiliateDisclosure } from '@/components/guides/AffiliateDisclosure';
import { GuideArticleJsonLd } from '@/components/guides/JsonLd';
import { PUBLIC_GUIDE_DETAIL_PAGE_ENABLED } from '../../publicCommercePages';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllGuides().map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) return { title: 'Guia não encontrado | PETMOL' };

  const url = `${SITE_URL}/guias/${guide.slug}`;
  return {
    title: `${guide.title} | Guias PETMOL`,
    description: guide.description,
    alternates: { canonical: url },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url,
      type: 'article',
      publishedTime: guide.publishedAt,
      modifiedTime: guide.updatedAt,
      authors: [`${SITE_URL}/sobre`],
      ...(guide.hero ? { images: [{ url: `${SITE_URL}${guide.hero}` }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: guide.title,
      description: guide.description,
    },
  };
}

export default async function GuidePage({ params }: GuidePageProps) {
  // Guias pausados temporariamente (ver publicCommercePages.ts) — conteúdo
  // intacto, volta ao reativar a flag.
  if (!PUBLIC_GUIDE_DETAIL_PAGE_ENABLED) notFound();

  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) notFound();

  const category = getGuideCategory(guide.category);
  const related = getRelatedGuides(guide.slug);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <GuideArticleJsonLd guide={guide} />
      <article className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
        <nav aria-label="Trilha" className="mb-4 text-[12px] text-slate-400">
          <Link href="/" className="hover:text-slate-600">
            Início
          </Link>{' '}
          /{' '}
          <Link href="/guias" className="hover:text-slate-600">
            Guias
          </Link>{' '}
          /{' '}
          <Link href={`/guias?categoria=${category.id}#${category.id}`} className="hover:text-slate-600">
            {category.label}
          </Link>
        </nav>

        <header className="space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
            <span aria-hidden>{category.icon}</span>
            {category.label}
          </span>
          <h1 className="text-[26px] font-black leading-tight text-slate-900 sm:text-[31px]">
            {guide.headline ?? guide.title}
          </h1>
          <EditorialByline guide={guide} />
        </header>

        <div className="mt-5">
          <GuideHero guide={guide} />
        </div>

        <p className="mt-6 rounded-2xl border-l-4 border-blue-500 bg-blue-50/60 px-4 py-3 text-[15px] font-medium leading-relaxed text-slate-800">
          {guide.summary}
        </p>

        <div className="mt-7 space-y-5">
          <GuideBlocks blocks={guide.blocks} />
        </div>

        {guide.faq && guide.faq.length > 0 && (
          <section aria-labelledby="faq" className="mt-9">
            <h2 id="faq" className="text-[19px] font-black text-slate-900">
              Perguntas frequentes
            </h2>
            <div className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {guide.faq.map((item, i) => (
                <details key={i} className="group px-4 py-3">
                  <summary className="cursor-pointer list-none text-[14.5px] font-bold text-slate-800 marker:content-none">
                    <span className="mr-2 text-blue-500 group-open:hidden" aria-hidden>
                      +
                    </span>
                    <span className="mr-2 hidden text-blue-500 group-open:inline" aria-hidden>
                      −
                    </span>
                    {item.question}
                  </summary>
                  <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {guide.vetContext && (
          <p className="mt-7 rounded-xl bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-900">
            <strong>Saúde do cão:</strong> este conteúdo é informativo e não substitui a avaliação de
            um médico-veterinário. Mudança de comportamento, sintoma persistente ou qualquer condição
            individual devem ser avaliados por um profissional.
          </p>
        )}

        {guide.sources && guide.sources.length > 0 && (
          <div className="mt-7">
            <SourcesList sources={guide.sources} />
          </div>
        )}

        {related.length > 0 && (
          <section aria-labelledby="relacionados" className="mt-10">
            <h2 id="relacionados" className="mb-3 text-[13px] font-black uppercase tracking-wide text-slate-400">
              Continue por aqui
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {related.map((g) => (
                <GuideCard key={g.slug} guide={g} />
              ))}
            </div>
          </section>
        )}

        <div className="mt-10 space-y-5">
          <AffiliateDisclosure variant="compact" />
          <Link href="/guias" className="inline-flex text-[13px] font-bold text-blue-600 hover:underline">
            ← Todos os guias
          </Link>
        </div>
      </article>
    </div>
  );
}

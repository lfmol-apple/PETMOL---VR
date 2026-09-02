import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AMAZON_REQUIRED_STATEMENT,
  RECOMMENDATIONS,
  RECOMMENDATIONS_DISCLOSURE_SHORT,
  RECOMMENDATIONS_INTRO,
  destinationOf,
  getPopulatedCategories,
  getRecommendationsByCategory,
  type Recommendation,
} from '@/features/recommendations/data';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const PAGE_URL = `${SITE_URL}/recommendations`;

export const metadata: Metadata = {
  title: 'PETMOL Recommendations | Products We Like',
  description:
    'Curated products for pets, pet parents, the home and everyday life, selected by PETMOL.',
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: 'PETMOL Recommendations',
    description:
      'Useful products we discover for pets, pet parents, the home, and everyday life.',
    url: PAGE_URL,
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: 'PETMOL Recommendations',
    description:
      'Useful products we discover for pets, pet parents, the home, and everyday life.',
  },
};

function AffiliateCta({ href, collection }: { href: string; collection: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored nofollow noopener noreferrer"
      className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#0056D2] px-4 py-2 text-[13px] font-bold text-white transition-transform active:scale-95 hover:bg-[#0047ad]"
    >
      {collection ? 'Browse on Amazon' : 'View on Amazon'}
      <span aria-hidden>↗</span>
    </a>
  );
}

function RecommendationCard({ item }: { item: Recommendation }) {
  const collection = destinationOf(item) === 'collection';
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-bold leading-snug text-slate-900">{item.title}</h3>
          {collection && (
            <span className="mt-0.5 flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Selection
            </span>
          )}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          {item.blurb}
          {collection && (
            <span className="text-slate-400"> You’ll land on a selection of these on Amazon, not one product.</span>
          )}
        </p>
        {item.needsEditorialMetadata && (
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-600">
            Editorial note pending
          </p>
        )}
      </div>
      <div className="flex justify-end">
        <AffiliateCta href={item.affiliateUrl} collection={collection} />
      </div>
    </div>
  );
}

export default function RecommendationsPage() {
  const categories = getPopulatedCategories();
  const total = RECOMMENDATIONS.length;

  return (
    <div lang="en" className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:py-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-[12px] text-slate-400">
          <Link href="/" className="hover:text-slate-600">
            Home
          </Link>{' '}
          / <span className="text-slate-600">Recommendations</span>
        </nav>

        <header className="space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[12px] font-bold text-blue-700">
            🐾 PETMOL Recommendations
          </span>
          <h1 className="text-[28px] font-black leading-tight text-slate-900 sm:text-[34px]">
            PETMOL Recommendations
          </h1>
          <p className="text-[15px] font-semibold text-slate-600">
            Useful products we discover for pets, pet parents, the home, and everyday life.
          </p>
          <p className="max-w-2xl text-[14px] leading-relaxed text-slate-500">{RECOMMENDATIONS_INTRO}</p>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
            {total} picks · {categories.length} categories
          </p>
        </header>

        {/* Category jump-nav — the list is long enough to want shortcuts. */}
        <nav aria-label="Jump to a category" className="mt-6 flex flex-wrap gap-2">
          {categories.map((cat) => (
            <a
              key={cat.id}
              href={`#cat-${cat.id}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700"
            >
              {cat.label}
              <span className="ml-1.5 text-slate-400">{getRecommendationsByCategory(cat.id).length}</span>
            </a>
          ))}
        </nav>

        {/* Disclosure — right next to the products, not hidden in the footer. */}
        <section
          aria-label="Affiliate disclosure"
          className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-900"
        >
          <p className="font-bold">{AMAZON_REQUIRED_STATEMENT}</p>
          <p className="mt-1">{RECOMMENDATIONS_DISCLOSURE_SHORT}</p>
          <p className="mt-1 text-amber-800">
            Availability, price, payment and delivery are handled entirely by Amazon.
          </p>
        </section>

        <div className="mt-10 space-y-12">
          {categories.map((cat) => (
            <section key={cat.id} aria-labelledby={`cat-${cat.id}`} className="scroll-mt-6">
              <h2 id={`cat-${cat.id}`} className="text-[18px] font-black text-slate-900">
                {cat.label}
              </h2>
              <p className="mb-4 mt-0.5 text-[13px] text-slate-500">{cat.description}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {getRecommendationsByCategory(cat.id).map((item) => (
                  <RecommendationCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-14 space-y-3 border-t border-slate-200 pt-6 text-[12px] leading-relaxed text-slate-400">
          <p>
            PETMOL selects these items because it finds them interesting or useful. This page is run
            by PETMOL, not by Amazon, and PETMOL is not affiliated with the manufacturers. Every
            purchase is completed on Amazon under Amazon’s terms.
          </p>
          <p className="font-medium text-slate-500">{AMAZON_REQUIRED_STATEMENT}</p>
          <p>
            <Link href="/transparencia" className="font-semibold text-blue-600 hover:underline">
              How PETMOL is funded
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}

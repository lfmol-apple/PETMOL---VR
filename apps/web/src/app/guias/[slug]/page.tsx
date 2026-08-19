import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GUIDES, getGuideBySlug } from '@/features/content/guides';
import { STRATEGIC_PRODUCTS, STRATEGIC_PRODUCT_CATEGORIES } from '@/features/commerce/strategicProducts';
import { StrategicProductGrid } from '@/features/commerce/StrategicProductGrid';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) {
    return { title: 'Guia não encontrado | PETMOL' };
  }
  return {
    title: guide.title,
    description: guide.metaDescription,
    alternates: { canonical: `${SITE_URL}/guias/${guide.slug}` },
    openGraph: {
      title: guide.title,
      description: guide.metaDescription,
      url: `${SITE_URL}/guias/${guide.slug}`,
      type: 'article',
      modifiedTime: guide.updatedAt,
    },
  };
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) notFound();

  const relatedProducts = STRATEGIC_PRODUCTS.filter((p) => guide.relatedProductIds.includes(p.id));
  const categoryMeta = STRATEGIC_PRODUCT_CATEGORIES[guide.category];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <article className="max-w-2xl mx-auto px-5 py-10 space-y-6">
        <Link href="/guias" className="text-[13px] font-bold text-blue-600">← Todos os guias</Link>

        <header className="space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold px-2.5 py-1">
            {categoryMeta?.icon} {categoryMeta?.label}
          </span>
          <h1 className="text-[26px] sm:text-[30px] font-black text-slate-900 leading-tight">{guide.title}</h1>
          <p className="text-[12px] text-slate-400">Atualizado em {formatDate(guide.updatedAt)}</p>
        </header>

        <div className="space-y-4 text-[15px] text-slate-700 leading-relaxed">
          {guide.paragraphs.map((paragraph, idx) => (
            <p key={idx}>{paragraph}</p>
          ))}
        </div>

        {guide.bulletPoints && guide.bulletPoints.length > 0 && (
          <ul className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5">
            {guide.bulletPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2 text-[14px] text-slate-700">
                <span className="flex-shrink-0 mt-0.5">✓</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}

        {guide.vetDisclaimer && (
          <p className="text-[12px] text-slate-500 bg-slate-100 rounded-xl px-4 py-3 leading-relaxed">
            Este conteúdo é informativo e não substitui avaliação de um médico-veterinário. Qualquer
            mudança de comportamento, saúde ou sintoma persistente merece consulta profissional.
          </p>
        )}

        {relatedProducts.length > 0 && (
          <section>
            <h2 className="text-[13px] font-black uppercase tracking-wide text-slate-400 mb-3">
              Produtos relacionados a este guia
            </h2>
            <StrategicProductGrid products={relatedProducts} source="public_store" />
            <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
              Como participante do Programa de Associados da Amazon, sou remunerado pelas compras
              qualificadas efetuadas. Os cards acima são intenções de busca — preço e disponibilidade
              devem ser confirmados na Amazon.
            </p>
          </section>
        )}

        <div className="rounded-2xl bg-blue-600 text-white p-5 text-center space-y-2">
          <p className="text-[14px] font-black">Quer isso organizado pro seu pet?</p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-xl bg-white text-blue-700 text-[13px] font-black px-5 py-2.5 active:scale-95 transition-all"
          >
            Criar conta gratuita
          </Link>
        </div>
      </article>
    </div>
  );
}

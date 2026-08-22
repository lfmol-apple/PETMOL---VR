import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GUIDES, type GuideCategory } from '@/features/content/guides';
import { STRATEGIC_PRODUCT_CATEGORIES } from '@/features/commerce/strategicProducts';
import { PUBLIC_GUIDES_PAGE_ENABLED } from '../publicCommercePages';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Guias PETMOL',
  description: 'Guias práticos sobre alimentação, prevenção, transporte, medicação, hidratação e conforto para cães e gatos.',
  alternates: { canonical: `${SITE_URL}/guias` },
};

export default function GuiasIndexPage() {
  if (!PUBLIC_GUIDES_PAGE_ENABLED) notFound();

  const byCategory = new Map<GuideCategory, typeof GUIDES>();
  for (const guide of GUIDES) {
    const list = byCategory.get(guide.category) ?? [];
    list.push(guide);
    byCategory.set(guide.category, list);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-3xl mx-auto px-5 py-10 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-[28px] font-black text-slate-900 leading-tight">Guias PETMOL</h1>
          <p className="text-[14px] text-slate-500 max-w-lg mx-auto">
            Conteúdo prático sobre a rotina de cães e gatos — acesso livre, sem precisar criar conta.
          </p>
        </div>

        {Array.from(byCategory.entries()).map(([category, guides]) => {
          const meta = STRATEGIC_PRODUCT_CATEGORIES[category];
          return (
            <section key={category}>
              <h2 className="text-[13px] font-black uppercase tracking-wide text-slate-400 mb-3 flex items-center gap-1.5">
                <span>{meta?.icon}</span>{meta?.label ?? category}
              </h2>
              <ul className="space-y-2">
                {guides.map((guide) => (
                  <li key={guide.slug}>
                    <Link
                      href={`/guias/${guide.slug}`}
                      className="block rounded-2xl border border-slate-200 bg-white px-5 py-4 hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
                    >
                      <p className="text-[15px] font-bold text-slate-900 leading-tight">{guide.title}</p>
                      <p className="text-[12px] text-slate-500 mt-1 leading-snug">{guide.metaDescription}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <div className="text-center pt-2">
          <Link href="/loja" className="text-[13px] font-bold text-blue-600">
            Ver curadoria completa de produtos →
          </Link>
        </div>
      </div>
    </div>
  );
}

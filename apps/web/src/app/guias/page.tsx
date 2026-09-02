import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getAllGuides,
  getCategoriesWithGuides,
  getFeaturedGuides,
  getRecentGuides,
  getToolGuides,
} from '@/features/guides';
import { notFound } from 'next/navigation';
import { GuideCard } from '@/components/guides/GuideCard';
import { GuidesCollectionJsonLd } from '@/components/guides/JsonLd';
import { AffiliateDisclosure } from '@/components/guides/AffiliateDisclosure';
import { PUBLIC_GUIDES_PAGE_ENABLED } from '../publicCommercePages';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Guias PETMOL — decisões práticas para tutores de cães',
  description:
    'Guias diretos sobre alimentação, compras inteligentes, transporte, casa e primeiros cuidados. Com calculadoras de ração. Acesso livre, sem cadastro.',
  alternates: { canonical: `${SITE_URL}/guias` },
  openGraph: {
    title: 'Guias PETMOL',
    description:
      'Guias práticos para tutores de cães: como escolher ração, comparar produtos por custo real, transporte, casa e primeiros cuidados.',
    url: `${SITE_URL}/guias`,
    type: 'website',
  },
};

const TOOL_LABEL: Record<string, string> = {
  'duracao-saco-racao': 'Quanto tempo dura um saco de ração',
  'custo-mensal-racao': 'Quanto custa alimentar um cão por mês',
  'comparar-racoes-custo-diario': 'Comparar duas rações pelo custo diário',
};

export default function GuiasIndexPage() {
  // Área de guias pausada temporariamente (ver publicCommercePages.ts).
  // Conteúdo preservado; reativar a flag traz a página de volta como estava.
  if (!PUBLIC_GUIDES_PAGE_ENABLED) notFound();

  const all = getAllGuides();
  const featured = getFeaturedGuides();
  const recent = getRecentGuides(4);
  const tools = getToolGuides();
  const categories = getCategoriesWithGuides();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <GuidesCollectionJsonLd count={all.length} />
      <div className="mx-auto max-w-4xl px-5 py-10 sm:py-12">
        <nav aria-label="Trilha" className="mb-4 text-[12px] text-slate-400">
          <Link href="/" className="hover:text-slate-600">
            Início
          </Link>{' '}
          / <span className="text-slate-600">Guias</span>
        </nav>

        <header className="space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[12px] font-bold text-blue-700">
            🐾 Guias PETMOL
          </span>
          <h1 className="text-[28px] font-black leading-tight text-slate-900 sm:text-[34px]">
            Decisões práticas para quem cuida de um cão
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-slate-500">
            Cada guia responde uma dúvida concreta — que ração escolher, quanto custa alimentar um
            cão, coleira ou peitoral, o que levar numa viagem. Direto ao ponto, com calculadoras onde
            elas ajudam. Sem login, sem newsletter, sem enrolação.
          </p>
        </header>

        {/* Destaques */}
        <section aria-labelledby="destaques" className="mt-10">
          <h2 id="destaques" className="mb-4 text-[13px] font-black uppercase tracking-wide text-slate-400">
            Comece por aqui
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {featured.map((guide) => (
              <GuideCard key={guide.slug} guide={guide} featured />
            ))}
          </div>
        </section>

        {/* Ferramentas */}
        {tools.length > 0 && (
          <section aria-labelledby="ferramentas" className="mt-12 rounded-3xl border border-emerald-200 bg-emerald-50/50 p-6">
            <h2 id="ferramentas" className="text-[16px] font-black text-slate-900">
              🧮 Calculadoras
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Ferramentas simples para planejar o gasto com ração. Não guardam nenhum dado.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {tools.map((guide) => (
                <li key={guide.slug}>
                  <Link
                    href={`/guias/${guide.slug}`}
                    className="flex items-center justify-between rounded-xl border border-emerald-200 bg-white px-4 py-3 text-[14px] font-semibold text-slate-800 hover:border-emerald-400"
                  >
                    {guide.tool ? TOOL_LABEL[guide.tool] ?? guide.title : guide.title}
                    <span aria-hidden className="text-emerald-600">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Recentes */}
        <section aria-labelledby="recentes" className="mt-12">
          <h2 id="recentes" className="mb-4 text-[13px] font-black uppercase tracking-wide text-slate-400">
            Atualizados recentemente
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map((guide) => (
              <GuideCard key={guide.slug} guide={guide} />
            ))}
          </div>
        </section>

        {/* Por categoria */}
        <section aria-labelledby="categorias" className="mt-12 space-y-8">
          <h2 id="categorias" className="text-[13px] font-black uppercase tracking-wide text-slate-400">
            Todos os guias por tema
          </h2>
          {categories.map(({ category, guides }) => (
            <div key={category.id} id={category.id} className="scroll-mt-24">
              <div className="mb-3 flex items-baseline gap-2">
                <h3 className="text-[17px] font-black text-slate-900">
                  <span aria-hidden className="mr-1.5">
                    {category.icon}
                  </span>
                  {category.label}
                </h3>
                <span className="text-[12px] text-slate-400">
                  {guides.length} {guides.length === 1 ? 'guia' : 'guias'}
                </span>
              </div>
              <p className="mb-3 text-[13px] text-slate-500">{category.description}</p>
              <ul className="space-y-2">
                {guides.map((guide) => (
                  <li key={guide.slug}>
                    <Link
                      href={`/guias/${guide.slug}`}
                      className="block rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-blue-300 hover:bg-blue-50/40"
                    >
                      <p className="text-[14px] font-bold leading-snug text-slate-900">{guide.title}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{guide.description}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <div className="mt-12 space-y-6">
          <AffiliateDisclosure />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <Link href="/sobre" className="font-semibold text-blue-600 hover:underline">
              Sobre o PETMOL
            </Link>
            <Link href="/politica-editorial" className="font-semibold text-blue-600 hover:underline">
              Política editorial
            </Link>
            <Link href="/transparencia" className="font-semibold text-blue-600 hover:underline">
              Transparência
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

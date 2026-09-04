import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getAllGuides,
  getBuyingGuides,
  getCategoriesWithGuides,
  getFeaturedGuides,
  getRecentGuides,
  getToolGuides,
} from '@/features/guides';
import { notFound } from 'next/navigation';
import { GuideCard } from '@/components/guides/GuideCard';
import { GuidesCollectionJsonLd } from '@/components/guides/JsonLd';
import { AffiliateDisclosure } from '@/components/guides/AffiliateDisclosure';
import { ProductSelectionSection } from '@/components/guides/ProductSelectionSection';
import { PUBLIC_GUIDES_PAGE_ENABLED } from '../publicCommercePages';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Guias PETMOL — decisões práticas para cães e gatos',
  description:
    'Guias, comparações e calculadoras próprias para tutores de cães e gatos: como escolher ração, comparar produtos por custo real, alimentação, higiene, casa, passeio, transporte e primeiros cuidados. Conteúdo editorial com fontes citadas. Acesso livre, sem cadastro.',
  alternates: { canonical: `${SITE_URL}/guias` },
  openGraph: {
    title: 'Guias PETMOL — cães e gatos',
    description:
      'Guias práticos para tutores de cães e gatos: como escolher ração, comparar produtos por custo real, higiene, casa, passeio e transporte.',
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
  // Guard reversível pela flag (ver publicCommercePages.ts). Hoje ATIVA.
  if (!PUBLIC_GUIDES_PAGE_ENABLED) notFound();

  const all = getAllGuides();
  const featured = getFeaturedGuides();
  const recent = getRecentGuides(4);
  const tools = getToolGuides();
  const buyingGuides = getBuyingGuides();
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
            Decisões práticas para cuidar melhor do seu pet
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-slate-500">
            Guias, comparações e ferramentas próprias para ajudar tutores de cães e gatos a escolher
            melhor produtos, organizar a rotina e entender o custo dos cuidados. Conteúdo editorial do
            PETMOL, com fontes citadas e critério de decisão em cada texto. Acesso livre, sem
            cadastro.
          </p>
          <p className="text-[12px] text-slate-400">
            {all.length} guias · {tools.length} calculadoras ·{' '}
            <Link href="/politica-editorial" className="underline hover:text-slate-600">
              como são produzidos
            </Link>
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
              🧮 Ferramentas PETMOL
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Faça as contas antes de escolher. Calculadoras próprias do PETMOL, feitas para planejar
              o gasto com ração e comparar opções — rodam no seu navegador e não guardam nenhum dado.
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

        {/* Guias de compra */}
        {buyingGuides.length > 0 && (
          <section aria-labelledby="guias-de-compra" className="mt-12">
            <h2 id="guias-de-compra" className="text-[13px] font-black uppercase tracking-wide text-slate-400">
              Guias de compra
            </h2>
            <p className="mb-4 mt-1 max-w-2xl text-[13px] text-slate-500">
              O que observar antes de escolher produtos para o seu pet — critérios, o que comparar e
              os erros mais comuns. Sem &ldquo;mais vendido&rdquo; e sem nota inventada.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {buyingGuides.map((guide) => (
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

        <ProductSelectionSection />

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

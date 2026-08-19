import type { Metadata } from 'next';
import Link from 'next/link';
import { STRATEGIC_PRODUCTS } from '@/features/commerce/strategicProducts';
import { StrategicProductGrid } from '@/features/commerce/StrategicProductGrid';
import { GUIDES } from '@/features/content/guides';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Recomendações PETMOL',
  description:
    'Curadoria PETMOL de produtos que ajudam na rotina de cães e gatos — alimentação, prevenção, transporte, medicação, hidratação e conforto. Consulte preço e disponibilidade direto na Amazon.',
  alternates: { canonical: `${SITE_URL}/loja` },
  openGraph: {
    title: 'Recomendações PETMOL',
    description: 'Curadoria PETMOL de produtos que ajudam na rotina do seu pet, com links diretos pra Amazon.',
    url: `${SITE_URL}/loja`,
  },
};

// Página pública, sem login — /loja é mantido como rota (evita quebrar
// links já compartilhados) mas o nome VISÍVEL da página é institucional
// ("Recomendações PETMOL"), nunca "Loja do Baby" ou de qualquer pet
// específico. Essa distinção existe porque o app tem vários usuários,
// cada um com vários pets — "Baby" é só o nome de UM pet de UM tutor,
// nunca um nome estrutural da loja (ver StrategicProductGrid.tsx e
// apps/web/src/app/(home)/... pra a versão "Loja do [pet]" autenticada).
export default function LojaPublicaPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-3xl mx-auto px-5 py-10 space-y-10">
        {/* Hero institucional */}
        <div className="text-center space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 text-[12px] font-bold px-3 py-1">
            🐾 Curadoria PETMOL
          </span>
          <h1 className="text-[28px] sm:text-[34px] font-black text-slate-900 leading-tight">
            Recomendações PETMOL
          </h1>
          <p className="text-[15px] text-slate-500 max-w-xl mx-auto leading-relaxed">
            O PETMOL não vende nem entrega nenhum produto — organizamos uma curadoria de categorias
            que ajudam na rotina real de cães e gatos (alimentação, prevenção, transporte, medicação,
            hidratação e conforto) e direcionamos você para lojas parceiras, como a Amazon.
          </p>
        </div>

        {/* Declaração de afiliado — obrigatória, sempre visível */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-center space-y-1.5">
          <p className="text-[13px] font-bold text-amber-900">
            Como participante do Programa de Associados da Amazon, sou remunerado pelas compras
            qualificadas efetuadas.
          </p>
          <p className="text-[12px] text-amber-800/80">
            O PETMOL pode receber comissão por compras realizadas por meio de alguns links, sem custo
            adicional para você.
          </p>
        </div>

        {/* Curadoria completa — toda a lista, agrupada por categoria */}
        <section>
          <h2 className="text-[13px] font-black uppercase tracking-wide text-slate-400 mb-4">
            Categorias da curadoria
          </h2>
          <StrategicProductGrid
            products={STRATEGIC_PRODUCTS}
            source="public_store"
            groupByCategory
            showGuideLinks
          />
        </section>

        {/* Guias originais */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-[17px] font-black text-slate-900 mb-1">Guias PETMOL</h2>
          <p className="text-[13px] text-slate-500 mb-4">
            Conteúdo completo sobre cada categoria — sem precisar criar conta.
          </p>
          <ul className="space-y-2">
            {GUIDES.map((guide) => (
              <li key={guide.slug}>
                <Link
                  href={`/guias/${guide.slug}`}
                  className="block rounded-xl border border-slate-100 px-4 py-3 text-[14px] font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50/50 transition-colors"
                >
                  {guide.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Convite pra conta — secundário, depois de toda a curadoria pública */}
        <section className="rounded-2xl bg-blue-600 text-white p-6 text-center space-y-3">
          <h2 className="text-[18px] font-black">Quer recomendações pro seu pet, não só gerais?</h2>
          <p className="text-[13px] text-blue-100 leading-relaxed max-w-md mx-auto">
            Criando uma conta gratuita no PETMOL, você cadastra cada pet e recebe recomendações
            filtradas pela espécie dele, além de lembrete automático de ração, vacina e
            antiparasitário.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-xl bg-white text-blue-700 text-[14px] font-black px-6 py-3 active:scale-95 transition-all"
          >
            Criar conta gratuita
          </Link>
        </section>

        <p className="text-center text-[11px] text-slate-400 leading-relaxed">
          Como Associados da Amazon, ganhamos com compras qualificadas. Os cards acima representam
          intenções de busca da nossa curadoria editorial, não ofertas confirmadas — preço,
          disponibilidade e estoque devem sempre ser conferidos direto na Amazon antes da compra.
        </p>
      </div>
    </div>
  );
}

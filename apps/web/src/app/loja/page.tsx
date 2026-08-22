import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GUIDES } from '@/features/content/guides';
import { HOME_SHOPPING_PARTNERS } from '@/features/commerce/homeShoppingPartners';
import { PUBLIC_STORE_PAGE_ENABLED } from '../publicCommercePages';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const STORE_IDS = new Set(['cobasi', 'shopee', 'zeenow', 'zeedog']);
const STORES = HOME_SHOPPING_PARTNERS.filter((partner) => STORE_IDS.has(partner.id));

export const metadata: Metadata = {
  title: 'Lojas PETMOL',
  description:
    'Lojas parceiras do PETMOL para comparar produtos pet por código de barras, nome do produto ou catálogo sincronizado.',
  alternates: { canonical: `${SITE_URL}/loja` },
  openGraph: {
    title: 'Lojas PETMOL',
    description: 'Cobasi, Shopee, Zee Now e Zee Dog no fluxo de compras do PETMOL.',
    url: `${SITE_URL}/loja`,
  },
};

// Página pública, sem login — /loja é mantido como rota (evita quebrar
// links já compartilhados) mas o nome VISÍVEL da página é institucional
// ("Recomendações PETMOL"), nunca "Loja do Baby" ou de qualquer pet
// específico. Essa distinção existe porque o app tem vários usuários,
// cada um com vários pets — "Baby" é só o nome de UM pet de UM tutor,
// nunca um nome estrutural da loja.
export default function LojaPublicaPage() {
  if (!PUBLIC_STORE_PAGE_ENABLED) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-3xl mx-auto px-5 py-10 space-y-10">
        <div className="text-center space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 text-[12px] font-bold px-3 py-1">
            🐾 Lojas PETMOL
          </span>
          <h1 className="text-[28px] sm:text-[34px] font-black text-slate-900 leading-tight">
            Compre com as lojas conectadas ao PETMOL
          </h1>
          <p className="text-[15px] text-slate-500 max-w-xl mx-auto leading-relaxed">
            O PETMOL não vende nem entrega produtos. A experiência de compra fica concentrada em
            Cobasi, Shopee, Zee Now e Zee Dog, priorizando ofertas por produto conhecido, código
            de barras ou catálogo sincronizado.
          </p>
        </div>

        <section>
          <h2 className="text-[13px] font-black uppercase tracking-wide text-slate-400 mb-4">
            Lojas mantidas no app
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STORES.map((store) => (
              <div key={store.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl border border-slate-100 bg-slate-50 p-2 flex items-center justify-center">
                    <img src={store.logoSrc} alt={store.logoAlt} className="max-w-full max-h-full object-contain" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-black text-slate-900">{store.name}</h2>
                    <p className="text-[12px] text-slate-500 leading-snug">{store.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
          Alguns links de compra podem gerar comissão para o PETMOL, sem custo adicional para você.
          Preço, pagamento, disponibilidade e entrega são responsabilidade da loja escolhida.
        </p>
      </div>
    </div>
  );
}

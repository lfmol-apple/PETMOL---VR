import Link from 'next/link';
import { getCategoriesWithGuides } from '@/features/guides';

/**
 * "O que você precisa?" — navegação por necessidade logo abaixo do hero.
 * Um card por categoria que TEM guias (nunca categoria vazia). Cada card
 * leva à âncora da categoria no próprio índice.
 */
export function NeedsNav() {
  const categories = getCategoriesWithGuides();
  if (categories.length === 0) return null;

  return (
    <section aria-labelledby="o-que-voce-precisa" className="mt-10">
      <h2 id="o-que-voce-precisa" className="mb-4 text-[13px] font-black uppercase tracking-wide text-slate-400">
        O que você precisa?
      </h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {categories.map(({ category, guides }) => (
          <Link
            key={category.id}
            href={`#${category.id}`}
            className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
          >
            <span className="text-[22px] leading-none" aria-hidden>
              {category.icon}
            </span>
            <span className="text-[14px] font-black leading-tight text-slate-900">{category.label}</span>
            <span className="text-[12px] leading-snug text-slate-500">{category.description}</span>
            <span className="mt-0.5 text-[11px] font-semibold text-slate-400">
              {guides.length} {guides.length === 1 ? 'guia' : 'guias'}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

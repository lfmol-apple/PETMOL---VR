import Link from 'next/link';
import type { Guide } from '@/features/guides';
import { getGuideCategory } from '@/features/guides';
import { formatGuideDate } from './format';

export function GuideCard({ guide, featured = false }: { guide: Guide; featured?: boolean }) {
  const category = getGuideCategory(guide.category);
  return (
    <Link
      href={`/guias/${guide.slug}`}
      className={`group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/40 ${
        featured ? 'sm:p-6' : ''
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
          <span aria-hidden>{category.icon}</span>
          {category.label}
        </span>
        {guide.tool && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
            com calculadora
          </span>
        )}
      </div>
      <p className={`font-black leading-tight text-slate-900 ${featured ? 'text-[17px]' : 'text-[15px]'}`}>
        {guide.title}
      </p>
      <p className="mt-1.5 flex-1 text-[13px] leading-snug text-slate-500">{guide.description}</p>
      <p className="mt-3 text-[11px] text-slate-400">
        {guide.readingTimeMinutes} min de leitura · atualizado em {formatGuideDate(guide.updatedAt)}
      </p>
    </Link>
  );
}

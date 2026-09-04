import Link from 'next/link';
import { getPopularTopics } from '@/features/guides';

/**
 * "Assuntos mais procurados" — chips compactos para destinos REAIS
 * (guia, âncora de categoria ou ferramenta). Lista curada em
 * `features/guides/index.ts`; nunca link morto.
 */
export function PopularTopics() {
  const topics = getPopularTopics();
  if (topics.length === 0) return null;

  return (
    <section aria-labelledby="mais-procurados" className="mt-12">
      <h2 id="mais-procurados" className="mb-3 text-[13px] font-black uppercase tracking-wide text-slate-400">
        Assuntos mais procurados
      </h2>
      <ul className="flex flex-wrap gap-2">
        {topics.map((t) => (
          <li key={t.href + t.label}>
            <Link
              href={t.href}
              className="inline-flex rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700"
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

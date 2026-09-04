import { GuideCard } from './GuideCard';
import type { Guide } from '@/features/guides';

/**
 * "Leia também" — bloco reutilizável de 2 a 4 guias relacionados.
 * Usado no fim de cada guia. Recebe guias já resolvidos (nada de lógica
 * de seleção aqui).
 */
export function ReadAlso({
  guides,
  title = 'Leia também',
}: {
  guides: Guide[];
  title?: string;
}) {
  const list = guides.slice(0, 4);
  if (list.length === 0) return null;

  return (
    <section aria-labelledby="leia-tambem" className="mt-10">
      <h2 id="leia-tambem" className="mb-3 text-[13px] font-black uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((g) => (
          <GuideCard key={g.slug} guide={g} />
        ))}
      </div>
    </section>
  );
}

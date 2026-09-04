import Link from 'next/link';
import { getClusterPlacements } from '@/features/guides/clusters';

/**
 * Mostra em que jornada(s) editorial(is) este guia está e qual é o
 * próximo passo — transforma páginas isoladas numa sequência. Só renderiza
 * quando o guia pertence a um cluster.
 */
export function ClusterNav({ slug }: { slug: string }) {
  const placements = getClusterPlacements(slug);
  if (placements.length === 0) return null;

  return (
    <div className="mt-8 space-y-3">
      {placements.map(({ cluster, index, total, prev, next }) => (
        <nav
          key={cluster.id}
          aria-label={`Sequência: ${cluster.label}`}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
        >
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
            <span aria-hidden className="mr-1">{cluster.icon}</span>
            Faz parte de: {cluster.label}
          </p>
          <p className="mt-1 text-[12px] leading-snug text-slate-500">
            Passo {index + 1} de {total}. {cluster.intro}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {prev && (
              <Link
                href={`/guias/${prev.slug}`}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] hover:border-blue-300"
              >
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">← Anterior</span>
                <span className="font-semibold text-slate-800">{prev.title}</span>
              </Link>
            )}
            {next && (
              <Link
                href={`/guias/${next.slug}`}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] hover:border-blue-300"
              >
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Próximo →</span>
                <span className="font-semibold text-slate-800">{next.title}</span>
              </Link>
            )}
          </div>
        </nav>
      ))}
    </div>
  );
}

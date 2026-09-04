import Link from 'next/link';
import type { GuideBlock } from '@/features/guides';
import { getGuideBySlug } from '@/features/guides';
import { GuideTool } from './calculators/GuideTool';

/**
 * Renderiza o corpo de um guia (GuideBlock[]) como HTML semântico.
 * Server Component — sem `dangerouslySetInnerHTML`, sem JS no cliente
 * (exceto o bloco `tool`, que monta um Client Component isolado).
 */
export function GuideBlocks({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </>
  );
}

function BlockView({ block }: { block: GuideBlock }) {
  switch (block.type) {
    case 'p':
      return <p className="text-[15px] leading-relaxed text-slate-700">{block.text}</p>;

    case 'h2':
      return (
        <h2 id={block.id} className="scroll-mt-24 pt-2 text-[19px] font-black text-slate-900">
          {block.text}
        </h2>
      );

    case 'h3':
      return <h3 className="text-[16px] font-bold text-slate-900">{block.text}</h3>;

    case 'ul':
      return (
        <ul className="ml-1 space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2 text-[15px] leading-relaxed text-slate-700">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case 'ol':
      return (
        <ol className="ml-1 space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-slate-700">
              <span aria-hidden className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-black text-blue-700">
                {i + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );

    case 'callout': {
      const styles = {
        info: 'border-slate-200 bg-slate-50 text-slate-700',
        tip: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        vet: 'border-amber-200 bg-amber-50 text-amber-900',
      }[block.tone];
      const label = { info: 'Nota', tip: 'Dica', vet: 'Saúde' }[block.tone];
      return (
        <aside className={`rounded-2xl border px-4 py-3 text-[13.5px] leading-relaxed ${styles}`}>
          <span className="mr-1.5 font-black uppercase tracking-wide text-[11px]">{label}</span>
          {block.text}
        </aside>
      );
    }

    case 'table':
      return (
        <figure className="space-y-1.5">
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  {block.headers.map((h, i) => (
                    <th key={i} scope="col" className="px-3 py-2 font-bold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {block.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 align-top">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.caption && (
            <figcaption className="text-[11.5px] text-slate-400">{block.caption}</figcaption>
          )}
        </figure>
      );

    case 'checklist':
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {block.title && (
            <p className="mb-2 text-[13px] font-black uppercase tracking-wide text-slate-500">
              {block.title}
            </p>
          )}
          <ul className="space-y-2">
            {block.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-slate-700">
                <span aria-hidden className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 border-slate-300 text-slate-300">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'links': {
      const items = block.items
        .map((it) => ({ ...it, guide: getGuideBySlug(it.slug) }))
        .filter((it) => it.guide);
      if (items.length === 0) return null;
      return (
        <aside className="rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-3">
          <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-blue-500">
            {block.title ?? 'Leia também'}
          </p>
          <ul className="space-y-1">
            {items.map((it) => (
              <li key={it.slug} className="text-[13.5px] leading-snug">
                <Link href={`/guias/${it.slug}`} className="font-semibold text-blue-700 hover:underline">
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      );
    }

    case 'tool':
      return (
        <div className="not-prose">
          <GuideTool tool={block.tool} />
        </div>
      );

    default:
      return null;
  }
}

import type { Guide } from '@/features/guides';
import { formatGuideDate } from './format';

/**
 * Assinatura editorial de um guia: autoria, datas e tempo de leitura.
 * "Equipe PETMOL" é a autoria institucional real — não inventa nome de
 * veterinário, especialista ou credencial profissional.
 */
export function EditorialByline({ guide }: { guide: Guide }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
        <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px]">
          🐾
        </span>
        Por Equipe PETMOL
      </span>
      <span aria-hidden className="text-slate-300">·</span>
      <span>Publicado em {formatGuideDate(guide.publishedAt)}</span>
      {guide.updatedAt !== guide.publishedAt && (
        <>
          <span aria-hidden className="text-slate-300">·</span>
          <span>Atualizado em {formatGuideDate(guide.updatedAt)}</span>
        </>
      )}
      <span aria-hidden className="text-slate-300">·</span>
      <span>{guide.readingTimeMinutes} min de leitura</span>
    </div>
  );
}

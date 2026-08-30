import type { Guide } from '@/features/guides';
import { getGuideCategory } from '@/features/guides';

/**
 * Hero do guia. Se o guia tem um asset original em /public (`hero`), usa a
 * imagem. Senão, gera uma arte própria do PETMOL — gradiente da marca +
 * ícone da categoria — que é digna, responsiva e nunca quebra. Nenhuma
 * imagem de terceiro, de fabricante ou "foto" que não seja foto.
 */
export function GuideHero({ guide }: { guide: Guide }) {
  const category = getGuideCategory(guide.category);

  if (guide.hero) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={guide.hero}
          alt={guide.heroAlt ?? guide.title}
          width={1200}
          height={630}
          className="h-auto w-full object-cover"
          loading="eager"
        />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={`${category.label} — arte ilustrativa do guia`}
      className="relative flex aspect-[1200/560] w-full items-center justify-center overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-[#0056D2] via-[#0b64e6] to-[#3f8bff]"
    >
      <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_1px,transparent_1px),radial-gradient(circle_at_70%_60%,white_1px,transparent_1px)] [background-size:28px_28px,44px_44px]" />
      <div className="relative flex flex-col items-center gap-2 px-6 text-center">
        <span className="text-5xl sm:text-6xl" aria-hidden>
          {category.icon}
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.28em] text-white/80">
          {category.label}
        </span>
        <span className="max-w-md text-[15px] font-bold leading-snug text-white sm:text-[17px]">
          {guide.headline ?? guide.title}
        </span>
        <span className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-white/50">
          Guias PETMOL 🐾
        </span>
      </div>
    </div>
  );
}

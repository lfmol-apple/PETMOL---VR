import type { GuideSource } from '@/features/guides';

/**
 * Fontes e referências de um guia. Só entra quando o texto faz uma
 * afirmação técnica que merece origem — nunca uma lista decorativa. Links
 * externos sempre com rel de segurança.
 */
export function SourcesList({ sources }: { sources: GuideSource[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <section aria-labelledby="fontes" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <h2 id="fontes" className="text-[14px] font-black text-slate-700">
        Fontes e referências
      </h2>
      <ul className="mt-2 space-y-1.5">
        {sources.map((source) => (
          <li key={source.url} className="text-[13px] leading-snug text-slate-600">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-semibold text-blue-600 hover:underline"
            >
              {source.label}
            </a>{' '}
            — {source.publisher}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-400">
        Links para sites externos. O conteúdo do PETMOL é uma síntese prática, não uma cópia dessas
        fontes.
      </p>
    </section>
  );
}

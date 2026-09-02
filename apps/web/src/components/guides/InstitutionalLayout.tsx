import Link from 'next/link';
import type { ReactNode } from 'react';

/** Casca visual comum das páginas institucionais públicas (/sobre, /politica-editorial, /transparencia). */
export function InstitutionalLayout({
  title,
  intro,
  updatedAt,
  children,
}: {
  title: string;
  intro: string;
  updatedAt?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-12">
        <nav aria-label="Trilha" className="mb-4 text-[12px] text-slate-400">
          <Link href="/" className="hover:text-slate-600">
            Início
          </Link>{' '}
          / <span className="text-slate-600">{title}</span>
        </nav>
        <header className="space-y-2">
          <h1 className="text-[28px] font-black leading-tight text-slate-900 sm:text-[32px]">{title}</h1>
          <p className="text-[15px] leading-relaxed text-slate-500">{intro}</p>
          {updatedAt && <p className="text-[12px] text-slate-400">Atualizado em {updatedAt}</p>}
        </header>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-slate-700 [&_h2]:pt-2 [&_h2]:text-[18px] [&_h2]:font-black [&_h2]:text-slate-900 [&_ul]:ml-1 [&_ul]:space-y-1.5 [&_a]:font-semibold [&_a]:text-blue-600 [&_a:hover]:underline">
          {children}
        </div>
        <nav aria-label="Páginas institucionais" className="mt-12 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-6 text-[13px]">
          <Link href="/recommendations" className="font-semibold text-blue-600 hover:underline">
            Recommendations
          </Link>
          <Link href="/sobre" className="font-semibold text-blue-600 hover:underline">
            Sobre
          </Link>
          <Link href="/politica-editorial" className="font-semibold text-blue-600 hover:underline">
            Política editorial
          </Link>
          <Link href="/transparencia" className="font-semibold text-blue-600 hover:underline">
            Transparência
          </Link>
        </nav>
      </div>
    </div>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

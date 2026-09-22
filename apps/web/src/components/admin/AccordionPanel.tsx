'use client';

import { useState, type ReactNode } from 'react';

/**
 * Seção recolhível do Mission Control (fusão das abas numa página só).
 * O conteúdo só é MONTADO quando aberto (lazy) — uma seção fechada não
 * dispara nenhuma chamada de API; abrir busca na hora. Fechar desmonta de
 * novo, então um painel com polling (Operação) para de bater no servidor
 * quando ninguém está olhando.
 */
export function AccordionPanel({ letter, title, subtitle, defaultOpen = false, children }: {
  letter: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[12px] font-black text-slate-500">
            {letter}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="truncate text-[11px] text-slate-400">{subtitle}</p>}
          </div>
        </div>
        <svg viewBox="0 0 20 20" className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && <div className="border-t border-slate-100 p-4">{children}</div>}
    </section>
  );
}

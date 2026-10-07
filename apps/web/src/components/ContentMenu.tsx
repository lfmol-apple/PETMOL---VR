'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, LogOut } from 'lucide-react';
import { isNativeAppClient } from '@/lib/nativeApp';

/**
 * Menu de barras (☰) do Header para a área de conteúdo do PETMOL.
 *
 *   🏠 Início           → homeHref         (quando logado — 2ª forma de voltar à Home)
 *   🐾 Guias           → /guias           (conteúdo PETMOL em português)
 *   📖 Recommendations → /recommendations (pet picks in English) — SÓ WEB
 *   ⏏ Sair             → onLogout         (quando logado — saiu do header principal)
 *
 * `/recommendations` é a área Amazon Associates US e continua web-only
 * (middleware redireciona o UA nativo, links já escondidos em #170). Aqui
 * seguimos a mesma regra: no app nativo o menu só mostra "Guias".
 *
 * Discreto, sem dependência nova. Fecha ao escolher, ao clicar fora e no Esc.
 */
const MENU_WIDTH = 248;

export function ContentMenu({ homeHref, onLogout }: { homeHref?: string; onLogout?: () => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showEnglishArea, setShowEnglishArea] = useState(true);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    // App nativo: "Recommendations" (Amazon US) não entra no menu.
    setShowEnglishArea(!isNativeAppClient());
  }, []);

  useEffect(() => {
    if (!open) return;
    // O menu abre em position:fixed ancorado ao viewport — nunca sai da tela
    // pela esquerda (o botão ☰ fica no meio do header, não na borda direita).
    const place = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
      setPos({ top: r.bottom + 8, left });
    };
    place();
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const onContentArea = pathname.startsWith('/guias') || pathname.startsWith('/recommendations');

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu de conteúdo"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors active:scale-95 ${
          open || onContentArea
            ? 'border-[#0056D2]/25 bg-blue-100 text-[#0056D2]'
            : 'border-[#0056D2]/15 bg-blue-50 text-[#0056D2] hover:bg-blue-100'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open && pos && (
        <div
          id={menuId}
          role="menu"
          aria-label="Conteúdo"
          style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
          className="fixed z-50 max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.22)]"
        >
          {homeHref && (
            <Link
              href={homeHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-blue-50"
            >
              <House className="h-4 w-4 flex-shrink-0 text-[#0056D2]" strokeWidth={2.2} />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-black text-slate-900">Início</span>
                <span className="text-[12px] text-slate-500">Voltar para a Home</span>
              </span>
            </Link>
          )}

          <Link
            href="/guias"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={`flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-blue-50 ${
              homeHref ? 'border-t border-slate-100' : ''
            } ${pathname.startsWith('/guias') ? 'bg-blue-50' : ''}`}
          >
            <span className="text-[14px] font-black text-slate-900">
              <span aria-hidden className="mr-1.5">🐾</span>Guias
            </span>
            <span className="text-[12px] text-slate-500">Conteúdo PETMOL em português</span>
          </Link>

          {showEnglishArea && (
            <Link
              href="/recommendations"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`flex flex-col gap-0.5 border-t border-slate-100 px-4 py-3 transition-colors hover:bg-blue-50 ${
                pathname.startsWith('/recommendations') ? 'bg-blue-50' : ''
              }`}
            >
              <span className="text-[14px] font-black text-slate-900">
                <span aria-hidden className="mr-1.5">📖</span>Recomendações
              </span>
              <span className="text-[12px] text-slate-500">Produtos selecionados, em inglês</span>
            </Link>
          )}

          {onLogout && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-3 text-left transition-colors hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4 flex-shrink-0 text-slate-500" strokeWidth={2.2} />
              <span className="text-[14px] font-black text-slate-700">Sair</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

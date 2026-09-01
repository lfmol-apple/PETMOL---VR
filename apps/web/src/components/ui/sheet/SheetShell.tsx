'use client';

/**
 * SheetShell — casca compartilhada de TODO sheet/modal do app.
 *
 * Unifica scrim, container, cantos, sombra, animação, safe-area, trava de
 * scroll do body, fechar por ESC / clique no backdrop e o portal.
 *
 *   <SheetShell open={open} onClose={onClose} tone="cream">
 *     <SheetHeader title="…" onClose={onClose} />
 *     <SheetShell.Body>…conteúdo rolável…</SheetShell.Body>
 *     <SheetShell.Footer>…ações fixas…</SheetShell.Footer>
 *   </SheetShell>
 */
import { useEffect, type ReactNode } from 'react';
import { ModalPortal } from '@/components/ModalPortal';

type Tone = 'white' | 'cream' | 'grey';
type Size = 'sm' | 'md' | 'lg';
type Variant = 'bottom' | 'center';

const TONE_BG: Record<Tone, string> = {
  white: 'bg-white',
  cream: 'bg-[#fbfaf7]',
  grey: 'bg-[#f2f2f7]',
};

export const SHEET_TONE_RING_OFFSET: Record<Tone, string> = {
  white: 'focus-visible:ring-offset-white',
  cream: 'focus-visible:ring-offset-[#fbfaf7]',
  grey: 'focus-visible:ring-offset-[#f2f2f7]',
};

const SIZE_MAX: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

interface SheetShellProps {
  open?: boolean;
  onClose: () => void;
  children: ReactNode;
  tone?: Tone;
  size?: Size;
  variant?: Variant;
  /** trava scroll do body enquanto aberto (default true) */
  lockScroll?: boolean;
  /** clique no backdrop fecha (default true) */
  dismissOnBackdrop?: boolean;
  className?: string;
  /** z-index base — alguns sheets empilham sobre outros */
  z?: number;
}

export function SheetShell({
  open = true,
  onClose,
  children,
  tone = 'white',
  size = 'lg',
  variant = 'bottom',
  lockScroll = true,
  dismissOnBackdrop = true,
  className = '',
  z = 50,
}: SheetShellProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    let prevOverflow = '';
    if (lockScroll) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      if (lockScroll) document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, lockScroll]);

  if (!open) return null;

  const wrapPos =
    variant === 'center'
      ? 'items-center justify-center p-4'
      : 'items-end justify-center sm:items-center sm:p-4';

  const containerShape =
    variant === 'center'
      ? 'rounded-[26px] animate-scaleIn'
      : 'rounded-t-[26px] sm:rounded-[26px] animate-slideUp sm:animate-scaleIn';

  return (
    <ModalPortal>
      <div className={`fixed inset-0 flex ${wrapPos}`} style={{ zIndex: z }} role="dialog" aria-modal="true">
        <div
          className="absolute inset-0 bg-slate-950/60 backdrop-blur-xl"
          onClick={dismissOnBackdrop ? onClose : undefined}
        />
        <div
          className={`relative isolate flex w-full ${SIZE_MAX[size]} flex-col overflow-hidden ${containerShape} ${TONE_BG[tone]} shadow-[0_-8px_50px_-8px_rgba(15,23,42,0.35)] ring-1 ring-black/5 ${className}`}
          style={{ maxHeight: '92dvh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {variant === 'bottom' && (
            <div className="flex flex-shrink-0 justify-center pt-2.5 pb-1 sm:hidden">
              <div className="h-1 w-9 rounded-full bg-slate-300/80" />
            </div>
          )}
          {children}
        </div>
      </div>
    </ModalPortal>
  );
}

function Body({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] ${className}`}
    >
      {children}
    </div>
  );
}

function Footer({ children, tone = 'white' }: { children: ReactNode; tone?: Tone }) {
  return (
    <div
      className={`flex-shrink-0 border-t border-black/5 ${TONE_BG[tone]} px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]`}
    >
      {children}
    </div>
  );
}

SheetShell.Body = Body;
SheetShell.Footer = Footer;

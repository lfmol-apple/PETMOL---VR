'use client';

/**
 * SheetHeader — cabeçalho padrão de sheet: camada OPACA própria (o fundo
 * nunca vaza atrás do título), mídia (avatar/ícone) + título + subtítulo +
 * status, e um botão fechar (X) ou voltar (chevron) sempre centralizado.
 */
import { ChevronLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { SHEET_TONE_RING_OFFSET } from './SheetShell';

type Tone = 'white' | 'cream' | 'grey';
type StatusTone = 'neutral' | 'good' | 'warn' | 'danger';

const STATUS_DOT: Record<StatusTone, string> = {
  neutral: 'bg-slate-300',
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  danger: 'bg-rose-500',
};

interface SheetHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: { label: string; tone?: StatusTone };
  /** avatar, ícone ou qualquer nó de 40–44px */
  media?: ReactNode;
  onClose?: () => void;
  onBack?: () => void;
  /** ação extra à esquerda do botão fechar (ex.: "Excluir") */
  action?: ReactNode;
  tone?: Tone;
  /** esconde a hairline inferior */
  flush?: boolean;
}

export function SheetHeader({
  title,
  subtitle,
  status,
  media,
  onClose,
  onBack,
  action,
  tone = 'white',
  flush = false,
}: SheetHeaderProps) {
  const toneBg = tone === 'cream' ? 'bg-[#fbfaf7]' : tone === 'grey' ? 'bg-[#f2f2f7]' : 'bg-white';
  const btn = `-mr-1 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-900/[0.06] text-slate-500 transition-colors duration-150 hover:bg-slate-900/[0.1] hover:text-slate-800 active:scale-90 motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${SHEET_TONE_RING_OFFSET[tone]}`;

  return (
    <div className={`relative z-10 flex-shrink-0 ${toneBg}`}>
      <div className="flex items-center gap-3 px-5 pb-4 pt-1.5 sm:pt-4">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Voltar" className={`${btn} -ml-1 mr-0`}>
            <ChevronLeft className="h-[17px] w-[17px]" strokeWidth={2.5} />
          </button>
        )}
        {media && <div className="flex-shrink-0">{media}</div>}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-bold leading-[1.15] tracking-[-0.01em] text-slate-900">{title}</h2>
          {(subtitle || status) && (
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12.5px] font-medium leading-tight text-slate-500">
              {subtitle && <span className="truncate">{subtitle}</span>}
              {subtitle && status && <span className="text-slate-300">·</span>}
              {status && (
                <span className="inline-flex flex-shrink-0 items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status.tone ?? 'neutral']}`} />
                  {status.label}
                </span>
              )}
            </div>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Fechar" className={btn}>
            <X className="h-[15px] w-[15px]" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {!flush && <div className="mx-5 h-px bg-gradient-to-r from-transparent via-slate-900/[0.07] to-transparent" />}
    </div>
  );
}

/** Avatar circular padrão pro header (pet, tutor). */
export function SheetAvatar({ src, alt, fallback }: { src?: string | null; alt?: string; fallback?: ReactNode }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white text-xl shadow-[0_2px_10px_rgba(15,23,42,0.12)] ring-2 ring-white">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt || ''} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span>{fallback ?? '🐶'}</span>
      )}
    </div>
  );
}

/** Ícone em quadrado arredondado pro header (ações sem pet). */
export function SheetIcon({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'blue' }) {
  const map = {
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
    blue: 'bg-blue-50 text-blue-600 ring-blue-100',
  } as const;
  return (
    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ring-black/5 ${map[tone]}`}>
      {children}
    </div>
  );
}

/** Chip pequeno (nome do pet, etc.) pro subtítulo do header. */
export function SheetChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-900/[0.05] px-2 py-0.5 text-[11.5px] font-semibold text-slate-500">
      {children}
    </span>
  );
}

/** Rótulo de seção (11px, bold, tracking legível). */
export function SheetSectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] font-bold uppercase tracking-[0.13em] text-slate-400 ${className}`}>{children}</p>
  );
}

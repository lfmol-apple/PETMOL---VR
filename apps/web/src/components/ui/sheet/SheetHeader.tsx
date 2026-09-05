'use client';

/**
 * SheetHeader — cabeçalho padrão de sheet.
 *
 * - `tone` claro (white/cream/grey): camada opaca, título escuro, botões
 *   cinza. É o cabeçalho discreto de sempre.
 * - `tone="petmol"`: bloco azul institucional com uma profundidade radial
 *   MUITO sutil (linguagem do BrandBackground, sem trazer o BrandBackground
 *   inteiro). Título branco, subtítulo branco/translúcido, botões brancos
 *   translúcidos. Compacto — nunca vira banner. É a identidade dos sheets
 *   principais do pet, no mesmo espírito da Loja do Pet.
 *
 * Em `tone="petmol"` num bottom-sheet, passe `withHandle` e diga ao
 * SheetShell `hideHandle` — o "puxador" fica sobre o azul, sem faixa branca
 * estranha entre ele e o header.
 */
import { ChevronLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { SHEET_TONE_RING_OFFSET } from './SheetShell';

type Tone = 'white' | 'cream' | 'grey' | 'petmol';
type StatusTone = 'neutral' | 'good' | 'warn' | 'danger';

const STATUS_DOT: Record<StatusTone, string> = {
  neutral: 'bg-slate-300',
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  danger: 'bg-rose-500',
};

// No fundo azul os pontos de status precisam de contraste próprio.
const STATUS_DOT_ON_PETMOL: Record<StatusTone, string> = {
  neutral: 'bg-white/60',
  good: 'bg-emerald-300',
  warn: 'bg-amber-300',
  danger: 'bg-rose-300',
};

/** Azul PETMOL + profundidade radial discreta (linguagem do BrandBackground:
 *  #3B82F6 / #1E40AF), sobre o azul institucional #0056D2 usado no app. */
export const PETMOL_HEADER_BG =
  'bg-[#0056D2] bg-[radial-gradient(120%_140%_at_12%_-10%,#2f6fe0_0%,#0056D2_46%,#00427e_100%)] text-white';

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
  /** esconde a hairline inferior (ignorado em petmol — nunca tem hairline) */
  flush?: boolean;
  /** desenha o "puxador" do bottom-sheet dentro do próprio header (petmol) */
  withHandle?: boolean;
  /** deixa o título quebrar em 2 linhas em vez de truncar */
  wrapTitle?: boolean;
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
  withHandle = false,
  wrapTitle = false,
}: SheetHeaderProps) {
  const isPetmol = tone === 'petmol';

  const toneBg = isPetmol
    ? PETMOL_HEADER_BG + ' shadow-[0_6px_20px_-10px_rgba(0,66,126,0.7)]'
    : tone === 'cream'
      ? 'bg-[#fbfaf7]'
      : tone === 'grey'
        ? 'bg-[#f2f2f7]'
        : 'bg-white';

  const btn = isPetmol
    ? '-mr-1 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors duration-150 hover:bg-white/25 active:scale-90 motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0056D2]'
    : `-mr-1 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-900/[0.06] text-slate-500 transition-colors duration-150 hover:bg-slate-900/[0.1] hover:text-slate-800 active:scale-90 motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${SHEET_TONE_RING_OFFSET[tone as 'white' | 'cream' | 'grey'] ?? 'focus-visible:ring-offset-white'}`;

  const titleCls = isPetmol
    ? `text-[17px] font-black leading-[1.15] tracking-[-0.01em] text-white ${wrapTitle ? '[overflow-wrap:anywhere]' : 'truncate'}`
    : `text-[17px] font-bold leading-[1.15] tracking-[-0.01em] text-slate-900 ${wrapTitle ? '[overflow-wrap:anywhere]' : 'truncate'}`;

  const subtitleTextCls = isPetmol
    ? 'text-[12px] font-semibold uppercase leading-tight tracking-[0.1em] text-white/75'
    : 'text-[13px] font-medium leading-tight text-slate-600';

  const dotMap = isPetmol ? STATUS_DOT_ON_PETMOL : STATUS_DOT;

  const statusNode = status && (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotMap[status.tone ?? 'neutral']}`} />
      <span className="truncate">{status.label}</span>
    </span>
  );

  return (
    <div className={`relative z-10 flex-shrink-0 ${toneBg}`}>
      {isPetmol && withHandle && (
        <div className="flex justify-center pt-2.5 pb-0.5 sm:hidden">
          <div className="h-1 w-9 rounded-full bg-white/40" />
        </div>
      )}
      <div className={`flex gap-3 px-5 pb-4 ${wrapTitle ? 'items-start' : 'items-center'} ${isPetmol && withHandle ? 'pt-1.5' : 'pt-1.5 sm:pt-4'} ${isPetmol && !withHandle ? 'pt-4' : ''}`}>
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Voltar" className={`${btn} -ml-1 mr-0 ${wrapTitle ? 'mt-0.5' : ''}`}>
            <ChevronLeft className="h-[17px] w-[17px]" strokeWidth={2.5} />
          </button>
        )}
        {media && <div className="flex-shrink-0">{media}</div>}
        <div className={`min-w-0 flex-1 ${wrapTitle ? 'pt-0.5' : ''}`}>
          <h2 className={titleCls}>{title}</h2>
          {/* subtítulo + status: numa linha só quando há um deles; empilhados
              (subtítulo em cima, status embaixo) quando há os dois — assim o
              nome do pet nunca é cortado pra caber um status longo. */}
          {subtitle && status ? (
            <div className={`mt-0.5 min-w-0 space-y-0.5 ${subtitleTextCls}`}>
              <p className="truncate">{subtitle}</p>
              <p className="min-w-0">{statusNode}</p>
            </div>
          ) : (subtitle || status) ? (
            <div className={`mt-0.5 flex min-w-0 items-center gap-2 ${subtitleTextCls}`}>
              {subtitle ? <span className="truncate">{subtitle}</span> : statusNode}
            </div>
          ) : null}
        </div>
        {action && <div className={`flex-shrink-0 ${wrapTitle ? 'mt-0.5' : ''}`}>{action}</div>}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Fechar" className={`${btn} ${wrapTitle ? 'mt-0.5' : ''}`}>
            <X className="h-[15px] w-[15px]" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {!isPetmol && !flush && (
        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-slate-900/[0.07] to-transparent" />
      )}
    </div>
  );
}

/** Avatar circular padrão pro header (pet, tutor). Funciona em fundo claro
 *  e no azul (anel branco translúcido). */
export function SheetAvatar({ src, alt, fallback }: { src?: string | null; alt?: string; fallback?: ReactNode }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white text-xl shadow-[0_2px_10px_rgba(15,23,42,0.18)] ring-2 ring-white/70">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt || ''} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span>{fallback ?? '🐶'}</span>
      )}
    </div>
  );
}

/** Ícone em quadrado arredondado pro header (ações sem pet).
 *  `tone="onPetmol"` = quadrado branco com ícone azul, pra usar sobre o
 *  cabeçalho petmol. */
export function SheetIcon({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'blue' | 'onPetmol';
}) {
  const map = {
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
    blue: 'bg-blue-50 text-blue-600 ring-blue-100',
    onPetmol: 'bg-white text-[#0056D2] ring-white/60 shadow-[0_2px_10px_rgba(0,0,0,0.18)]',
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

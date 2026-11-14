'use client';

import { useCallback, useEffect, useId, useMemo, useRef } from 'react';

interface ReminderPickerProps {
  days: string;
  time: string;
  onDaysChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  label?: string;
  /** Maior antecedência oferecida (padrão 30). Valores já cadastrados acima disso continuam aparecendo e sendo preservados. */
  max?: number;
}

const ITEM_PX = 44;   // largura de cada dia na régua
const GAP_PX = 8;
const STEP_PX = ITEM_PX + GAP_PX;

/** Índice do dia que está no centro da régua, a partir da rolagem horizontal. */
export function indexFromScroll(scrollLeft: number, step: number, count: number): number {
  if (!Number.isFinite(scrollLeft) || step <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / step)));
}

/** Frase de leitura do valor ("no próprio dia", "1 dia antes", "7 dias antes"). */
export function daysPhrase(n: number | null): string {
  if (n === null) return 'não definido';
  if (n === 0) return 'no próprio dia';
  return n === 1 ? '1 dia antes' : `${n} dias antes`;
}

function parseDays(v: string): number | null {
  if (!/^\s*-?\d+\s*$/.test(v)) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Configurador do lembrete: "🔔 Lembrar [N dias antes] às [HH:MM]" com uma RÉGUA de dias que se arrasta para os lados
 * (0 a 30; o dia do centro é o escolhido). Toque num dia também escolhe. Teclado: ← → (±1), PageUp/PageDown (±5), Home/End.
 * Leitor de tela: um controle deslizante com o valor falado ("3 dias antes"). Valores já gravados fora da faixa (ou não
 * inteiros) nunca são trocados sozinhos: o fora-da-faixa aparece como um dia extra e o inválido fica "não definido" até você escolher.
 * Contrato inalterado: `days` e `onDaysChange` continuam texto, `time` em "HH:MM".
 */
export function ReminderPicker({ days, time, onDaysChange, onTimeChange, label, max = 30 }: ReminderPickerProps) {
  const id = useId();
  const current = parseDays(days);
  const options = useMemo(() => {
    const base = Array.from({ length: max + 1 }, (_, i) => i);
    return current !== null && (current < 0 || current > max) ? [...base, current] : base;   // preserva o valor já cadastrado
  }, [current, max]);
  const strip = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmatic = useRef(false);
  const selectedIdx = current === null ? -1 : options.indexOf(current);

  const centerOn = useCallback((idx: number, smooth: boolean) => {
    const el = strip.current;
    if (!el || idx < 0) return;
    programmatic.current = true;
    const left = idx * STEP_PX;
    if (typeof el.scrollTo === 'function') {
      const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    } else el.scrollLeft = left;
    setTimeout(() => { programmatic.current = false; }, 400);
  }, []);

  // valor mudou por fora (ou na abertura): centraliza o dia escolhido
  useEffect(() => { centerOn(selectedIdx, false); }, [selectedIdx, centerOn]);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  const choose = (n: number) => { if (n !== current) onDaysChange(String(n)); };
  const step = (delta: number) => {
    const from = selectedIdx < 0 ? Math.min(3, max) : selectedIdx;
    const idx = Math.min(options.length - 1, Math.max(0, from + delta));
    choose(options[idx]);
    centerOn(idx, true);
  };

  const onScroll = () => {
    if (programmatic.current) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {                       // ao parar de arrastar, vale o dia que ficou no centro
      const el = strip.current;
      if (!el) return;
      choose(options[indexFromScroll(el.scrollLeft, STEP_PX, options.length)]);
    }, 110);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowUp') step(1);
    else if (k === 'ArrowLeft' || k === 'ArrowDown') step(-1);
    else if (k === 'PageUp') step(5);
    else if (k === 'PageDown') step(-5);
    else if (k === 'Home') step(-options.length);
    else if (k === 'End') step(options.length);
    else return;
    e.preventDefault();
  };

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white px-3 py-2.5">
      {label && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-600">{label}</p>}
      <div className="flex items-center gap-2">
        <span className="flex-shrink-0 text-[14px] leading-none" aria-hidden>🔔</span>
        <span id={`${id}-t`} className="min-w-0 flex-1 text-[13px] font-semibold text-slate-700" aria-live="polite">
          Lembrar <span className="font-extrabold text-[#0056D2]">{daysPhrase(current)}</span>
        </span>
        <input
          type="time"
          aria-label="Horário do lembrete"
          value={time}
          onChange={(e) => onTimeChange(e.target.value)}
          className="flex-shrink-0 rounded-lg border border-blue-200 bg-white px-1.5 py-1 text-[13px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Antecedência do lembrete, em dias"
        aria-valuemin={0}
        aria-valuemax={options[options.length - 1]}
        aria-valuenow={current ?? undefined}
        aria-valuetext={daysPhrase(current)}
        aria-describedby={`${id}-h`}
        onKeyDown={onKeyDown}
        className="relative mt-2 w-full min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#0056D2]/50"
      >
        <div
          ref={strip}
          onScroll={onScroll}
          data-testid="reminder-strip"
          className="flex w-full min-w-0 snap-x snap-mandatory items-center overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ gap: GAP_PX, paddingInline: `calc(50% - ${ITEM_PX / 2}px)`, WebkitOverflowScrolling: 'touch',
            maskImage: 'linear-gradient(to right, transparent, #000 18%, #000 82%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, #000 18%, #000 82%, transparent)' }}
        >
          {options.map((n, i) => {
            const on = i === selectedIdx;
            const near = selectedIdx >= 0 && Math.abs(i - selectedIdx) <= 1;
            return (
              <div
                key={n}
                aria-hidden
                data-day={n}
                data-selected={on || undefined}
                onClick={() => { choose(n); centerOn(i, true); }}
                style={{ width: ITEM_PX, height: ITEM_PX }}
                className={`flex flex-shrink-0 cursor-pointer snap-center select-none items-center justify-center rounded-full text-[15px] font-bold tabular-nums transition-all duration-150 ${
                  on ? 'scale-110 bg-gradient-to-br from-[#0056D2] to-[#4F46E5] text-white shadow-md ring-2 ring-white'
                  : near ? 'bg-white text-slate-700 shadow-sm ring-1 ring-blue-100' : 'bg-white/70 text-slate-400 ring-1 ring-slate-100'}`}
              >
                {n}
              </div>
            );
          })}
        </div>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -ml-[30px] w-[60px] rounded-full ring-1 ring-[#0056D2]/15" />
      </div>
      <p id={`${id}-h`} className="mt-1 text-center text-[11px] text-slate-500">Arraste os dias para os lados ou use as setas ← →</p>
    </div>
  );
}

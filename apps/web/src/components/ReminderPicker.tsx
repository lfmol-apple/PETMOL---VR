'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

interface ReminderPickerProps {
  days: string;
  time: string;
  onDaysChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  label?: string;
  /** Esconde o horário (telas em que o lembrete só tem a antecedência). */
  hideTime?: boolean;
  /** Maior antecedência oferecida (padrão 30). Valores já cadastrados acima disso continuam aparecendo e sendo preservados. */
  max?: number;
}

const ROW_PX = 30;          // altura de cada linha da roleta
const VISIBLE = 5;          // linhas visíveis (2 acima, a escolhida, 2 abaixo) — como a roleta de data do iPhone
const PAD_ROWS = (VISIBLE - 1) / 2;

/** Índice da linha que está no centro da roleta, a partir da rolagem vertical. */
export function indexFromScroll(scrollTop: number, step: number, count: number): number {
  if (!Number.isFinite(scrollTop) || step <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollTop / step)));
}

/** Frase de leitura do valor ("no próprio dia", "1 dia antes", "7 dias antes"). */
export function daysPhrase(n: number | null): string {
  if (n === null) return 'não definido';
  if (n === 0) return 'no próprio dia';
  return n === 1 ? '1 dia antes' : `${n} dias antes`;
}

function rowLabel(n: number): string {
  return n === 0 ? 'no dia' : n === 1 ? '1 dia' : `${n} dias`;
}

function parseDays(v: string): number | null {
  if (!/^\s*-?\d+\s*$/.test(v)) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Configurador do lembrete: "🔔 Lembrar [N dias antes] às [HH:MM]" com uma ROLETA vertical de dias, no estilo da roleta de
 * data do iPhone (0 a 30; a linha do centro é a escolhida, as vizinhas esmaecem). Arraste para cima/baixo; toque numa linha também
 * escolhe. Teclado: ↑ ↓ (±1), PageUp/PageDown (±5), Home/End. Leitor de tela: um controle deslizante com o valor falado ("3 dias antes").
 * Valores já gravados fora da faixa (ou não inteiros) nunca são trocados sozinhos: o fora-da-faixa aparece como uma linha extra e
 * o inválido fica "não definido" até você escolher. Contrato inalterado: `days` e `onDaysChange` continuam texto, `time` em "HH:MM".
 */
export function ReminderPicker({ days, time, onDaysChange, onTimeChange, label, max = 30, hideTime = false }: ReminderPickerProps) {
  const id = useId();
  const current = parseDays(days);
  const options = useMemo(() => {
    const base = Array.from({ length: max + 1 }, (_, i) => i);
    return current !== null && (current < 0 || current > max) ? [...base, current] : base;   // preserva o valor já cadastrado
  }, [current, max]);
  const wheel = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmatic = useRef(false);
  const selectedIdx = current === null ? -1 : options.indexOf(current);
  const [liveIdx, setLiveIdx] = useState(selectedIdx);       // linha sob o centro ENQUANTO arrasta (só visual)

  const centerOn = useCallback((idx: number, smooth: boolean) => {
    const el = wheel.current;
    if (!el || idx < 0) return;
    programmatic.current = true;
    const top = idx * ROW_PX;
    if (typeof el.scrollTo === 'function') {
      const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ top, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    } else el.scrollTop = top;
    setTimeout(() => { programmatic.current = false; }, 400);
  }, []);

  // valor mudou por fora (ou na abertura): centraliza a linha escolhida
  useEffect(() => { setLiveIdx(selectedIdx); centerOn(selectedIdx, false); }, [selectedIdx, centerOn]);
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
    const el = wheel.current;
    if (!el) return;
    setLiveIdx(indexFromScroll(el.scrollTop, ROW_PX, options.length));
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {                       // ao parar de arrastar, vale a linha que ficou no centro
      const e2 = wheel.current;
      if (!e2) return;
      choose(options[indexFromScroll(e2.scrollTop, ROW_PX, options.length)]);
    }, 110);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight') step(1);
    else if (k === 'ArrowUp' || k === 'ArrowLeft') step(-1);
    else if (k === 'PageDown') step(5);
    else if (k === 'PageUp') step(-5);
    else if (k === 'Home') step(-options.length);
    else if (k === 'End') step(options.length);
    else return;
    e.preventDefault();
  };

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white px-3 py-2.5">
      {label && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-600">{label}</p>}
      <div className="flex items-center gap-3">
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
          className="relative w-[112px] flex-shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#0056D2]/50"
          style={{ height: ROW_PX * VISIBLE }}
        >
          {/* faixa do centro: a linha escolhida */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 rounded-lg bg-[#0056D2]/10 ring-1 ring-[#0056D2]/20" style={{ top: ROW_PX * PAD_ROWS, height: ROW_PX }} />
          <div
            ref={wheel}
            onScroll={onScroll}
            data-testid="reminder-wheel"
            className="relative h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{
              paddingBlock: ROW_PX * PAD_ROWS, WebkitOverflowScrolling: 'touch',
              maskImage: 'linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)',
            }}
          >
            {options.map((n, i) => {
              const on = i === selectedIdx;
              const dist = liveIdx < 0 ? 3 : Math.abs(i - liveIdx);
              return (
                <div
                  key={n}
                  aria-hidden
                  data-day={n}
                  data-selected={on || undefined}
                  onClick={() => { choose(n); centerOn(i, true); }}
                  style={{ height: ROW_PX, opacity: dist === 0 ? 1 : dist === 1 ? 0.55 : 0.28 }}
                  className={`flex cursor-pointer snap-center select-none items-center justify-center tabular-nums transition-opacity duration-100 ${
                    dist === 0 ? 'text-[18px] font-extrabold text-[#0B1E36]' : 'text-[15px] font-semibold text-slate-500'}`}
                >
                  {rowLabel(n)}
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p id={`${id}-t`} className="text-[13px] font-semibold text-slate-700" aria-live="polite">
            <span aria-hidden>🔔 </span>Lembrar <span className="font-extrabold text-[#0056D2]">{daysPhrase(current)}</span>
          </p>
          {!hideTime && (
          <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-500">
            às
            <input
              type="time"
              aria-label="Horário do lembrete"
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
              className="min-w-0 rounded-lg border border-blue-200 bg-white px-1.5 py-1 text-[13px] font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </label>
          )}
        </div>
      </div>
      <p id={`${id}-h`} className="mt-1 text-center text-[11px] text-slate-500">Role para cima ou para baixo para escolher os dias</p>
    </div>
  );
}

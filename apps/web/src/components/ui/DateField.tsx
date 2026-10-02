'use client';

/**
 * Campo de data com DUAS formas de preencher: digitar pelo teclado
 * (DD/MM/AAAA) ou tocar no ícone de calendário pra abrir o seletor nativo.
 *
 * Achado real (02/10/2026): no Android, `<input type="date">` sozinho só
 * abre o calendário do Chromium, que não tem atalho pra pular direto pro
 * ano — pra uma data de nascimento, o tutor tinha que voltar mês a mês,
 * às vezes anos inteiros. Digitar é sempre mais rápido pra data distante;
 * o calendário continua disponível pra quem prefere tocar.
 */
import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

interface DateFieldProps {
  id?: string;
  value: string;          // "YYYY-MM-DD" ou ""
  onChange: (iso: string) => void;
  max?: string;            // "YYYY-MM-DD"
  min?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  required?: boolean;
}

function isoToBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** "DDMMAAAA" (só dígitos) → "YYYY-MM-DD", ou null enquanto incompleto/inválido. */
function digitsToIso(digits: string): string | null {
  if (digits.length !== 8) return null;
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  if (month < 1 || month > 12) return null;
  if (year < 1900 || year > 2100) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${y}-${m}-${d}`;
}

function formatDigits(digits: string): string {
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

export function DateField({
  id, value, onChange, max, min, placeholder = 'DD/MM/AAAA',
  className = '', inputClassName, required,
}: DateFieldProps) {
  const [text, setText] = useState(() => isoToBr(value));
  const nativeRef = useRef<HTMLInputElement>(null);

  // Sincroniza o texto exibido quando o valor muda por fora (ex: escolhido
  // no calendário nativo, ou carregado de um registro existente).
  useEffect(() => setText(isoToBr(value)), [value]);

  const handleTextChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    setText(formatDigits(digits));
    if (digits.length === 0) {
      // Campo opcional apagado de propósito (ex: "revacina" sem data
      // definida) — avisa o formulário que esvaziou, não só ignora.
      onChange('');
      return;
    }
    const iso = digitsToIso(digits);
    if (iso) onChange(iso);
  };

  const openNativePicker = () => {
    const el = nativeRef.current;
    if (!el) return;
    const withPicker = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof withPicker.showPicker === 'function') {
      try {
        withPicker.showPicker();
        return;
      } catch {
        // alguns navegadores recusam showPicker() fora de um gesto direto —
        // cai pro focus/click abaixo.
      }
    }
    el.focus();
    el.click();
  };

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        maxLength={10}
        required={required}
        className={inputClassName ?? 'w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3.5 pr-11 text-base tabular-nums outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'}
      />
      <button
        type="button"
        onClick={openNativePicker}
        aria-label="Abrir calendário"
        className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-slate-400 transition-colors active:text-[#0056D2]"
      >
        <CalendarDays className="h-5 w-5" strokeWidth={2} />
      </button>
      {/* Invisível — só existe pra abrir o seletor nativo do SO quando o
          tutor prefere tocar em vez de digitar. */}
      <input
        ref={nativeRef}
        type="date"
        value={value || ''}
        max={max}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </div>
  );
}

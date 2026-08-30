'use client';

import { useId, useState } from 'react';
import { bagDuration, formatDays, parsePositiveNumber } from '@/features/guides/calculators';

export function RationBagDuration() {
  const bagId = useId();
  const dailyId = useId();
  const [bagKg, setBagKg] = useState('');
  const [dailyGrams, setDailyGrams] = useState('');
  const [result, setResult] = useState<{ days: number; weeks: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calculate(e: React.FormEvent) {
    e.preventDefault();
    const bag = parsePositiveNumber(bagKg, 'o peso do saco (kg)');
    const daily = parsePositiveNumber(dailyGrams, 'o consumo diário (g)');
    if (!bag.ok) return fail(bag.error);
    if (!daily.ok) return fail(daily.error);
    setError(null);
    setResult(bagDuration({ bagKg: bag.value as number, dailyGrams: daily.value as number }));
  }
  function fail(msg?: string) {
    setResult(null);
    setError(msg ?? 'Confira os valores.');
  }

  return (
    <form
      onSubmit={calculate}
      className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 space-y-4"
      aria-label="Calculadora: duração de um saco de ração"
    >
      <p className="text-[13px] font-black uppercase tracking-wide text-blue-700">Calculadora</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={bagId} className="block text-[13px] font-semibold text-slate-700">
          Peso do saco (kg)
          <input
            id={bagId}
            inputMode="decimal"
            value={bagKg}
            onChange={(e) => setBagKg(e.target.value)}
            placeholder="Ex: 7,5"
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </label>
        <label htmlFor={dailyId} className="block text-[13px] font-semibold text-slate-700">
          Consumo diário (g)
          <input
            id={dailyId}
            inputMode="decimal"
            value={dailyGrams}
            onChange={(e) => setDailyGrams(e.target.value)}
            placeholder="Ex: 200"
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </label>
      </div>
      <button
        type="submit"
        className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-[14px] font-black text-white active:scale-[0.99] hover:bg-blue-700 transition-colors"
      >
        Calcular duração
      </button>

      <div aria-live="polite" className="min-h-[1.5rem]">
        {error && <p className="text-[13px] font-semibold text-red-600">{error}</p>}
        {result && (
          <div className="rounded-xl bg-white border border-blue-200 p-4 text-slate-800">
            <p className="text-[15px]">
              O saco dura aproximadamente{' '}
              <strong className="text-blue-700">{formatDays(result.days)}</strong>.
            </p>
            <p className="text-[12px] text-slate-500 mt-1">
              Cerca de {result.weeks.toFixed(1).replace('.', ',')} semanas. Planeje a recompra antes
              desse prazo.
            </p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">
        Ferramenta informativa. Não guarda nenhum dado. O consumo diário está na tabela de porção da
        embalagem, na linha do peso do cão.
      </p>
    </form>
  );
}

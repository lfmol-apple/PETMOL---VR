'use client';

import { useId, useState } from 'react';
import { formatBRL, formatDays, monthlyCost, parsePositiveNumber, type MonthlyCostResult } from '@/features/guides/calculators';

export function RationMonthlyCost() {
  const priceId = useId();
  const bagId = useId();
  const dailyId = useId();
  const [bagPrice, setBagPrice] = useState('');
  const [bagKg, setBagKg] = useState('');
  const [dailyGrams, setDailyGrams] = useState('');
  const [result, setResult] = useState<MonthlyCostResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calculate(e: React.FormEvent) {
    e.preventDefault();
    const price = parsePositiveNumber(bagPrice, 'o preço do saco (R$)');
    const bag = parsePositiveNumber(bagKg, 'o peso do saco (kg)');
    const daily = parsePositiveNumber(dailyGrams, 'o consumo diário (g)');
    for (const v of [price, bag, daily]) {
      if (!v.ok) {
        setResult(null);
        return setError(v.error ?? 'Confira os valores.');
      }
    }
    setError(null);
    setResult(
      monthlyCost({
        bagPrice: price.value as number,
        bagKg: bag.value as number,
        dailyGrams: daily.value as number,
      }),
    );
  }

  const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';

  return (
    <form
      onSubmit={calculate}
      className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 space-y-4"
      aria-label="Calculadora: custo mensal de ração"
    >
      <p className="text-[13px] font-black uppercase tracking-wide text-blue-700">Calculadora</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label htmlFor={priceId} className="block text-[13px] font-semibold text-slate-700">
          Preço do saco (R$)
          <input id={priceId} inputMode="decimal" value={bagPrice} onChange={(e) => setBagPrice(e.target.value)} placeholder="Ex: 250" className={field} />
        </label>
        <label htmlFor={bagId} className="block text-[13px] font-semibold text-slate-700">
          Peso do saco (kg)
          <input id={bagId} inputMode="decimal" value={bagKg} onChange={(e) => setBagKg(e.target.value)} placeholder="Ex: 15" className={field} />
        </label>
        <label htmlFor={dailyId} className="block text-[13px] font-semibold text-slate-700">
          Consumo diário (g)
          <input id={dailyId} inputMode="decimal" value={dailyGrams} onChange={(e) => setDailyGrams(e.target.value)} placeholder="Ex: 300" className={field} />
        </label>
      </div>
      <button
        type="submit"
        className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-[14px] font-black text-white active:scale-[0.99] hover:bg-blue-700 transition-colors"
      >
        Calcular custo
      </button>

      <div aria-live="polite" className="min-h-[1.5rem]">
        {error && <p className="text-[13px] font-semibold text-red-600">{error}</p>}
        {result && (
          <dl className="rounded-xl bg-white border border-blue-200 p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
            <dt className="text-slate-500">Custo por quilo</dt>
            <dd className="text-right font-semibold text-slate-800">{formatBRL(result.costPerKg)}</dd>
            <dt className="text-slate-500">Custo por dia</dt>
            <dd className="text-right font-semibold text-slate-800">{formatBRL(result.costPerDay)}</dd>
            <dt className="text-slate-500">Custo em 30 dias</dt>
            <dd className="text-right font-black text-blue-700">{formatBRL(result.costPer30Days)}</dd>
            <dt className="text-slate-500">Duração do saco</dt>
            <dd className="text-right font-semibold text-slate-800">{formatDays(result.bagDurationDays)}</dd>
          </dl>
        )}
      </div>
      <p className="text-[11px] text-slate-400">
        Só a ração. Antiparasitário, petisco, higiene e vacinas entram por fora. Não guarda nenhum dado.
      </p>
    </form>
  );
}

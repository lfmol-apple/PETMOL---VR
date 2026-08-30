'use client';

import { useId, useState } from 'react';
import { compareRations, formatBRL, parsePositiveNumber, type RationComparisonResult } from '@/features/guides/calculators';

interface OptionState {
  label: string;
  bagPrice: string;
  bagKg: string;
  dailyGrams: string;
}

const empty: OptionState = { label: '', bagPrice: '', bagKg: '', dailyGrams: '' };

function OptionFields({
  legend,
  state,
  onChange,
}: {
  legend: string;
  state: OptionState;
  onChange: (next: OptionState) => void;
}) {
  const base = useId();
  const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
      <legend className="px-1 text-[13px] font-black text-slate-700">{legend}</legend>
      <label htmlFor={`${base}-label`} className="block text-[12px] font-semibold text-slate-600">
        Nome (opcional)
        <input id={`${base}-label`} value={state.label} onChange={(e) => onChange({ ...state, label: e.target.value })} placeholder={legend} className={field} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label htmlFor={`${base}-price`} className="block text-[12px] font-semibold text-slate-600">
          Preço (R$)
          <input id={`${base}-price`} inputMode="decimal" value={state.bagPrice} onChange={(e) => onChange({ ...state, bagPrice: e.target.value })} placeholder="210" className={field} />
        </label>
        <label htmlFor={`${base}-kg`} className="block text-[12px] font-semibold text-slate-600">
          Peso (kg)
          <input id={`${base}-kg`} inputMode="decimal" value={state.bagKg} onChange={(e) => onChange({ ...state, bagKg: e.target.value })} placeholder="15" className={field} />
        </label>
        <label htmlFor={`${base}-daily`} className="block text-[12px] font-semibold text-slate-600">
          g/dia
          <input id={`${base}-daily`} inputMode="decimal" value={state.dailyGrams} onChange={(e) => onChange({ ...state, dailyGrams: e.target.value })} placeholder="350" className={field} />
        </label>
      </div>
    </fieldset>
  );
}

export function RationCompare() {
  const [a, setA] = useState<OptionState>({ ...empty });
  const [b, setB] = useState<OptionState>({ ...empty });
  const [result, setResult] = useState<RationComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calculate(e: React.FormEvent) {
    e.preventDefault();
    const parse = (o: OptionState, tag: string) => {
      const price = parsePositiveNumber(o.bagPrice, `o preço da ${tag}`);
      const kg = parsePositiveNumber(o.bagKg, `o peso da ${tag}`);
      const daily = parsePositiveNumber(o.dailyGrams, `o consumo diário da ${tag}`);
      for (const v of [price, kg, daily]) if (!v.ok) return { error: v.error };
      return {
        value: {
          label: o.label.trim(),
          bagPrice: price.value as number,
          bagKg: kg.value as number,
          dailyGrams: daily.value as number,
        },
      };
    };
    const ra = parse(a, 'Ração A');
    if ('error' in ra) return void (setResult(null), setError(ra.error ?? 'Confira a Ração A.'));
    const rb = parse(b, 'Ração B');
    if ('error' in rb) return void (setResult(null), setError(rb.error ?? 'Confira a Ração B.'));
    setError(null);
    setResult(compareRations(ra.value, rb.value));
  }

  return (
    <form onSubmit={calculate} className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 space-y-4" aria-label="Calculadora: comparar duas rações pelo custo diário">
      <p className="text-[13px] font-black uppercase tracking-wide text-blue-700">Comparar duas rações</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionFields legend="Ração A" state={a} onChange={setA} />
        <OptionFields legend="Ração B" state={b} onChange={setB} />
      </div>
      <button type="submit" className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-[14px] font-black text-white active:scale-[0.99] hover:bg-blue-700 transition-colors">
        Comparar
      </button>

      <div aria-live="polite" className="min-h-[1.5rem]">
        {error && <p className="text-[13px] font-semibold text-red-600">{error}</p>}
        {result && (
          <div className="rounded-xl bg-white border border-blue-200 p-4 space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="py-1 font-semibold" scope="col"></th>
                    <th className="py-1 font-semibold" scope="col">{result.a.label}</th>
                    <th className="py-1 font-semibold" scope="col">{result.b.label}</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  <tr><th scope="row" className="py-1 font-normal text-slate-500">Preço por quilo</th><td>{formatBRL(result.a.costPerKg)}</td><td>{formatBRL(result.b.costPerKg)}</td></tr>
                  <tr><th scope="row" className="py-1 font-normal text-slate-500">Custo por dia</th><td className="font-semibold">{formatBRL(result.a.costPerDay)}</td><td className="font-semibold">{formatBRL(result.b.costPerDay)}</td></tr>
                  <tr><th scope="row" className="py-1 font-normal text-slate-500">Custo em 30 dias</th><td className="font-black text-blue-700">{formatBRL(result.a.costPer30Days)}</td><td className="font-black text-blue-700">{formatBRL(result.b.costPer30Days)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-[14px] text-slate-800">
              {result.cheaperLabel
                ? <>Mais barata por dia: <strong className="text-blue-700">{result.cheaperLabel}</strong>. Diferença de <strong>{formatBRL(result.monthlyDifference)}</strong> por mês.</>
                : <>As duas custam praticamente o mesmo por dia.</>}
            </p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">
        Compare só rações da mesma fase de vida e porte. O consumo diário está na tabela de cada
        embalagem. Não guarda nenhum dado.
      </p>
    </form>
  );
}

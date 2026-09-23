'use client';

import { useState } from 'react';
import { localTodayISO } from '@/lib/localDate';
import { isValidAppliedOn } from '@/lib/vaccineQuickDate';

/**
 * Passo "Quando foi aplicada?" do registro rápido de vacina — o tutor VÊ a
 * data (sugerida: hoje), pode trocar por uma anterior, e só então salva.
 * Compartilhado pelas duas portas do registro rápido (o chip dentro da
 * carteirinha e o modal "Registro rápido"), pra a regra ser uma só.
 *
 * Nunca salva sozinho ao escolher a vacina, e nunca aceita data futura.
 */
export function VaccineDateStep({
  vaccineName,
  icon,
  saving = false,
  onSave,
  onCancel,
  onUnknown,
}: {
  vaccineName: string;
  icon?: string;
  saving?: boolean;
  onSave: (appliedOn: string) => void | Promise<void>;
  onCancel?: () => void;
  /** "Não lembro a data" — caminho já existente (registro marcado como
   * estimativa, pra revisar depois). Só aparece se o chamador oferece. */
  onUnknown?: () => void | Promise<void>;
}) {
  const today = localTodayISO();
  const [date, setDate] = useState(today);
  const valid = isValidAppliedOn(date, today);

  return (
    <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
      <div className="flex items-center gap-2">
        {icon && <span className="text-2xl">{icon}</span>}
        <div>
          <p className="text-[14px] font-black text-slate-800">{vaccineName}</p>
          <p className="text-[11px] text-slate-500">Quando essa vacina foi aplicada?</p>
        </div>
      </div>

      <div>
        <label htmlFor="quick-vaccine-date" className="block text-sm font-medium text-gray-700 mb-1.5">
          Data da aplicação *
        </label>
        <input
          id="quick-vaccine-date"
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Sugerimos hoje — se foi antes, troque pela data da carteirinha. A próxima dose é calculada a partir dela.
        </p>
        {!valid && (
          <p role="alert" className="mt-1 text-[12px] font-semibold text-rose-600">
            Escolha uma data válida (não pode ser no futuro).
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!valid || saving}
          onClick={() => onSave(date)}
          className="w-full rounded-2xl bg-[#0056D2] py-3 font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-[#0047ad] disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar vacina'}
        </button>
        {onUnknown && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onUnknown()}
            className="w-full rounded-2xl border border-slate-300 bg-white py-3 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            Não lembro a data
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

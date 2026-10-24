'use client';

import { useState } from 'react';
import { SheetHeader, SheetShell, SHEET_Z } from '@/components/ui/sheet';
import { API_BACKEND_BASE } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

export interface FoodDurationAdjustResult {
  previousDurationDays: number | null;
  durationDays: number;
}

type Remaining = 'almost' | 'half' | 'plenty';

const OPTIONS: { key: Remaining; label: string; hint: string; fill: number }[] = [
  { key: 'almost', label: 'Quase acabando', hint: 'menos de um quarto', fill: 14 },
  { key: 'half', label: 'Mais ou menos metade', hint: 'cerca de 50%', fill: 50 },
  { key: 'plenty', label: 'Ainda bastante', hint: 'mais de três quartos', fill: 86 },
];

// Só dá pra medir o ritmo depois de alguns dias de ciclo (o servidor recusa antes disso).
export const MIN_ELAPSED_DAYS_TO_MEASURE = 3;

/**
 * "Ajustar duração": o tutor corrige a previsão da ração do jeito mais fácil —
 * olhando o pacote ("Quanto resta?") ou digitando a duração em dias.
 * O servidor refaz fim previsto, alerta e consumo diário (PATCH …/feeding/plan/adjust).
 */
export function FoodDurationAdjustSheet({
  open, petId, petLabel, elapsedDays, currentDurationDays, onClose, onAdjusted,
}: {
  open: boolean;
  petId: string;
  petLabel: string; // ex.: "do Thor" / "da Mel"
  elapsedDays: number;
  currentDurationDays: number | null;
  onClose: () => void;
  onAdjusted: (result: FoodDurationAdjustResult) => void;
}) {
  const [days, setDays] = useState<string>(currentDurationDays ? String(currentDurationDays) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  const canMeasure = elapsedDays >= MIN_ELAPSED_DAYS_TO_MEASURE;
  const typedDays = Number.parseInt(days, 10);
  const typedValid = Number.isFinite(typedDays) && typedDays >= Math.max(1, elapsedDays) && typedDays <= 365;

  const send = async (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = getToken();
      const res = await fetch(`${API_BACKEND_BASE}/health/pets/${petId}/feeding/plan/adjust`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      onAdjusted({
        previousDurationDays: typeof data.previous_duration_days === 'number' ? data.previous_duration_days : null,
        durationDays: Number(data.duration_days),
      });
    } catch {
      setError('Não deu pra ajustar agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell open={open} onClose={onClose} variant="center" size="sm" z={SHEET_Z.top}>
      <SheetHeader title="Ajustar duração" onClose={onClose} />
      <SheetShell.Body className="space-y-4">
        {canMeasure ? (
          <div>
            <p className="text-[15px] font-black text-gray-900">Quanto resta no pacote?</p>
            <p className="mb-3 text-[13px] leading-snug text-gray-600">
              Olhando agora, sem precisar pesar. O app refaz a previsão com o ritmo real {petLabel}.
            </p>
            <div className="space-y-2">
              {OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  disabled={busy}
                  onClick={() => void send({ action: 'remaining', remaining: o.key })}
                  className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-gray-200 bg-white px-4 py-3 text-left active:scale-[0.98] disabled:opacity-60"
                >
                  <span aria-hidden className="relative h-[22px] w-11 flex-none overflow-hidden rounded-md border-2 border-slate-400">
                    <span className="absolute inset-y-0 left-0 bg-green-500" style={{ width: `${o.fill}%` }} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[15px] font-bold text-gray-900">{o.label}</span>
                    <span className="block text-[12px] font-medium text-gray-500">{o.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[13px] leading-snug text-gray-600">
            O pacote é recente. Em alguns dias dá para ajustar pelo que resta. Por enquanto você pode informar a duração.
          </p>
        )}

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <label htmlFor="food-duration-days" className="block text-[13px] font-bold text-gray-800">
            {canMeasure ? 'Ou informe você mesmo: dura quantos dias?' : 'Dura quantos dias?'}
          </label>
          <p className="mb-2 text-[12px] text-gray-500">Contando do início deste pacote.</p>
          <div className="flex gap-2">
            <input
              id="food-duration-days"
              type="text"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
              className="min-h-[44px] w-24 rounded-xl border border-gray-300 bg-white px-3 text-[16px] font-bold text-gray-900"
              aria-label="Duração em dias"
            />
            <button
              type="button"
              disabled={busy || !typedValid}
              onClick={() => void send({ action: 'set_duration', duration_days: typedDays })}
              className="min-h-[44px] flex-1 rounded-xl bg-emerald-500 text-[14px] font-black text-white active:scale-[0.98] disabled:opacity-40"
            >
              {busy ? 'Salvando…' : 'Salvar duração'}
            </button>
          </div>
          {days !== '' && !typedValid && (
            <p className="mt-2 text-[12px] text-amber-700">
              Use de {Math.max(1, elapsedDays)} a 365 dias (já se passaram {elapsedDays}).
            </p>
          )}
        </div>

        {error && <p role="alert" className="text-[13px] font-semibold text-red-600">{error}</p>}
      </SheetShell.Body>
    </SheetShell>
  );
}

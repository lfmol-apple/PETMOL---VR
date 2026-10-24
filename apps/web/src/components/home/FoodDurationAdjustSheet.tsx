'use client';

import { useState } from 'react';
import { SheetHeader, SheetShell, SHEET_Z } from '@/components/ui/sheet';
import { API_BACKEND_BASE } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

export interface FoodDurationAdjustResult {
  previousDurationDays: number | null;
  durationDays: number;
}

const MAX_DAYS = 365;

function endDateLabel(startISO: string | null, days: number): string | null {
  if (!startISO || !Number.isFinite(days) || days <= 0) return null;
  const d = new Date(`${startISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * "Editar duração": quem decide é o tutor. Ele escolhe quantos dias este pacote
 * dura (contando do início) e o app só recalcula fim previsto e alerta com esse
 * número — sem estimar nada por conta própria. (PATCH …/feeding/plan/adjust, set_duration)
 */
export function FoodDurationAdjustSheet({
  open, petId, petLabel, startDate, elapsedDays, currentDurationDays, onClose, onAdjusted,
}: {
  open: boolean;
  petId: string;
  petLabel: string; // ex.: "do Thor" / "da Mel"
  startDate: string | null; // início do pacote (YYYY-MM-DD)
  elapsedDays: number;
  currentDurationDays: number | null;
  onClose: () => void;
  onAdjusted: (result: FoodDurationAdjustResult) => void;
}) {
  const [days, setDays] = useState<string>(currentDurationDays ? String(currentDurationDays) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  const minDays = Math.max(1, elapsedDays);
  const typed = Number.parseInt(days, 10);
  const valid = Number.isFinite(typed) && typed >= minDays && typed <= MAX_DAYS;
  const unchanged = valid && currentDurationDays != null && typed === currentDurationDays;
  const endLabel = valid ? endDateLabel(startDate, typed) : null;

  const step = (delta: number) => {
    const base = Number.isFinite(typed) ? typed : (currentDurationDays ?? minDays);
    setDays(String(Math.min(MAX_DAYS, Math.max(minDays, base + delta))));
  };

  const save = async () => {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const token = getToken();
      const res = await fetch(`${API_BACKEND_BASE}/health/pets/${petId}/feeding/plan/adjust`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ action: 'set_duration', duration_days: typed }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      onAdjusted({
        previousDurationDays: typeof data.previous_duration_days === 'number' ? data.previous_duration_days : null,
        durationDays: Number(data.duration_days),
      });
    } catch {
      setError('Não deu pra salvar agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell open={open} onClose={onClose} variant="center" size="sm" z={SHEET_Z.top}>
      <SheetHeader title="Editar duração" onClose={onClose} />
      <SheetShell.Body className="space-y-4">
        <div>
          <label htmlFor="food-duration-days" className="block text-[15px] font-black text-gray-900">
            Quantos dias este pacote dura {petLabel}?
          </label>
          <p className="mt-1 text-[13px] leading-snug text-gray-600">
            Você escolhe. O app usa esse número para calcular o dia em que acaba e quando avisar. Conta a partir do início do pacote.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button type="button" aria-label="Menos um dia" onClick={() => step(-1)}
            className="h-12 w-12 rounded-2xl border border-gray-200 bg-white text-[22px] font-black text-gray-700 active:scale-[0.96]">−</button>
          <input
            id="food-duration-days"
            type="text"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
            aria-label="Duração em dias"
            className="h-12 w-24 rounded-2xl border border-gray-300 bg-white text-center text-[22px] font-black text-gray-900"
          />
          <button type="button" aria-label="Mais um dia" onClick={() => step(1)}
            className="h-12 w-12 rounded-2xl border border-gray-200 bg-white text-[22px] font-black text-gray-700 active:scale-[0.96]">+</button>
        </div>
        <p className="text-center text-[13px] font-semibold text-gray-700">dias</p>

        <div className="min-h-[40px] rounded-2xl bg-gray-50 px-4 py-2.5 text-center text-[13px] text-gray-700">
          {valid ? (
            endLabel ? <>Vai acabar em <b>{endLabel}</b> (já se passaram {elapsedDays} dias).</> : <>Duração: <b>{typed} dias</b>.</>
          ) : (
            <span className="text-amber-700">Use de {minDays} a {MAX_DAYS} dias (já se passaram {elapsedDays}).</span>
          )}
        </div>

        {error && <p role="alert" className="text-[13px] font-semibold text-red-600">{error}</p>}

        <button type="button" disabled={busy || !valid || unchanged} onClick={() => { void save(); }}
          className="min-h-[48px] w-full rounded-2xl bg-emerald-500 text-[15px] font-black text-white active:scale-[0.98] disabled:opacity-40">
          {busy ? 'Salvando…' : 'Salvar duração'}
        </button>
      </SheetShell.Body>
    </SheetShell>
  );
}

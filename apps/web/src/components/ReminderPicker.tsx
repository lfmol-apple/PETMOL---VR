'use client';

interface ReminderPickerProps {
  days: string;
  time: string;
  onDaysChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  label?: string;
}

/**
 * Compact inline reminder configurator.
 * Shows: 🔔 Lembrar [X] dias antes às [HH:MM]
 * Default: 3 dias antes às 09:00
 */
export function ReminderPicker({
  days,
  time,
  onDaysChange,
  onTimeChange,
  label,
}: ReminderPickerProps) {
  return (
    <div className="rounded-xl bg-blue-50 border border-blue-100 px-2.5 py-1.5">
      {label && (
        <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide mb-1">{label}</p>
      )}
      {/* Largura calculada pra nunca quebrar linha num celular comum — a
          versão anterior ("Lembrar [X] dias antes às [HH:MM]") passava da
          largura útil em telas de ~360px e virava 2 linhas, dobrando a
          altura da caixa. Texto mais curto + inputs menores. */}
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] leading-none flex-shrink-0">🔔</span>
        <span className="text-[12px] text-gray-600 font-medium whitespace-nowrap flex-shrink-0">Lembrar</span>
        <input
          type="number"
          min="0"
          max="30"
          value={days}
          onChange={e => onDaysChange(e.target.value)}
          className="w-9 text-center text-[13px] font-bold bg-white border border-blue-200 rounded-lg py-1 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <span className="text-[12px] text-gray-600 font-medium whitespace-nowrap flex-shrink-0">dias antes</span>
        <input
          type="time"
          value={time}
          onChange={e => onTimeChange(e.target.value)}
          className="text-[13px] font-bold bg-white border border-blue-200 rounded-lg px-1.5 py-1 ml-auto focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>
    </div>
  );
}

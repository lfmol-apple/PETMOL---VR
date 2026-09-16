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
    <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
      {label && (
        <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide mb-1.5">{label}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[15px] leading-none flex-shrink-0">🔔</span>
        <span className="text-sm text-gray-600 font-medium whitespace-nowrap">Lembrar</span>
        <input
          type="number"
          min="0"
          max="30"
          value={days}
          onChange={e => onDaysChange(e.target.value)}
          className="w-14 text-center text-sm font-bold bg-white border border-blue-200 rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <span className="text-sm text-gray-600 font-medium whitespace-nowrap">dias antes às</span>
        <input
          type="time"
          value={time}
          onChange={e => onTimeChange(e.target.value)}
          className="text-sm font-bold bg-white border border-blue-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>
    </div>
  );
}

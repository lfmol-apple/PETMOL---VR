'use client';

import type { PetInteractionItem } from '@/features/interactions/types';

const ALERT_ICONS: Record<string, string> = {
  'health/vaccines': '💉',
  'health/parasites/dewormer': '🐛',
  'health/parasites/flea_tick': '🦟',
  'health/parasites/collar': '🔵',
  'health/parasites': '🐛',
  'health/medication': '💊',
  'health/grooming': '🛁',
  'health/food': '🥣',
  'health/eventos': '📅',
};

function badgeText(alert: PetInteractionItem): string {
  if (alert.status === 'today') return 'HOJE';
  if (alert.days_overdue != null && alert.days_overdue > 0) {
    return `ATRASADO ${alert.days_overdue} dia${alert.days_overdue === 1 ? '' : 's'}`;
  }
  return 'EM BREVE';
}

interface OverdueAlertsGridProps {
  alerts: PetInteractionItem[];
  petName: string;
  onAlertClick: (alert: PetInteractionItem) => void;
  onClose: () => void;
}

export function OverdueAlertsGrid({ alerts, petName, onAlertClick, onClose }: OverdueAlertsGridProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-rose-200/70 bg-rose-100/60">
        <span className="text-base">●</span>
        <p className="flex-1 text-[13px] font-bold text-rose-900 leading-snug">
          {petName} precisa de atenção em {alerts.length} {alerts.length === 1 ? 'item' : 'itens'}
        </p>
        <button
          onClick={onClose}
          className="text-rose-400 hover:text-rose-600 text-lg font-bold leading-none active:scale-90 transition-transform px-1"
          aria-label="Fechar"
        >
          ×
        </button>
      </div>

      {/* Grid de alertas */}
      <div className="grid grid-cols-2 gap-1.5 p-2.5">
        {alerts.map((alert) => {
          const icon = ALERT_ICONS[alert.action_target] ?? '⚠️';
          const badge = badgeText(alert);
          const isToday = alert.status === 'today';

          return (
            <button
              key={alert.id}
              onClick={() => onAlertClick(alert)}
              className="flex flex-col gap-1 rounded-xl border border-rose-200 bg-white/90 px-3 py-2.5 text-left active:scale-[0.97] transition-transform hover:bg-white shadow-sm"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xl leading-none">{icon}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                  isToday
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : alert.days_overdue != null && alert.days_overdue > 0
                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}>
                  {badge}
                </span>
              </div>
              <p className="text-[12px] font-semibold text-slate-800 leading-tight line-clamp-2">
                {alert.type_label}
              </p>
              <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                Ver detalhes
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

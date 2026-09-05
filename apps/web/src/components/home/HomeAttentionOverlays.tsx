'use client';

import { AlertTriangle } from 'lucide-react';
import type { PetInteractionItem } from '@/features/interactions/types';
import { SheetHeader, SheetIcon, SheetShell } from '@/components/ui/sheet';

interface HomeAttentionOverlaysProps {
  showTopAttentionModal: boolean;
  onCloseTopAttentionModal: () => void;
  topAttentionPetCount: number;
  topAttentionAlerts: PetInteractionItem[];
  onAlertSelect: (alert: PetInteractionItem) => void;
}

export function HomeAttentionOverlays({
  showTopAttentionModal,
  onCloseTopAttentionModal,
  topAttentionPetCount,
  topAttentionAlerts,
  onAlertSelect,
}: HomeAttentionOverlaysProps) {
  if (!showTopAttentionModal) return null;

  const visibleAlerts = topAttentionAlerts.filter((alert) => alert.category !== 'grooming');

  return (
    <SheetShell open onClose={onCloseTopAttentionModal} tone="grey" variant="center" size="md" z={100}>
      <SheetHeader
        title={topAttentionPetCount === 1 ? '1 pet precisa de atenção' : `${topAttentionPetCount} pets precisam de atenção`}
        media={<SheetIcon tone="rose"><AlertTriangle className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
        onClose={onCloseTopAttentionModal}
      />

      <SheetShell.Body pad={false}>
        <div className="divide-y divide-gray-100">
          {[...visibleAlerts]
            .sort((a, b) => (b.days_overdue || 0) - (a.days_overdue || 0))
            .map((alert) => {
              const icon = alert.category === 'vaccine'
                ? '💉'
                : alert.category === 'parasite'
                  ? '🛡️'
                  : alert.category === 'medication'
                    ? '💊'
                    : '⚠️';

              return (
                <button
                  key={alert.id}
                  onClick={() => onAlertSelect(alert)}
                  className="w-full px-5 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg leading-none mt-0.5">{icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {alert.pet_name} <span className="text-gray-400">·</span>{' '}
                        <span className="font-medium text-gray-700">{alert.type_label}</span>
                      </p>
                      <p className={`text-xs font-bold mt-0.5 ${alert.status === 'today' ? 'text-amber-700' : alert.days_overdue != null && alert.days_overdue > 0 ? 'text-rose-600' : 'text-amber-700'}`}>
                        {alert.status === 'today'
                          ? 'Hoje'
                          : alert.days_overdue != null && alert.days_overdue > 90
                            ? 'Revisão recomendada'
                            : alert.days_overdue != null && alert.days_overdue > 0
                              ? `Atrasado ${alert.days_overdue} dia${alert.days_overdue === 1 ? '' : 's'}`
                              : 'Em breve'}
                      </p>
                    </div>
                    <span className="text-gray-300 text-sm">›</span>
                  </div>
                </button>
              );
            })}
        </div>
      </SheetShell.Body>
    </SheetShell>
  );
}

'use client';

import type { PetInteractionItem } from '@/features/interactions/types';
import { ModalPortal } from '@/components/ModalPortal';

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

  return (
    <ModalPortal>
    <>
      {showTopAttentionModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onCloseTopAttentionModal} />
          <div className="relative w-full max-w-md bg-white/95 backdrop-blur-xl rounded-[28px] shadow-premium border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">●</span>
                <h3 className="text-sm font-bold text-rose-700 truncate">
                  {topAttentionPetCount === 1 ? '1 pet precisa de atenção' : `${topAttentionPetCount} pets precisam de atenção`}
                </h3>
              </div>
              <button
                onClick={onCloseTopAttentionModal}
                className="w-7 h-7 rounded-lg bg-white border border-rose-200 text-rose-500 hover:bg-rose-100"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[58vh] overflow-y-auto divide-y divide-gray-100">
              {[...topAttentionAlerts]
                .sort((a, b) => (b.days_overdue || 0) - (a.days_overdue || 0))
                .map((alert) => {
                  const icon = alert.category === 'vaccine'
                    ? '💉'
                    : alert.category === 'parasite'
                      ? '🛡️'
                      : alert.category === 'medication'
                        ? '💊'
                        : alert.category === 'grooming'
                          ? '🛁'
                          : '⚠️';

                  return (
                    <button
                      key={alert.id}
                      onClick={() => onAlertSelect(alert)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg leading-none mt-0.5">{icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {alert.pet_name} <span className="text-gray-400">·</span>{' '}
                            <span className="font-medium text-gray-700">{alert.type_label}</span>
                          </p>
                          <p className={`text-xs font-bold mt-0.5 ${alert.status === 'today' ? 'text-amber-700' : 'text-rose-600'}`}>
                            {alert.status === 'today' ? 'hoje' : `atrasado há ${alert.days_overdue || 0} dia${(alert.days_overdue || 0) === 1 ? '' : 's'}`}
                          </p>
                        </div>
                        <span className="text-gray-300 text-sm">›</span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </>
    </ModalPortal>
  );
}

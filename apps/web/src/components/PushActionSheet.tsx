'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken as getAuthToken } from '@/lib/auth-token';
import { trackReminderActionCompleted, trackV1Metric } from '@/lib/v1Metrics';
import { localTodayISO } from '@/lib/localDate';

/**
 * PushActionSheet — tela curta de decisão exibida quando o tutor toca num push.
 *
 * Princípio: o push leva ao lugar certo com ações rápidas.
 * O tutor escolhe entre poucas opções, o histórico é salvo, o próximo ciclo recalculado.
 */

// ── Types ──

export type ActionSheetType =
  | 'vaccines'
  | 'medication'
  | 'parasites'
  | 'food'
  | 'grooming';

interface PushActionSheetProps {
  type: ActionSheetType;
  petName: string;
  petId: string;
  /** Nome do item (vacina, medicamento, produto etc.) */
  itemName?: string;
  /** ID do evento/registro (para confirm/apply-dose) */
  eventId?: string;
  /** Callback ao fechar o sheet */
  onClose: () => void;
  /** Callback para abrir o módulo completo (ex: health modal, EditPetModal) */
  onOpenFull: () => void;
  /** Callback para abrir o handoff comercial contextual do item */
  onOpenCommerce?: () => void;
}

// ── Helpers ──

const sheetAccent: Record<ActionSheetType, string> = {
  vaccines:   'border-sky-200 bg-sky-50 text-sky-800',
  medication: 'border-purple-200 bg-purple-50 text-purple-800',
  parasites:  'border-orange-200 bg-orange-50 text-orange-800',
  food:       'border-amber-200 bg-amber-50 text-amber-900',
  grooming:   'border-emerald-200 bg-emerald-50 text-emerald-800',
};

const sheetIcon: Record<ActionSheetType, string> = {
  vaccines:   '💉',
  medication: '💊',
  parasites:  '🛡️',
  food:       '🥣',
  grooming:   '🛁',
};

const sheetTitle: Record<ActionSheetType, string> = {
  vaccines:   'Vacina',
  medication: 'Medicação',
  parasites:  'Antiparasitário',
  food:       'Alimentação',
  grooming:   'Banho e Tosa',
};

// ── Component ──

export function PushActionSheet({
  type,
  petName,
  petId,
  itemName,
  eventId,
  onClose,
  onOpenFull,
  onOpenCommerce,
}: PushActionSheetProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const icon = sheetIcon[type];
  const title = sheetTitle[type];
  const accent = sheetAccent[type];
  const primaryAction = (() => {
    if (type === 'medication') {
      return {
        emoji: '✓',
        label: 'Registrar dose',
        desc: 'Confirmar o cuidado de hoje',
        color: 'green' as const,
        onClick: () => confirmAction('confirm'),
      };
    }
    if (type === 'food') {
      return {
        emoji: '🛒',
        label: 'Comprar novamente',
        desc: 'Abrir ração e parceiros',
        color: 'blue' as const,
        onClick: () => { if (onOpenCommerce) onOpenCommerce(); else onOpenFull(); },
      };
    }
    if (type === 'parasites') {
      return {
        emoji: '🛒',
        label: 'Comprar novamente',
        desc: 'Abrir produto antiparasitário',
        color: 'blue' as const,
        onClick: () => { if (onOpenCommerce) onOpenCommerce(); else onOpenFull(); },
      };
    }
    if (type === 'grooming') {
      return {
        emoji: '🛁',
        label: 'Registrar banho/tosa',
        desc: 'Abrir cuidado de higiene',
        color: 'green' as const,
        onClick: onOpenFull,
      };
    }
    return {
      emoji: '💉',
      label: 'Registrar vacina',
      desc: 'Abrir detalhes da vacina',
      color: 'blue' as const,
      onClick: onOpenFull,
    };
  })();

  useEffect(() => {
    trackV1Metric('push_opened', {
      sheet_type: type,
      pet_id: petId,
      item_name: itemName ?? null,
    });
  }, [type, petId, itemName]);

  // -- Generic API call for confirm/apply-dose --
  const confirmAction = async (action: string) => {
    const token = getAuthToken();
    if (!token) return;
    setLoading(true);
    try {
      if (eventId && action === 'confirm') {
        const today = localTodayISO();
        // Medication uses apply-dose (records dose on treatment course without closing event)
        // Other event types use complete (marks event done + creates recurrence)
        const endpoint = type === 'medication'
          ? `${API_BASE_URL}/events/${eventId}/apply-dose`
          : `${API_BASE_URL}/events/${eventId}/complete`;
        const body = type === 'medication'
          ? JSON.stringify({ date: today })
          : JSON.stringify({});
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body,
        });
        if (res.ok) {
          if (type === 'medication') {
            trackV1Metric('medication_taken', {
              source: 'push_action_sheet',
              pet_id: petId,
              item_name: itemName ?? null,
            });
          }
          trackReminderActionCompleted({
            source: 'push_action_sheet',
            item_type: type,
            pet_id: petId,
            item_name: itemName ?? null,
          });
          setDone('✅ Registrado com sucesso!');
          setTimeout(onClose, 1500);
          return;
        }
      }
      // Fallback: just show full modal
      onOpenFull();
    } catch {
      onOpenFull();
    } finally {
      setLoading(false);
    }
  };

  // If action completed, show success toast
  if (done) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" />
        <div className="relative w-full max-w-sm bg-white rounded-[28px] shadow-2xl border border-gray-200 p-6 text-center overflow-hidden">
          <p className="text-lg font-bold text-gray-900">{done}</p>
          <p className="text-sm text-gray-500 mt-1">{petName}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" />
      <div
        className="relative w-full max-w-sm bg-white rounded-[28px] border border-gray-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border text-2xl ${accent}`}>{icon}</span>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900 truncate">
                {title} — {petName}
              </h3>
              {itemName && (
                <p className="text-sm text-gray-600 truncate">{itemName}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 space-y-2">

          <ActionButton
            emoji={primaryAction.emoji}
            label={primaryAction.label}
            desc={primaryAction.desc}
            color={primaryAction.color}
            loading={loading}
            onClick={primaryAction.onClick}
          />

          {/* Ver detalhes link */}
          <button
            type="button"
            onClick={onOpenFull}
            className="w-full text-center text-xs font-semibold text-gray-500 py-2 hover:text-gray-700 transition-colors"
          >
            Ver detalhes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function ActionButton({
  emoji,
  label,
  desc,
  color,
  loading,
  onClick,
}: {
  emoji: string;
  label: string;
  desc?: string;
  color: 'green' | 'blue' | 'amber' | 'gray';
  loading?: boolean;
  onClick: () => void;
}) {
  const colorMap = {
    green: 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100 active:bg-green-200',
    blue:  'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100 active:bg-blue-200',
    amber: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 active:bg-amber-200',
    gray:  'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 active:bg-gray-200',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border transition-all active:scale-[0.98] ${colorMap[color]} ${loading ? 'opacity-60' : ''}`}
    >
      <span className={`text-xl flex-shrink-0 mt-0.5 ${color === 'blue' ? 'inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white ring-1 ring-blue-200/80 shadow-sm' : ''}`}>{loading ? '⏳' : emoji}</span>
      <div className="flex-1 text-left pt-1">
        <p className="text-sm font-semibold leading-5">{label}</p>
        {desc && <p className="text-xs opacity-70 mt-1 leading-4">{desc}</p>}
      </div>
      <span className={`text-lg mt-1 ${color === 'blue' ? 'text-white/80' : 'text-gray-300'}`}>›</span>
    </button>
  );
}

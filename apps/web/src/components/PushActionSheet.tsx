'use client';

import { useEffect, useState } from 'react';
import { Bath, Check, ChevronRight, Loader2, Pill, ShieldCheck, ShoppingCart, Syringe, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';
import { SheetHeader, SheetIcon, SheetShell, SHEET_Z } from '@/components/ui/sheet';
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

const sheetTone: Record<ActionSheetType, 'blue' | 'slate' | 'amber' | 'emerald' | 'rose'> = {
  vaccines:   'blue',
  medication: 'slate',
  parasites:  'amber',
  food:       'amber',
  grooming:   'emerald',
};

const sheetIcon: Record<ActionSheetType, LucideIcon> = {
  vaccines:   Syringe,
  medication: Pill,
  parasites:  ShieldCheck,
  food:       UtensilsCrossed,
  grooming:   Bath,
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

  const Icon = sheetIcon[type];
  const title = sheetTitle[type];
  const primaryAction = (() => {
    if (type === 'medication') {
      return { Icon: Check, label: 'Registrar dose', desc: 'Confirmar o cuidado de hoje', color: 'green' as const, onClick: () => confirmAction('confirm') };
    }
    if (type === 'food') {
      return { Icon: ShoppingCart, label: 'Comprar novamente', desc: 'Abrir ração e parceiros', color: 'blue' as const, onClick: () => { if (onOpenCommerce) onOpenCommerce(); else onOpenFull(); } };
    }
    if (type === 'parasites') {
      return { Icon: ShoppingCart, label: 'Comprar novamente', desc: 'Abrir produto antiparasitário', color: 'blue' as const, onClick: () => { if (onOpenCommerce) onOpenCommerce(); else onOpenFull(); } };
    }
    if (type === 'grooming') {
      return { Icon: Bath, label: 'Registrar banho/tosa', desc: 'Abrir cuidado de higiene', color: 'green' as const, onClick: onOpenFull };
    }
    return { Icon: Syringe, label: 'Registrar vacina', desc: 'Abrir detalhes da vacina', color: 'blue' as const, onClick: onOpenFull };
  })();

  useEffect(() => {
    trackV1Metric('push_opened', {
      sheet_type: type,
      pet_id: petId,
      item_name: itemName ?? null,
    });
    try {
      localStorage.setItem('petmol_activation_push_received_v1', '1');
      const activated = localStorage.getItem('petmol_activated_v1') === '1';
      const petCreated = localStorage.getItem('petmol_activation_pet_created_v1') === '1';
      const controlActive = localStorage.getItem('petmol_activation_control_active_v1') === '1';
      if (!activated && petCreated && controlActive) {
        localStorage.setItem('petmol_activated_v1', '1');
        trackV1Metric('petmol_activated_v1', {
          pet_id: petId,
          sheet_type: type,
        });
      }
    } catch {
      // metric state is best effort
    }
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
          setDone('Registrado com sucesso');
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

  if (done) {
    return (
      <SheetShell open onClose={onClose} variant="center" size="sm" z={SHEET_Z.top}>
        <div className="px-6 py-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <Check className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <p className="text-[16px] font-bold text-slate-900">{done}</p>
          <p className="mt-1 text-[13px] text-slate-400">{petName}</p>
        </div>
      </SheetShell>
    );
  }

  return (
    <SheetShell open onClose={onClose} variant="center" size="sm" z={SHEET_Z.top}>
      <SheetHeader
        title={`${title} — ${petName}`}
        subtitle={itemName}
        media={<SheetIcon tone={sheetTone[type]}><Icon className="h-5 w-5" strokeWidth={2.2} /></SheetIcon>}
        onClose={onClose}
      />
      <SheetShell.Body className="space-y-2">
        <ActionButton
          Icon={loading ? Loader2 : primaryAction.Icon}
          label={primaryAction.label}
          desc={primaryAction.desc}
          color={primaryAction.color}
          loading={loading}
          onClick={primaryAction.onClick}
        />
        <button
          type="button"
          onClick={onOpenFull}
          className="w-full py-2 text-center text-[12px] font-semibold text-slate-400 transition-colors hover:text-slate-600"
        >
          Ver detalhes
        </button>
      </SheetShell.Body>
    </SheetShell>
  );
}

// ── Sub-components ──

function ActionButton({
  Icon,
  label,
  desc,
  color,
  loading,
  onClick,
}: {
  Icon: LucideIcon;
  label: string;
  desc?: string;
  color: 'green' | 'blue' | 'amber' | 'gray';
  loading?: boolean;
  onClick: () => void;
}) {
  const colorMap = {
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100',
    blue:  'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
    amber: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100',
    gray:  'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[0.98] ${colorMap[color]} ${loading ? 'opacity-60' : ''}`}
    >
      <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/70 ring-1 ring-black/5">
        <Icon className={`h-[18px] w-[18px] ${loading ? 'animate-spin' : ''}`} strokeWidth={2.3} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-tight">{label}</p>
        {desc && <p className="mt-0.5 text-[12px] leading-tight opacity-70">{desc}</p>}
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 opacity-40" strokeWidth={2.5} />
    </button>
  );
}

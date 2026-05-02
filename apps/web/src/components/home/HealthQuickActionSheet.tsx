'use client';

import { useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import type { PetEventRecord } from '@/lib/petEvents';
import { localTodayISO } from '@/lib/localDate';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuickActionContext {
  action_target: string;
  label: string;
  pet_id: string;
  pet_name: string;
  status: 'overdue' | 'today' | 'upcoming';
  days_overdue?: number;
  /** ID do registro de origem (para aplicar dose sem abrir sheet completo) */
  source_record_id?: string;
}

interface HealthQuickActionSheetProps {
  item: QuickActionContext;
  petEvents: PetEventRecord[];
  onClose: () => void;
  onOpenDetails: () => void;
  onApplied?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ICONS: Record<string, string> = {
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

// ── Component ─────────────────────────────────────────────────────────────────

export function HealthQuickActionSheet({
  item,
  petEvents,
  onClose,
  onOpenDetails,
  onApplied,
}: HealthQuickActionSheetProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickedDate, setPickedDate] = useState(localTodayISO());
  const [vaccineSubView, setVaccineSubView] = useState<null | 'register'>(null);

  const icon = ICONS[item.action_target] ?? '⚕️';
  const isMedication = item.action_target === 'health/medication';
  const isVaccine = item.action_target === 'health/vaccines';

  const statusLabel =
    item.status === 'today'
      ? 'HOJE'
      : item.days_overdue != null && item.days_overdue > 0
        ? item.days_overdue > 90
          ? 'REVISÃO RECOMENDADA'
          : `ATRASADO ${item.days_overdue} dia${item.days_overdue !== 1 ? 's' : ''}`
        : 'EM BREVE';

  const statusCls =
    item.status === 'today'
      ? 'bg-amber-100 text-amber-800 border-amber-200'
      : item.days_overdue != null && item.days_overdue > 0
        ? 'bg-rose-100 text-rose-800 border-rose-200'
        : 'bg-amber-100 text-amber-800 border-amber-200';

  // Finds the active medication event matching source_record_id or falls back to first active
  const findMedicationEvent = (): PetEventRecord | null => {
    if (item.source_record_id) {
      const byId = petEvents.find((ev) => ev.id === item.source_record_id);
      if (byId) return byId;
    }
    return (
      petEvents.find(
        (ev) =>
          (ev.type === 'medicacao' || ev.type === 'medication') &&
          ev.status !== 'cancelled' &&
          ev.status !== 'completed',
      ) ?? null
    );
  };

  const applyWithDate = async (date: string) => {
    if (loading) return;

    if (isMedication) {
      const event = findMedicationEvent();
      if (event) {
        const token = getToken();
        if (!token) { onOpenDetails(); return; }
        setLoading(true);
        try {
          const res = await fetch(`${API_BASE_URL}/events/${event.id}/apply-dose`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ date }),
          });
          if (res.ok) {
            setDone('✅ Dose registrada!');
            onApplied?.();
            setTimeout(() => { setDone(null); onClose(); }, 1500);
            return;
          }
        } catch {
          // fall through to details
        } finally {
          setLoading(false);
        }
      }
    }

    // For vaccines, parasites and fallback: open the appropriate detail sheet
    onOpenDetails();
  };

  // ── Success state ─────────────────────────────────────────────────────────

  if (done) {
    return (
      <ModalPortal>
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" />
          <div className="relative w-full max-w-sm bg-white rounded-[28px] shadow-2xl border border-gray-200 p-6 text-center">
            <p className="text-lg font-bold text-gray-900">{done}</p>
            <p className="text-sm text-gray-500 mt-1">{item.pet_name}</p>
          </div>
        </div>
      </ModalPortal>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />

        <div
          className="relative w-full max-w-sm bg-white rounded-t-[32px] sm:rounded-[28px] shadow-2xl border border-gray-200 overflow-hidden animate-slideUp sm:animate-scaleIn"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sheet-handle my-3 opacity-40 sm:hidden" />

          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-2xl flex-shrink-0">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-gray-900 leading-tight truncate">{item.label}</p>
                <span className={`inline-flex items-center mt-0.5 px-2 py-0.5 rounded-full border text-[11px] font-bold ${statusCls}`}>
                  {statusLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 active:scale-90 transition-all flex-shrink-0"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 py-4 pb-6 space-y-2.5">

            {/* ── Vaccine-specific hierarchy ────────────────────────────── */}
            {isVaccine && !showDatePicker && vaccineSubView === null && (
              <>
                {/* Primary — Procurar lugar para vacinar */}
                <a
                  href="https://www.google.com/maps/search/clínica+veterinária+vacina+perto+de+mim"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 active:scale-[0.98] transition-all text-white font-black text-[15px] shadow-lg shadow-sky-500/20"
                >
                  <span className="text-xl">📍</span>
                  <span>Procurar lugar para vacinar</span>
                </a>
                {/* Secondary — Já vacinei */}
                <button
                  type="button"
                  onClick={() => setVaccineSubView('register')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 font-bold text-[14px] active:scale-[0.98] transition-all"
                >
                  <span className="text-lg">✔</span>
                  <span>Já vacinei — Registrar</span>
                </button>
                {/* Tertiary — Escolher outra data */}
                <button
                  type="button"
                  onClick={() => setShowDatePicker(true)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-gray-600 font-semibold text-[13px] active:scale-[0.98] transition-all"
                >
                  <span>📅</span>
                  <span>Escolher outra data</span>
                </button>
              </>
            )}

            {/* ── Vaccine sub-view: V8 / V10 / Polivalente ─────────────── */}
            {isVaccine && vaccineSubView === 'register' && (
              <>
                <p className="text-[13px] font-semibold text-gray-500">Qual vacina foi aplicada?</p>
                <button
                  type="button"
                  onClick={onOpenDetails}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-sky-200 bg-sky-50 text-sky-800 font-bold text-[14px] active:scale-[0.98] transition-all"
                >
                  <span>💉</span><span>V10 (Polivalente completa)</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenDetails}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-sky-200 bg-sky-50 text-sky-800 font-bold text-[14px] active:scale-[0.98] transition-all"
                >
                  <span>💉</span><span>V8</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenDetails}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-gray-200 bg-white text-gray-700 font-semibold text-[14px] active:scale-[0.98] transition-all"
                >
                  <span>❓</span><span>Não sei / Registrar como Polivalente</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVaccineSubView(null)}
                  className="w-full py-2 text-center text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Voltar
                </button>
              </>
            )}

            {/* ── Non-vaccine: Aplicar hoje / date picker ───────────────── */}
            {!isVaccine && !showDatePicker && (
              <>
                {/* Primary — Aplicar hoje */}
                <button
                  type="button"
                  onClick={() => applyWithDate(localTodayISO())}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] transition-all text-white font-black text-[16px] shadow-lg shadow-emerald-500/20 disabled:opacity-60"
                >
                  <span className="text-xl">✔</span>
                  <span>{loading ? 'Registrando...' : 'Aplicar hoje'}</span>
                </button>
                {/* Secondary — Escolher data */}
                <button
                  type="button"
                  onClick={() => setShowDatePicker(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 bg-white text-gray-700 font-semibold text-[14px] active:scale-[0.98] transition-all"
                >
                  <span className="text-lg">📅</span>
                  <span>Escolher outra data</span>
                </button>
                {/* Tertiary — Ver detalhes */}
                <button
                  type="button"
                  onClick={onOpenDetails}
                  className="w-full py-2.5 text-center text-[12px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ✏️ Ver detalhes completos
                </button>
              </>
            )}

            {/* ── Date picker (shared for non-vaccine) ─────────────────── */}
            {!isVaccine && showDatePicker && (
              <>
                <p className="text-[13px] font-semibold text-gray-500 -mb-1">Quando foi aplicado?</p>
                <input
                  type="date"
                  value={pickedDate}
                  max={localTodayISO()}
                  onChange={(e) => setPickedDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => applyWithDate(pickedDate)}
                  disabled={!pickedDate || loading}
                  className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/20"
                >
                  {loading ? 'Registrando...' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDatePicker(false)}
                  className="w-full py-2 text-center text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Voltar
                </button>
              </>
            )}

            {/* ── Vaccine date picker ───────────────────────────────────── */}
            {isVaccine && showDatePicker && (
              <>
                <p className="text-[13px] font-semibold text-gray-500 -mb-1">Quando foi vacinado?</p>
                <input
                  type="date"
                  value={pickedDate}
                  max={localTodayISO()}
                  onChange={(e) => setPickedDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => { setShowDatePicker(false); onOpenDetails(); }}
                  disabled={!pickedDate}
                  className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-black text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all shadow-lg shadow-sky-500/20"
                >
                  Registrar
                </button>
                <button
                  type="button"
                  onClick={() => setShowDatePicker(false)}
                  className="w-full py-2 text-center text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Voltar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

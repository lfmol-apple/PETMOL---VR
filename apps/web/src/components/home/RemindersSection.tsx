'use client';

import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { type HomeInactiveEligibleControlId } from '@/lib/homeControlPreferences';
import { parsePetEventExtraData, type PetEventRecord } from '@/lib/petEvents';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';
import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';
import { buildPetCareReminders, resolveCareCTA } from '@/lib/petCareDomain';
import { dateToLocalISO } from '@/lib/localDate';

// ─── helpers ────────────────────────────────────────────────────────────────
const createLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const extractDate = (s: string) => (s || '').replace('T', ' ').split(' ')[0];
const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const fmtD = (d: Date) => `${d.getDate()} ${months[d.getMonth()]}`;

// ─── Types ───────────────────────────────────────────────────────────────────
type Treatment = {
  id: string; title: string; startDate: Date; endDate: Date;
  totalDoses: number; appliedDates: string[]; doseNotes: Record<string,string>;
  skippedDates: string[]; reminderTime?: string; missedDays: number; skippedDays: number;
};
type SimpleMed = {
  id: string; title: string; reminderTime?: string; todayDone: boolean;
};
type Chip = {
  icon: string; label: string; sublabel?: string; date: Date;
  diff: number; dateStr: string; id?: string; evType?: string;
  onClick: () => void;
};

// ─── Props ───────────────────────────────────────────────────────────────────
interface RemindersSectionProps {
  petEvents: PetEventRecord[];
  vaccines: VaccineRecord[];
  parasiteControls: ParasiteControl[];
  groomingRecords: GroomingRecord[];
  feedingPlan: Record<string, FeedingPlanEntry>;
  currentPet: Pick<PetHealthProfile, 'pet_id' | 'pet_name'> | null;
  inactiveControls?: HomeInactiveEligibleControlId[];
  tutorCheckinDay: number;
  selectedPetId: string | null;
  quickMarkId: string | null;
  setQuickMarkId: (id: string | null) => void;
  quickMarkDate: string;
  setQuickMarkDate: (d: string) => void;
  quickMarkNotes: string;
  setQuickMarkNotes: (n: string) => void;
  quickMarkSaving: boolean;
  setQuickMarkSaving: (s: boolean) => void;
  quickMarkToast: string | null;
  setQuickMarkToast: (t: string | null) => void;
  fetchPetEvents: (id: string) => Promise<void>;
  onOpenVaccines: () => void;
  onOpenVermifugo: () => void;
  onOpenAntipulgas: () => void;
  onOpenColeira: () => void;
  // V-L: grooming e food removidos da superfície de lançamento
  onOpenGrooming?: () => void;
  onOpenMedication: () => void;
  onOpenFood?: () => void;
  onOpenEvents: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function RemindersSection({
  petEvents,
  vaccines,
  parasiteControls,
  groomingRecords,
  feedingPlan,
  currentPet,
  inactiveControls = [],
  selectedPetId,
  quickMarkId,
  setQuickMarkId,
  quickMarkDate,
  setQuickMarkDate,
  quickMarkNotes,
  setQuickMarkNotes,
  quickMarkSaving,
  setQuickMarkSaving,
  quickMarkToast,
  setQuickMarkToast,
  fetchPetEvents,
  onOpenVaccines,
  onOpenVermifugo,
  onOpenAntipulgas,
  onOpenColeira,
  onOpenGrooming,
  onOpenMedication,
  onOpenFood,
  onOpenEvents,
}: RemindersSectionProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = dateToLocalISO(today);

  // ── Active treatments (medication with treatment_days) ──
  const treatments: Treatment[] = [];
  const simpleMeds: SimpleMed[] = [];

  petEvents
    .filter((ev) => {
      if (ev.type !== 'medicacao' || ev.source === 'document' || ev.status === 'cancelled') return false;
      if (ev.status !== 'completed') return true;
      const extraData = parsePetEventExtraData(ev.extra_data);
      if (extraData.treatment_days) {
        return (extraData.applied_dates || []).length < parseInt(String(extraData.treatment_days), 10);
      }
      return false;
    })
    .forEach((ev) => {
      const extra = parsePetEventExtraData(ev.extra_data);
      const totalDoses = extra.treatment_days ? parseInt(String(extra.treatment_days), 10) : 0;
      if (!totalDoses) {
        const appliedDates: string[] = extra.applied_dates || [];
        simpleMeds.push({
          id: ev.id, title: ev.title,
          reminderTime: extra.reminder_time,
          todayDone: appliedDates.includes(todayStr),
        });
        return;
      }
      const startDate = createLocalDate(extractDate(ev.scheduled_at));
      const appliedDates: string[] = extra.applied_dates || [];
      const skippedDates: string[] = extra.skipped_dates || [];
      const daysSinceStart = Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / 86400000));
      const appliedBeforeToday = appliedDates.filter((d: string) => d < todayStr).length;
      const skippedBeforeToday = skippedDates.filter((d: string) => d < todayStr).length;
      const missedDays = Math.max(0, daysSinceStart - (appliedBeforeToday + skippedBeforeToday));
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + totalDoses - 1 + missedDays);
      if (endDate < today) return;
      treatments.push({
        id: ev.id, title: ev.title, startDate, endDate,
        totalDoses, appliedDates, skippedDates,
        doseNotes: extra.dose_notes || {},
        reminderTime: extra.reminder_time,
        missedDays,
        skippedDays: skippedBeforeToday,
      });
    });

  // ── Chips — ÚNICA fonte de verdade: camada canônica (sem localStorage) ───────
  const noop = () => {};
  const careHandlers = {
    onOpenVaccines,
    onOpenVermifugo,
    onOpenAntipulgas,
    onOpenColeira,
    // V-L: grooming e food sem handler ativo (domínios filtrados antes do resolveCareCTA)
    onOpenGrooming: onOpenGrooming ?? noop,
    onOpenFood: onOpenFood ?? noop,
    onOpenMedication,
    onOpenEvents,
  };

  const canonicalReminders = buildPetCareReminders({
    pet_id: currentPet?.pet_id ?? '',
    pet_name: currentPet?.pet_name ?? '',
    vaccines,
    parasiteControls,
    groomingRecords,
    feedingPlan: currentPet?.pet_id ? (feedingPlan[currentPet.pet_id] ?? null) : null,
    petEvents,
  });

  const inactiveSet = new Set<HomeInactiveEligibleControlId>(inactiveControls);
  const upcomingReminders = canonicalReminders.filter((reminder) => {
    // V-L: grooming e food removidos da superfície de lançamento
    if (reminder.domain === 'grooming') return false;
    if (reminder.domain === 'food') return false;
    if (inactiveSet.has('vaccines') && reminder.domain === 'vaccine') return false;
    if (inactiveSet.has('dewormer') && reminder.action_target === 'health/parasites/dewormer') return false;
    if (inactiveSet.has('flea_tick') && reminder.action_target === 'health/parasites/flea_tick') return false;
    if (inactiveSet.has('collar') && reminder.action_target === 'health/parasites/collar') return false;
    return true;
  });

  const sorted: Chip[] = upcomingReminders.map(r => {
    const d = createLocalDate(r.due_date);
    return {
      icon: r.icon,
      label: r.label,
      sublabel: r.sublabel,
      date: d,
      diff: r.diff,
      dateStr: fmtD(d),
      id: r.source_record_id,
      evType: r.domain === 'medication' ? 'medicacao' : undefined,
      onClick: resolveCareCTA(r.action_target, careHandlers),
    };
  });

  if (sorted.length === 0 && treatments.length === 0 && simpleMeds.length === 0 && !quickMarkToast) return null;

  const urgencyStyle = (diff: number) => {
    if (diff < 0)   return { row: 'border-red-300 bg-red-100/80', badge: 'bg-red-200 text-red-800', dot: 'bg-red-500' };
    if (diff === 0) return { row: 'border-amber-300 bg-amber-100/80', badge: 'bg-amber-200 text-amber-800', dot: 'bg-amber-500' };
    if (diff <= 3)  return { row: 'border-orange-300 bg-orange-100/75', badge: 'bg-orange-200 text-orange-800', dot: 'bg-orange-500' };
    if (diff <= 7)  return { row: 'border-blue-200 bg-blue-100/70', badge: 'bg-blue-200 text-blue-700', dot: 'bg-blue-500' };
    return { row: 'border-gray-200 bg-gray-50', badge: 'bg-gray-200 text-gray-600', dot: 'bg-gray-400' };
  };
  const badgeLabel = (diff: number) => {
    if (diff < 0) return `${Math.abs(diff)}d atrás`;
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    return `em ${diff}d`;
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100/80 flex flex-col gap-2">

      {/* Toast de confirmação */}
      {quickMarkToast && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-100 border border-green-300 shadow-sm">
          <span className="text-green-500 text-base">✓</span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-green-800 truncate">{quickMarkToast}</p>
            <p className="text-[11px] text-green-700">Dose registrada no histórico</p>
          </div>
          <button
            onClick={() => { onOpenEvents(); setQuickMarkToast(null); }}
            className="text-[11px] font-bold text-green-700 underline flex-shrink-0"
          >Ver</button>
        </div>
      )}

      {/* ── Próximos Lembretes ── */}
      {sorted.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">📋 Lembretes e Cuidados de {currentPet?.pet_name}</p>
            <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{sorted.length}</span>
          </div>
          {sorted.map((c, i) => {
            const s = urgencyStyle(c.diff);
            const isExpanded = c.id && quickMarkId === c.id;
            return (
              <div key={i} className={`rounded-xl border ${s.row} overflow-hidden transition-all`}>
                <button
                  onClick={c.onClick}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 active:scale-[0.98] transition-all text-left"
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
                  <span className="text-[13px] leading-none flex-shrink-0">{c.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] font-semibold text-gray-700 leading-tight truncate">{c.label}</span>
                    {c.sublabel && <span className="block text-[10px] text-gray-400 leading-tight truncate">{c.sublabel}</span>}
                  </span>
                  <span className="text-[11px] text-gray-400 flex-shrink-0 mr-1">{c.dateStr}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.badge}`}>
                    {badgeLabel(c.diff)}
                  </span>
                  {c.evType === 'medicacao' && (
                    <span className="text-gray-300 text-[10px] ml-0.5">{isExpanded ? '▲' : '▼'}</span>
                  )}
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-white/80">
                    <div className="flex flex-col gap-2">
                      <input
                        type="date"
                        value={quickMarkDate}
                        onChange={e => setQuickMarkDate(e.target.value)}
                        className="w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
                      />
                      <input
                        type="text"
                        value={quickMarkNotes}
                        onChange={e => setQuickMarkNotes(e.target.value)}
                        placeholder="Observação opcional"
                        className="w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setQuickMarkId(null)}
                          className="flex-1 text-[12px] font-semibold py-1.5 rounded-lg border border-gray-200 text-gray-500 active:scale-95 transition-all"
                        >Cancelar</button>
                        <button
                          disabled={!quickMarkDate || quickMarkSaving}
                          onClick={async () => {
                            if (!quickMarkDate || !c.id) return;
                            const token = getToken();
                            if (!token) return;
                            setQuickMarkSaving(true);
                            try {
                              await fetch(`${API_BASE_URL}/events/${c.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({
                                  status: 'completed',
                                  completed_at: new Date(quickMarkDate + 'T12:00:00').toISOString(),
                                  ...(quickMarkNotes.trim() ? { notes: quickMarkNotes.trim() } : {}),
                                }),
                              });
                              setQuickMarkId(null);
                              await fetchPetEvents(selectedPetId!);
                              setQuickMarkToast(c.label);
                              setTimeout(() => setQuickMarkToast(null), 4000);
                            } finally { setQuickMarkSaving(false); }
                          }}
                          className="flex-1 text-[12px] font-bold py-1.5 rounded-lg bg-green-500 text-white active:scale-95 transition-all disabled:opacity-40"
                        >
                          {quickMarkSaving ? '...' : '✓ Feito'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

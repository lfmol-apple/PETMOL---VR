'use client';

import { useMemo, useState } from 'react';
import { AppleControlButtons } from '@/components/AppleControlButtons';
import { buildPetCareReminders, resolveCareCTA } from '@/lib/petCareDomain';
import type { PetEventRecord } from '@/lib/petEvents';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';
import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';

type CardTone = 'neutral' | 'ok' | 'warning' | 'critical';

const reminderMonths = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const HEALTH_QUICK_TARGETS = new Set([
  'health/vaccines', 'health/medication',
  'health/parasites/dewormer', 'health/parasites/flea_tick',
  'health/parasites/collar', 'health/parasites',
]);

function createLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatReminderDate(dateStr: string): string {
  const date = createLocalDate(dateStr);
  return `${date.getDate()} ${reminderMonths[date.getMonth()]}`;
}

function formatFoodDateShort(dateStr: string): string {
  const date = createLocalDate(dateStr);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatReminderBadge(diff: number): string {
  if (diff < 0) {
    const days = Math.abs(diff);
    if (days > 90) return 'revisão recomendada';
    return days === 1 ? 'atrasado desde ontem' : `atrasado há ${days} dias`;
  }
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  return `em ${diff} dias`;
}

function diffDaysFromIso(isoDate: string): number | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((startTarget.getTime() - startToday.getTime()) / 86400000);
}

function addDaysIso(startIso: string | null | undefined, days: number | null | undefined): string | null {
  if (!startIso || !days || days <= 0) return null;
  const [y, m, d] = startIso.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getReminderTone(diff: number): string {
  if (diff < 0) return 'border-rose-200 bg-rose-50 text-rose-800 shadow-[0_0_12px_rgba(244,63,94,0.12)]';
  if (diff === 0) return 'border-amber-300 bg-amber-50 text-amber-900 shadow-[0_0_12px_rgba(251,191,36,0.16)]';
  if (diff <= 3) return 'border-amber-200 bg-amber-50 text-amber-800';
  if (diff <= 7) return 'border-sky-200 bg-sky-50 text-sky-800';
  return 'border-slate-200 bg-white text-slate-600';
}

interface HomePetDashboardProps {
  petEvents: PetEventRecord[];
  vaccines: VaccineRecord[];
  parasiteControls: ParasiteControl[];
  groomingRecords: GroomingRecord[];
  feedingPlan: Record<string, FeedingPlanEntry>;
  viewerPreferenceId: string;
  currentPet: PetHealthProfile;
  tutorCheckinDay: number;
  selectedPetId: string | null;
  quickMarkId: string | null;
  setQuickMarkId: (value: string | null) => void;
  quickMarkDate: string;
  setQuickMarkDate: (value: string) => void;
  quickMarkNotes: string;
  setQuickMarkNotes: (value: string) => void;
  quickMarkSaving: boolean;
  setQuickMarkSaving: (value: boolean) => void;
  quickMarkToast: string | null;
  setQuickMarkToast: (value: string | null) => void;
  fetchPetEvents: (petId: string) => Promise<void>;
  onOpenHealth: () => void;
  onOpenDocuments: () => void;
  alertVacinas?: boolean;
  colorVacinas?: CardTone;
  alertVermifugo?: boolean;
  colorVermifugo?: CardTone;
  alertAntipulgas?: boolean;
  colorAntipulgas?: CardTone;
  alertColeira?: boolean;
  colorColeira?: CardTone;
  alertGrooming?: boolean;
  colorGrooming?: CardTone;
  alertFood?: boolean;
  colorFood?: CardTone;
  alertMedicacao?: boolean;
  colorMedicacao?: CardTone;
  onOpenVaccines: () => void;
  onOpenVermifugo: () => void;
  onOpenAntipulgas: () => void;
  onOpenColeira: () => void;
  onOpenGrooming: () => void;
  onOpenMedication: () => void;
  onOpenFood: () => void;
  onOpenEvents: () => void;
  onOpenFamily?: () => void;
  onHealthItemClick?: (ctx: {
    action_target: string;
    label: string;
    pet_id: string;
    pet_name: string;
    status: 'overdue' | 'today' | 'upcoming';
    days_overdue?: number;
    source_record_id?: string;
  }) => void;
}

export function HomePetDashboard({
  petEvents,
  vaccines,
  parasiteControls,
  groomingRecords,
  feedingPlan,
  currentPet,
  tutorCheckinDay: _tutorCheckinDay,
  onOpenHealth,
  onOpenDocuments,
  alertVacinas,
  colorVacinas,
  alertVermifugo,
  colorVermifugo,
  alertAntipulgas,
  colorAntipulgas,
  alertColeira,
  colorColeira,
  alertGrooming,
  colorGrooming,
  alertFood,
  colorFood,
  alertMedicacao,
  colorMedicacao,
  onOpenVaccines,
  onOpenVermifugo,
  onOpenAntipulgas,
  onOpenColeira,
  onOpenGrooming,
  onOpenMedication,
  onOpenFood,
  onOpenEvents,
  onOpenFamily,
  onHealthItemClick,
}: HomePetDashboardProps) {

  const healthTones = [colorVacinas, colorVermifugo, colorAntipulgas, colorColeira];
  const colorHealth: CardTone = healthTones.includes('critical')
    ? 'critical'
    : healthTones.includes('warning')
      ? 'warning'
      : healthTones.includes('ok')
        ? 'ok'
        : 'neutral';
  const alertHealth = colorHealth === 'warning' || colorHealth === 'critical' || alertVacinas || alertVermifugo || alertAntipulgas || alertColeira;
  const upcomingReminders = useMemo(() => {
    if (!currentPet?.pet_id) return [];

    const reminders = buildPetCareReminders(
      {
        pet_id: currentPet.pet_id,
        pet_name: currentPet.pet_name,
        vaccines,
        parasiteControls,
        groomingRecords,
        feedingPlan: feedingPlan[currentPet.pet_id] ?? null,
        petEvents,
      },
    );

    const careHandlers = {
      onOpenVaccines,
      onOpenVermifugo,
      onOpenAntipulgas,
      onOpenColeira,
      onOpenGrooming,
      onOpenFood,
      onOpenMedication,
      onOpenEvents,
    };

    return reminders
      .filter((reminder) => {
        if (reminder.diff < 0) return false; // exclude overdue — go to "Precisa de atenção"
        if (reminder.diff === 0 && reminder.domain !== 'medication' && reminder.action_target !== 'health/medication') return false;
        if (reminder.domain === 'grooming') return false;
        if (reminder.domain === 'food' && reminder.diff > 14) return false;
        return true;
      })
      .sort((a, b) => a.diff - b.diff)
      .map((reminder) => ({
        ...reminder,
        action: resolveCareCTA(reminder.action_target, careHandlers),
      }));
  }, [
    currentPet,
    vaccines,
    parasiteControls,
    groomingRecords,
    feedingPlan,
    petEvents,
    onOpenHealth,
    onOpenVaccines,
    onOpenVermifugo,
    onOpenAntipulgas,
    onOpenColeira,
    onOpenGrooming,
    onOpenFood,
    onOpenMedication,
    onOpenEvents,
  ]);
  
  const hasFoodData = Object.keys(feedingPlan).length > 0 && (() => {
    const plan = feedingPlan[currentPet.pet_id];
    if (!plan) return false;
    return Boolean(
      plan.items?.length ||
      plan.food_brand ||
      plan.brand ||
      typeof plan.duration_days === 'number' ||
      plan.estimated_end_date ||
      typeof plan.estimated_days_left === 'number',
    );
  })();
  const foodPlan = feedingPlan[currentPet.pet_id] ?? null;
  const durationEndDate = addDaysIso(foodPlan?.last_refill_date, typeof foodPlan?.duration_days === 'number' ? foodPlan.duration_days : null);
  const resolvedFoodEndDate = foodPlan?.estimated_end_date ?? durationEndDate ?? foodPlan?.next_purchase_date ?? null;
  const foodDaysLeft = typeof foodPlan?.estimated_days_left === 'number'
    ? foodPlan.estimated_days_left
    : (resolvedFoodEndDate ? diffDaysFromIso(resolvedFoodEndDate) : null);
  const foodTitle = `Ração do ${currentPet.pet_name}`;
  const foodHeadline = !hasFoodData
    ? 'Cadastre a ração para o PETMOL avisar antes de acabar.'
    : foodDaysLeft != null
      ? foodDaysLeft < 0
        ? 'Pode estar sem ração!'
        : foodDaysLeft === 0
          ? 'Acaba hoje!'
          : `${foodDaysLeft} dias restantes`
      : 'Toque para atualizar o estoque';
  const foodSubline = !hasFoodData
    ? 'Adicionar ração'
    : resolvedFoodEndDate
      ? `Previsão: ${formatFoodDateShort(resolvedFoodEndDate)}`
      : null;

  return (
    <div className="relative px-2 pt-2 pb-6 space-y-4">
      {upcomingReminders.length > 0 && (
        <section className="rounded-[20px] border border-white/70 bg-white/75 px-3 py-2.5 shadow-md shadow-slate-900/5 backdrop-blur-xl ring-1 ring-black/5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1 mb-1.5">
            Próximos 30 dias
          </p>
          <div className="divide-y divide-slate-100/60">
            {upcomingReminders.map((reminder) => {
              const handleClick = () => {
                if (onHealthItemClick && HEALTH_QUICK_TARGETS.has(reminder.action_target)) {
                  onHealthItemClick({
                    action_target: reminder.action_target,
                    label: reminder.label,
                    pet_id: currentPet.pet_id,
                    pet_name: currentPet.pet_name,
                    status: 'upcoming',
                    source_record_id: reminder.source_record_id,
                  });
                } else {
                  reminder.action();
                }
              };
              return (
                <button
                  key={reminder.key}
                  onClick={handleClick}
                  className="flex w-full items-center gap-2.5 py-2 px-1 text-left active:bg-slate-50 rounded-xl transition-colors"
                >
                  <span className="text-[18px] flex-shrink-0 leading-none">{reminder.icon}</span>
                  <span className="flex-1 text-[13px] font-semibold text-slate-800 truncate leading-tight">
                    {reminder.label}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400 flex-shrink-0 tabular-nums">
                    {reminder.diff === 0 ? 'ainda dá tempo' : `em ${reminder.diff} dia${reminder.diff !== 1 ? 's' : ''}`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <AppleControlButtons
        onHealthClick={onOpenHealth}
        onDocumentosClick={onOpenDocuments}
        onAlimentacaoClick={onOpenFood}
        onBanhoTosaClick={onOpenGrooming}
        onMedicacaoClick={onOpenMedication}
        onFamilyClick={onOpenFamily}
        hasFoodData={hasFoodData}
        foodTitle={foodTitle}
        foodHeadline={foodHeadline ?? undefined}
        foodSubline={foodSubline ?? undefined}
        alertHealth={alertHealth}
        alertGrooming={alertGrooming}
        alertFood={alertFood}
        alertMedicacao={alertMedicacao}
        colorHealth={colorHealth}
        colorGrooming={colorGrooming}
        colorFood={colorFood}
        colorMedicacao={colorMedicacao}
      />
    </div>
  );
}

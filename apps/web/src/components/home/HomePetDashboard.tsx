'use client';

import { useMemo } from 'react';
import { AppleControlButtons } from '@/components/AppleControlButtons';
import { buildPetCareReminders, resolveCareCTA } from '@/lib/petCareDomain';
import type { PetEventRecord } from '@/lib/petEvents';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';
import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';

type CardTone = 'neutral' | 'ok' | 'warning' | 'critical';

const reminderMonths = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function createLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatReminderDate(dateStr: string): string {
  const date = createLocalDate(dateStr);
  return `${date.getDate()} ${reminderMonths[date.getMonth()]}`;
}

function formatReminderBadge(diff: number): string {
  if (diff < 0) {
    const days = Math.abs(diff);
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
}: HomePetDashboardProps) {

  const healthTones = [colorVacinas, colorVermifugo, colorAntipulgas, colorColeira, colorMedicacao];
  const colorHealth: CardTone = healthTones.includes('critical')
    ? 'critical'
    : healthTones.includes('warning')
      ? 'warning'
      : healthTones.includes('ok')
        ? 'ok'
        : 'neutral';
  const alertHealth = colorHealth === 'warning' || colorHealth === 'critical' || alertVacinas || alertVermifugo || alertAntipulgas || alertColeira || alertMedicacao;
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
        // Alimentação só aparece quando está próxima (≤ 14 dias)
        if (reminder.domain === 'food' && reminder.diff > 14) return false;
        return true;
      })
      .sort((a, b) => {
        const urgencyA = a.diff < 0 ? 0 : a.diff === 0 ? 1 : 2;
        const urgencyB = b.diff < 0 ? 0 : b.diff === 0 ? 1 : 2;
        if (urgencyA !== urgencyB) return urgencyA - urgencyB;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      })
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
      plan.estimated_end_date ||
      typeof plan.estimated_days_left === 'number',
    );
  })();
  const foodPlan = feedingPlan[currentPet.pet_id] ?? null;
  const foodDaysLeft = typeof foodPlan?.estimated_days_left === 'number'
    ? foodPlan.estimated_days_left
    : (foodPlan?.estimated_end_date ? diffDaysFromIso(foodPlan.estimated_end_date) : null);
  const foodTitle = !hasFoodData ? `Ração do ${currentPet.pet_name}` : undefined;
  const foodHeadline = !hasFoodData
    ? 'Cadastre a ração para o PETMOL avisar antes de acabar.'
    : foodDaysLeft == null
      ? 'Plano de alimentação ativo'
      : foodDaysLeft < 0
        ? 'Pode estar sem ração'
        : foodDaysLeft <= 3
          ? `Acabando em ${foodDaysLeft} dia${foodDaysLeft === 1 ? '' : 's'}`
          : `${foodDaysLeft} dias restantes`;
  const foodSubline = !hasFoodData
    ? 'Adicionar ração'
    : foodPlan?.estimated_end_date
      ? `Acaba em ${formatReminderDate(foodPlan.estimated_end_date)}`
      : null;

  return (
    <div className="relative px-2 pt-2 pb-6 space-y-4">
      {upcomingReminders.length > 0 && (
        <section className="rounded-[24px] border border-white/70 bg-white/75 px-3 py-4 shadow-lg shadow-slate-900/5 backdrop-blur-xl ring-1 ring-black/5">
          <div className="mb-4 flex items-center justify-between px-1">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cuidados</p>
              <p className="text-sm font-bold text-slate-800 tracking-tight">O que vem pela frente para {currentPet.pet_name}</p>
            </div>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-800 px-2 text-[10px] font-bold text-white shadow-lg ring-4 ring-white/10">
              {upcomingReminders.length}
            </span>
          </div>

          <div className="space-y-2.5">
            {upcomingReminders.map((reminder) => (
              <button
                key={reminder.key}
                onClick={reminder.action}
                className="group relative flex w-full items-center gap-3 rounded-[20px] border border-white/60 bg-white/80 p-2.5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:bg-white active:scale-[0.98] shadow-sm"
              >
                <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-md ring-1 ring-black/5 transition-transform group-hover:scale-110">
                  {reminder.icon}
                  {reminder.diff === 0 && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500 border-2 border-white"></span>
                    </span>
                  )}
                </div>
                
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="block text-[14px] font-bold leading-tight text-slate-900 tracking-tight">
                      {reminder.label}
                    </span>
                  </div>
                  <span className="mt-0.5 block text-[11px] font-medium leading-tight text-slate-500">
                    {reminder.sublabel || 'Toque para abrir'}
                  </span>
                </div>

                <div className="flex flex-col items-end gap-1.5 pr-1">
                  <span className="text-[10px] font-semibold text-slate-400">{formatReminderDate(reminder.due_date)}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${getReminderTone(reminder.diff)}`}>
                    {formatReminderBadge(reminder.diff)}
                  </span>
                </div>
              </button>
            ))}
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

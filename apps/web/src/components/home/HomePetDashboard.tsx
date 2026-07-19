'use client';

import { useMemo, useState, useEffect } from 'react';
import { AppleControlButtons } from '@/components/AppleControlButtons';
import { buildPetCareReminders } from '@/lib/petCareDomain';
import type { PetCareReminder } from '@/lib/petCareDomain';
import type { PetEventRecord } from '@/lib/petEvents';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';
import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';
import { petDo } from '@/lib/petGender';

type CardTone = 'neutral' | 'ok' | 'warning' | 'critical';

function createLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatFoodDateShort(dateStr: string): string {
  const date = createLocalDate(dateStr);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
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
  onOpenPetSumido?: () => void;
  onUpcomingCountChange?: (count: number, reminders: PetCareReminder[]) => void;
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
  onOpenPetSumido,
  onUpcomingCountChange,
  onHealthItemClick,
}: HomePetDashboardProps) {

  const healthTones = [colorVacinas, colorVermifugo, colorAntipulgas, colorColeira, colorMedicacao, colorGrooming];
  const colorHealth: CardTone = healthTones.includes('critical')
    ? 'critical'
    : healthTones.includes('warning')
      ? 'warning'
      : healthTones.includes('ok')
        ? 'ok'
        : 'neutral';
  const alertHealth = colorHealth === 'warning' || colorHealth === 'critical' || alertVacinas || alertVermifugo || alertAntipulgas || alertColeira || alertMedicacao || alertGrooming;
  const allUpcomingReminders = useMemo(() => {
    if (!currentPet?.pet_id) return [];
    const reminders = buildPetCareReminders({
      pet_id: currentPet.pet_id,
      pet_name: currentPet.pet_name,
      vaccines,
      parasiteControls,
      groomingRecords,
      feedingPlan: feedingPlan[currentPet.pet_id] ?? null,
      petEvents,
    });
    return reminders.filter((r) => r.diff >= 0).sort((a, b) => a.diff - b.diff);
  }, [currentPet, vaccines, parasiteControls, groomingRecords, feedingPlan, petEvents]);

  useEffect(() => {
    onUpcomingCountChange?.(allUpcomingReminders.length, allUpcomingReminders);
  }, [allUpcomingReminders, onUpcomingCountChange]);
  
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
  const foodTitle = `Ração ${petDo(currentPet)} ${currentPet.pet_name}`;
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
    <div className="relative px-2 pt-1 pb-4 space-y-3 sm:pt-2 sm:pb-6 sm:space-y-4">
      <AppleControlButtons
        onHealthClick={onOpenHealth}
        onDocumentosClick={onOpenDocuments}
        petName={currentPet.pet_name}
        onAlimentacaoClick={onOpenFood}
        onBanhoTosaClick={onOpenGrooming}
        onMedicacaoClick={onOpenMedication}
        onFamilyClick={onOpenFamily}
        onPetSumidoClick={onOpenPetSumido}
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

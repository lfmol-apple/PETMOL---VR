'use client';

import { useMemo, useState, useEffect } from 'react';
import { AppleControlButtons } from '@/components/AppleControlButtons';
import { HomeShoppingSheet } from '@/features/commerce/HomeShoppingSheet';
import { buildPetCareReminders } from '@/lib/petCareDomain';
import type { CareActionTarget, PetCareReminder } from '@/lib/petCareDomain';
import type { PetEventRecord } from '@/lib/petEvents';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';
import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';

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

// Gravidade real, não ordem de cadastro nem alfabética — coleira (leishmaniose
// no Brasil: grave, às vezes fatal, sem cura definitiva) pesa mais que
// vermífugo ou banho. É essa ordem que decide o que o card de Saúde mostra
// quando mais de um cuidado está vencendo ao mesmo tempo.
function healthSeverityRank(actionTarget: CareActionTarget): number {
  if (actionTarget === 'health/parasites/collar') return 0;
  if (actionTarget === 'health/medication') return 1;
  if (
    actionTarget === 'health/parasites/dewormer' ||
    actionTarget === 'health/parasites/flea_tick' ||
    actionTarget === 'health/parasites'
  ) return 2;
  if (actionTarget === 'health/grooming') return 3;
  return 4;
}

function formatReminderHeadline(reminder: PetCareReminder): string {
  const days = reminder.diff;
  const when = days < 0
    ? `venceu há ${Math.abs(days)} dia${Math.abs(days) === 1 ? '' : 's'}`
    : days === 0
      ? 'vence hoje'
      : `vence em ${days} dia${days === 1 ? '' : 's'}`;
  return `${reminder.label} ${when}`;
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

  // Cão sem NENHUM registro de coleira/leishmaniose ainda — mesmo tratamento
  // que vacina zerada leva (neutral vira critical): não dá pra esperar um
  // reminder de um registro que nunca existiu. Só cão porque a prevenção por
  // coleira é especificamente uma recomendação canina. Feedback explícito do
  // usuário: esse alerta precisa de local de fácil acesso, sem depender de
  // tour de onboarding pulável — o card de Saúde, sempre visível na home, é
  // esse local.
  const hasLeishmaniaseProtection = parasiteControls.some(
    (p) => p.type === 'collar' || p.type === 'leishmaniasis',
  );
  const needsLeishmaniaseAwareness = currentPet.species === 'dog' && !hasLeishmaniaseProtection;

  // A pet with ZERO vaccine history ('neutral' — never registered) is a
  // real gap worth the red dot, same as an actually-overdue one — treated
  // as 'critical' here specifically for vaccine (per explicit feedback;
  // vermífugo/antipulgas/ração intentionally stay untouched, since
  // treating "no data" as critical for every domain was what caused the
  // earlier false-positive household count). Without this, a pet with no
  // vaccines but an otherwise-fine health card resolved to colorHealth=
  // 'ok', and the dot never showed — shouldShowAlert only checks the tone
  // string, so alertVacinas being true didn't matter on its own. Coleira
  // gets the same "neutral -> critical" override, gated on
  // needsLeishmaniaseAwareness, for the same reason.
  const effectiveVaccineTone: CardTone = (colorVacinas === 'neutral' || colorVacinas === undefined) ? 'critical' : colorVacinas;
  const effectiveColeiraTone: CardTone = needsLeishmaniaseAwareness ? 'critical' : (colorColeira ?? 'neutral');
  const healthTones = [effectiveVaccineTone, colorVermifugo, colorAntipulgas, effectiveColeiraTone, colorMedicacao, colorGrooming];
  const colorHealth: CardTone = healthTones.includes('critical')
    ? 'critical'
    : healthTones.includes('warning')
      ? 'warning'
      : healthTones.includes('ok')
        ? 'ok'
        : 'neutral';
  const alertHealth = colorHealth === 'warning' || colorHealth === 'critical' || alertVacinas || alertVermifugo || alertAntipulgas || alertColeira || alertMedicacao || alertGrooming || needsLeishmaniaseAwareness;
  const reminders = useMemo(() => {
    if (!currentPet?.pet_id) return [];
    return buildPetCareReminders({
      pet_id: currentPet.pet_id,
      pet_name: currentPet.pet_name,
      vaccines,
      parasiteControls,
      groomingRecords,
      feedingPlan: feedingPlan[currentPet.pet_id] ?? null,
      petEvents,
    });
  }, [currentPet, vaccines, parasiteControls, groomingRecords, feedingPlan, petEvents]);

  // Includes OVERDUE reminders (diff < 0) too, not just future ones — the
  // bell shows the full picture (count includes everything; only the
  // COLOR distinguishes real pendências from what's merely upcoming — see
  // hasUrgentReminder derived from this same list at the page level).
  // Sorted ascending by diff, so the most overdue item leads.
  const allUpcomingReminders = useMemo(
    () => [...reminders].sort((a, b) => a.diff - b.diff),
    [reminders],
  );

  const [showShoppingSheet, setShowShoppingSheet] = useState(false);

  useEffect(() => {
    onUpcomingCountChange?.(allUpcomingReminders.length, allUpcomingReminders);
  }, [allUpcomingReminders, onUpcomingCountChange]);

  // Card de Vacina: o lembrete de vacina mais próximo de vencer (a lista já
  // vem ordenada por proximidade — o primeiro da fila é o certo).
  const vaccineReminder = useMemo(
    () => allUpcomingReminders.find((r) => r.domain === 'vaccine') ?? null,
    [allUpcomingReminders],
  );
  const hasVaccineData = vaccines.length > 0;
  const vaccineHeadline = vaccineReminder
    ? formatReminderHeadline(vaccineReminder)
    : hasVaccineData
      ? 'Vacinas em dia'
      : undefined; // sem dado nenhum — cai no texto estático de convite do card

  // Card de Saúde: entre remédio/antiparasitário/vermífugo/banho (vacina já
  // tem card próprio, ração também), pega o de maior gravidade real
  // vencendo — não o mais recente cadastrado.
  const healthReminder = useMemo(() => {
    const candidates = allUpcomingReminders.filter(
      (r) => r.domain === 'parasite' || r.domain === 'medication' || r.domain === 'grooming',
    );
    if (candidates.length === 0) return null;
    return [...candidates].sort(
      (a, b) => healthSeverityRank(a.action_target) - healthSeverityRank(b.action_target) || a.diff - b.diff,
    )[0];
  }, [allUpcomingReminders]);
  const hasHealthData = parasiteControls.length > 0 || groomingRecords.length > 0;

  const healthHeadline = healthReminder
    ? formatReminderHeadline(healthReminder)
    : needsLeishmaniaseAwareness
      ? '🦟 Leishmaniose: proteja com coleira'
      : hasHealthData
        ? 'Tudo em dia' // conquista — não é só ausência de alerta
        : undefined; // sem dado — cai no texto estático de convite do card

  const foodPlan = feedingPlan[currentPet.pet_id] ?? null;
  // Tutor declarou explicitamente que não usa ração de saco (natural,
  // caseira etc.) — card fica calmo/informativo, sem cobrar marca/peso/
  // consumo que nunca vão existir. Ver FoodItemSheet.handleDeclareNonKibble.
  const isNonKibbleDeclared = Boolean(
    foodPlan?.no_consumption_control && foodPlan?.mode && foodPlan.mode !== 'kibble' &&
    !foodPlan?.food_brand && !foodPlan?.brand,
  );
  const hasFoodData = isNonKibbleDeclared || (Object.keys(feedingPlan).length > 0 && (() => {
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
  })());
  const durationEndDate = addDaysIso(foodPlan?.last_refill_date, typeof foodPlan?.duration_days === 'number' ? foodPlan.duration_days : null);
  const resolvedFoodEndDate = foodPlan?.estimated_end_date ?? durationEndDate ?? foodPlan?.next_purchase_date ?? null;
  const foodDaysLeft = typeof foodPlan?.estimated_days_left === 'number'
    ? foodPlan.estimated_days_left
    : (resolvedFoodEndDate ? diffDaysFromIso(resolvedFoodEndDate) : null);
  const foodTitle = 'Alimentação';
  const foodHeadline = isNonKibbleDeclared
    ? 'Alimentação caseira'
    : !hasFoodData
      ? 'Cadastre a ração para o PETMOL avisar antes de acabar.'
      : foodDaysLeft != null
        ? foodDaysLeft < 0
          ? 'Pode estar sem ração!'
          : foodDaysLeft === 0
            ? 'Acaba hoje!'
            : `${foodDaysLeft} dias restantes`
        : 'Toque para atualizar o estoque';
  const foodSubline = isNonKibbleDeclared
    ? null
    : !hasFoodData
      ? 'Adicionar ração'
      : resolvedFoodEndDate
        ? `Previsão: ${formatFoodDateShort(resolvedFoodEndDate)}`
        : null;

  return (
    <div className="relative px-2 pt-1 pb-4 space-y-3 sm:pt-2 sm:pb-6 sm:space-y-4">
      <AppleControlButtons
        onHealthClick={onOpenHealth}
        onVaccinesClick={onOpenVaccines}
        petName={currentPet.pet_name}
        petSex={currentPet.sex}
        onAlimentacaoClick={onOpenFood}
        onBanhoTosaClick={onOpenGrooming}
        onMedicacaoClick={onOpenMedication}
        onFamilyClick={onOpenFamily}
        onPetSumidoClick={onOpenPetSumido}
        onShoppingClick={() => setShowShoppingSheet(true)}
        hasFoodData={hasFoodData}
        foodTitle={foodTitle}
        foodHeadline={foodHeadline ?? undefined}
        foodSubline={foodSubline ?? undefined}
        vaccineHeadline={vaccineHeadline}
        healthHeadline={healthHeadline}
        alertHealth={alertHealth}
        alertGrooming={alertGrooming}
        alertFood={alertFood}
        alertMedicacao={alertMedicacao}
        alertVaccines={alertVacinas}
        colorHealth={colorHealth}
        colorGrooming={colorGrooming}
        colorFood={colorFood}
        colorMedicacao={colorMedicacao}
        colorVaccines={colorVacinas}
      />
      <HomeShoppingSheet
        open={showShoppingSheet}
        onClose={() => setShowShoppingSheet(false)}
        currentPet={currentPet}
        buyableReminders={reminders}
      />
    </div>
  );
}

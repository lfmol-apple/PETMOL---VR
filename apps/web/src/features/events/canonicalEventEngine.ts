import type { PetWithHealth } from '@/features/pets/types';
import { buildPetCareReminders, type PetCareReminder } from '@/lib/petCareDomain';
import { effectiveGroomingRecords } from '@/lib/groomingRoutine';
import type { PetEventRecord } from '@/lib/petEvents';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';
import type {
  CanonicalEventActionTarget,
  CanonicalEventSeverity,
  CanonicalPetEvent,
} from './types';

export interface CanonicalEventPetInput {
  pet: PetWithHealth;
  feedingPlan?: FeedingPlanEntry | null;
  petEvents?: PetEventRecord[];
}

function resolveSeverity(diff: number): CanonicalEventSeverity {
  if (diff < 0) return diff <= -7 ? 'critical' : 'warning';
  if (diff === 0) return 'critical';
  if (diff <= 7) return 'warning';
  return 'info';
}

function resolveActionTarget(target: PetCareReminder['action_target']): CanonicalEventActionTarget {
  if (target === 'health/events') {
    return 'health/eventos';
  }

  return target;
}

function toCanonicalEvent(reminder: PetCareReminder, petName: string): CanonicalPetEvent {
  return {
    id: reminder.key,
    key: reminder.key,
    pet_id: reminder.pet_id,
    pet_name: petName,
    domain: reminder.domain,
    label: reminder.label,
    sublabel: reminder.sublabel,
    icon: reminder.icon,
    due_date: reminder.due_date,
    diff: reminder.diff,
    status: reminder.status,
    severity: resolveSeverity(reminder.diff),
    action_target: resolveActionTarget(reminder.action_target),
    source: 'pet-care-domain',
    source_record_id: reminder.source_record_id,
    is_derived: reminder.is_derived,
  };
}

export function buildCanonicalEventsForPet(
  input: CanonicalEventPetInput,
  options: { maxDays?: number } = {},
): CanonicalPetEvent[] {
  const { pet, feedingPlan = null, petEvents = [] } = input;
  const reminders = buildPetCareReminders({
    pet_id: pet.pet_id,
    pet_name: pet.pet_name,
    vaccines: pet.vaccines ?? pet.health_data?.vaccines ?? [],
    parasiteControls: pet.parasite_controls ?? pet.health_data?.parasite_controls ?? [],
    groomingRecords: effectiveGroomingRecords(pet.grooming_records ?? pet.health_data?.grooming_records ?? [], pet.grooming_routine),
    feedingPlan,
    petEvents,
  }, options);

  return reminders.map((reminder) => toCanonicalEvent(reminder, pet.pet_name));
}
export function buildCanonicalEventsForPets(
  inputs: CanonicalEventPetInput[],
  options: { maxDays?: number } = {},
): CanonicalPetEvent[] {
  const petOrder = new Map(inputs.map(({ pet }, index) => [pet.pet_id, index]));

  return inputs
    .flatMap((input) => buildCanonicalEventsForPet(input, options))
    .sort((left, right) => {
      const statusOrder = { overdue: 0, today: 1, upcoming: 2 };
      const severityOrder = { critical: 0, warning: 1, info: 2 };

      if (left.status !== right.status) {
        return statusOrder[left.status] - statusOrder[right.status];
      }

      if (left.severity !== right.severity) {
        return severityOrder[left.severity] - severityOrder[right.severity];
      }

      if (left.status === 'overdue' && right.status === 'overdue') {
        const diff = left.diff - right.diff;
        if (diff !== 0) return diff;
      } else {
        const dateDiff = new Date(left.due_date).getTime() - new Date(right.due_date).getTime();
        if (dateDiff !== 0) return dateDiff;
      }

      return (petOrder.get(left.pet_id) ?? 99) - (petOrder.get(right.pet_id) ?? 99);
    });
}
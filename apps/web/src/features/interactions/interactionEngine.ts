import type { CanonicalPetEvent } from '@/features/events/types';
import { localTodayISO } from '@/lib/localDate';
import type { CareInteractionPolicy, InteractionDecision, InteractionPreferences, MasterInteractionRules, PetInteractionItem } from './types';
import { DEFAULT_INTERACTION_PREFERENCES, DEFAULT_MASTER_INTERACTION_RULES } from './preferences';

export function resolveCarePolicyKeyFromEvent(event: CanonicalPetEvent): string {
  if (event.domain === 'vaccine') return 'vaccines';
  if (event.domain === 'medication') return 'medication';
  if (event.domain === 'grooming') return 'grooming';
  if (event.domain === 'food') return 'food';
  if (event.domain === 'event') return 'emergency';

  if (event.action_target === 'health/parasites/dewormer') return 'dewormer';
  if (event.action_target === 'health/parasites/flea_tick') return 'flea_tick';
  if (event.action_target === 'health/parasites/collar') return 'collar';

  return event.domain;
}

export function getCarePolicyForEvent(
  event: CanonicalPetEvent,
  rules: MasterInteractionRules = DEFAULT_MASTER_INTERACTION_RULES,
): CareInteractionPolicy | null {
  const careKey = resolveCarePolicyKeyFromEvent(event);
  return rules.carePolicies[careKey] ?? null;
}

export function getInteractionPriorityValue(policy: CareInteractionPolicy | null | undefined): number {
  if (!policy) return 0;
  if (typeof policy.priority === 'number') return policy.priority;

  const legacyPriorityMap = {
    low: 25,
    medium: 50,
    high: 75,
    critical: 100,
  } as const;

  return legacyPriorityMap[policy.priority] ?? policy.openPriority ?? 0;
}

export function isEventVisibleOnHome(
  event: CanonicalPetEvent,
  rules: MasterInteractionRules = DEFAULT_MASTER_INTERACTION_RULES,
): boolean {
  if (event.domain === 'grooming') return false;
  const policy = getCarePolicyForEvent(event, rules);
  if (!policy?.enabled) return false;
  if (policy.showOnHome === false) return false;
  return true;
}

function buildTitle(event: CanonicalPetEvent): string {
  return event.pet_name;
}

function buildBody(event: CanonicalPetEvent): string {
  if (event.status === 'today') {
    const todayMessages: Partial<Record<typeof event.domain, string>> = {
      vaccine: `Hoje é dia de reforço: ${event.label} 💉`,
      parasite: `Hoje é dia de aplicar ${event.label} 🛡️`,
      medication: `Lembrete de medicação: ${event.label} 💊`,
      grooming: `Hoje é dia do ${event.label} 🛁`,
      food: `${event.label} precisa de atenção hoje`,
      event: `${event.label} acontece hoje`,
    };
    return todayMessages[event.domain] ?? `Ação necessária hoje: ${event.label}`;
  }

  if (event.status === 'overdue') {
    const days = Math.abs(event.diff);
    const dayText = days <= 1 ? 'ontem' : `há ${days} dias`;
    const overdueMessages: Partial<Record<typeof event.domain, string>> = {
      vaccine: `Vacina ${event.label}: pode estar na hora de revisar (${dayText})`,
      parasite: `${event.label} está em atraso desde ${dayText}`,
      medication: `Medicação ${event.label} está em atraso`,
      grooming: `${event.label} está em atraso desde ${dayText}`,
      food: `${event.label} está em atraso desde ${dayText}`,
      event: `${event.label} precisa de atenção`,
    };
    return overdueMessages[event.domain] ?? `${event.label} precisa de atenção`;
  }

  const upcomingMessages: Partial<Record<typeof event.domain, string>> = {
    vaccine: `Vacina ${event.label}: vale confirmar com seu veterinário`,
    parasite: `${event.label} precisa ser renovado em breve`,
    medication: `${event.label}: lembrete de medicação`,
    grooming: `${event.label} está próximo`,
    food: `${event.label} está próximo`,
    event: `${event.label} está próximo`,
  };
  return upcomingMessages[event.domain] ?? `${event.label}: atenção necessária em breve`;
}

export function canonicalEventsToPetInteractions(
  events: CanonicalPetEvent[],
  rules: MasterInteractionRules = DEFAULT_MASTER_INTERACTION_RULES,
): PetInteractionItem[] {
  return events.flatMap((event) => {
    if (event.domain === 'grooming') return [];

    const careKey = resolveCarePolicyKeyFromEvent(event);
    const policy = rules.carePolicies[careKey];

    if (!policy?.enabled) return [];
    if (policy.showOnHome === false) return [];

    return [{
      id: event.id,
      pet_id: event.pet_id,
      pet_name: event.pet_name,
      care_key: careKey,
      category: event.domain,
      type_label: policy.label ?? event.label,
      severity: event.severity,
      status: event.status,
      due_date: event.due_date,
      days_overdue: event.diff < 0 ? Math.abs(event.diff) : undefined,
      action_target: event.action_target,
      action_label: policy.primaryCtaLabel ?? policy.primary.label,
      origin: 'pet-care-domain',
      priority: getInteractionPriorityValue(policy),
      show_on_home: policy.showOnHome,
      show_in_center: policy.showInCenter,
      show_on_app_open: policy.showOnAppOpen ?? false,
    }];
  });
}

function shouldNotify(event: CanonicalPetEvent, preferences: InteractionPreferences): boolean {
  if (!preferences.enabled) return false;
  if (preferences.categories[event.domain] === false) return false;
  if (event.status === 'upcoming') return event.diff <= preferences.advance_days;
  return true;
}

function buildNotificationDecision(event: CanonicalPetEvent): InteractionDecision {
  const today = localTodayISO();
  return {
    id: `notify:${event.id}`,
    channel: 'in-app-notification',
    category: event.domain,
    severity: event.severity,
    pet_id: event.pet_id,
    pet_name: event.pet_name,
    title: buildTitle(event),
    body: buildBody(event),
    action_target: event.action_target,
    source_event_id: event.id,
    source_key: event.key,
    due_date: event.due_date,
    dedup_key: today,
    requireInteraction: false,
    autoCloseMs: 4000,
  };
}

export function buildInteractionDecisions(
  events: CanonicalPetEvent[],
  preferences: InteractionPreferences = DEFAULT_INTERACTION_PREFERENCES,
): InteractionDecision[] {
  if (!events.length) return [];

  const decisions = events
    .filter((event) => shouldNotify(event, preferences))
    .map((event) => buildNotificationDecision(event));

  const seen = new Set<string>();
  return decisions.filter((decision) => {
    const key = `${decision.channel}:${decision.pet_id}:${decision.category}:${decision.dedup_key ?? decision.source_key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

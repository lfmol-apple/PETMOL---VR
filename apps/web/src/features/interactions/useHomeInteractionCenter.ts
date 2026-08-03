import { useMemo } from 'react';
import type { CanonicalPetEvent } from '@/features/events/types';
import type { PetInteractionItem } from './types';
import { loadMasterInteractionRules } from './preferences';
import { canonicalEventsToPetInteractions, isEventVisibleOnHome } from './interactionEngine';

type CardTone = 'neutral' | 'ok' | 'warning' | 'critical';

interface HomeInteractionCenterResult {
  topAttentionAlerts: PetInteractionItem[];
  topAttentionPetCount: number;
  selectedPetActiveAlerts: PetInteractionItem[];
  selectedPetAllAlerts: PetInteractionItem[];
  selectedPetCardAlerts: {
    vacinas: boolean;
    vermifugo: boolean;
    antipulgas: boolean;
    coleira: boolean;
    grooming: boolean;
    food: boolean;
  };
  selectedPetCardColors: {
    vacinas: CardTone;
    vermifugo: CardTone;
    antipulgas: CardTone;
    coleira: CardTone;
    grooming: CardTone;
    food: CardTone;
  };
  // Which pets across the whole household need attention on the basic-care
  // minimum (vacina/vermífugo/antipulgas/ração — the items that apply to
  // every pet regardless of health condition; medication/coleira/grooming
  // excluded on purpose). Distinct from topAttentionPetCount (which covers
  // a broader interaction set) and from selectedPetCard* (which is scoped
  // to only the currently-selected pet) — this one is cross-pet, for the
  // badge below the pet photo on Home. Returns pet_ids (not just a count)
  // so the badge can name the pet when there's exactly one.
  basicCareAttentionPetIds: string[];
}

function resolveTone(events: CanonicalPetEvent[]): CardTone {
  if (events.some((event) => event.status === 'overdue' || event.status === 'today')) return 'critical';
  if (events.some((event) => event.diff <= 7)) return 'warning';
  if (events.length > 0) return 'ok';
  return 'neutral';
}

function shouldAlert(events: CanonicalPetEvent[]): boolean {
  const tone = resolveTone(events);
  return tone === 'warning' || tone === 'critical';
}

export function useHomeInteractionCenter(
  interactions: PetInteractionItem[],
  canonicalEvents: CanonicalPetEvent[],
  selectedPetId: string | null,
  allPetIds: string[] = [],
): HomeInteractionCenterResult {
  return useMemo(() => {
    const rules = loadMasterInteractionRules();
    const visibleInteractions = interactions.filter(
      (interaction) => interaction.show_on_home !== false && interaction.category !== 'grooming',
    );

    const topAttentionAlerts = visibleInteractions.filter(
      (interaction) => interaction.status === 'overdue' || interaction.status === 'today',
    );
    const topAttentionPetCount = new Set(topAttentionAlerts.map((alert) => alert.pet_id).filter(Boolean)).size;

    // selectedPet* são computados diretamente dos canonicalEvents (sem o cap maxItemsPerPet
    // do loop multipet), garantindo que TODOS os itens em atraso do pet selecionado apareçam.
    const selectedPetEvents = selectedPetId
      ? canonicalEvents.filter((event) => (
          event.pet_id === selectedPetId
          && event.domain !== 'grooming'
          && isEventVisibleOnHome(event, rules)
        ))
      : [];

    const selectedPetAllAlerts: PetInteractionItem[] = canonicalEventsToPetInteractions(selectedPetEvents, rules);
    const selectedPetActiveAlerts = selectedPetAllAlerts.filter(
      (interaction) => interaction.status === 'overdue' || interaction.status === 'today',
    );

    const vaccineEvents = selectedPetEvents.filter((event) => event.domain === 'vaccine');
    const dewormerEvents = selectedPetEvents.filter((event) => event.action_target === 'health/parasites/dewormer');
    const fleaTickEvents = selectedPetEvents.filter((event) => event.action_target === 'health/parasites/flea_tick');
    const collarEvents = selectedPetEvents.filter((event) => event.action_target === 'health/parasites/collar');
    const foodEvents = selectedPetEvents.filter((event) => event.domain === 'food');

    // Basic-care attention across ALL pets — only 'critical' (actually
    // overdue) flags a pet; 'warning' (due soon, not yet late) and
    // 'neutral' (never registered) intentionally do NOT — see the comment
    // below on why 'neutral' was deliberately excluded here.
    const basicCareAttentionPetIds = allPetIds.filter((petId) => {
      const petEvents = canonicalEvents.filter((event) => (
        event.pet_id === petId
        && event.domain !== 'grooming'
        && isEventVisibleOnHome(event, rules)
      ));
      const vaccineTone = resolveTone(petEvents.filter((event) => event.domain === 'vaccine'));
      const otherTones = [
        resolveTone(petEvents.filter((event) => event.action_target === 'health/parasites/dewormer')),
        resolveTone(petEvents.filter((event) => event.action_target === 'health/parasites/flea_tick')),
        resolveTone(petEvents.filter((event) => event.domain === 'food')),
      ];
      // 'neutral' (never registered at all) counts as needing attention
      // ONLY for vaccine — a pet with zero vaccine history is a real,
      // deliberate gap worth flagging, not just a missing data point (per
      // explicit feedback). vermífugo/antipulgas/ração stay 'critical'-only:
      // a household-wide count needs to be trustworthy, and letting
      // 'neutral' count on all 4 domains previously inflated the total past
      // the number of pets with an actually overdue problem ("system says
      // 7 pets need attention, really only 3 do" — every pet simply
      // missing ONE domain's data, e.g. never logged "ração" for a
      // secondary pet, got flagged even though nothing was really due).
      if (vaccineTone === 'critical' || vaccineTone === 'neutral') return true;
      return otherTones.some((tone) => tone === 'critical');
    });

    return {
      topAttentionAlerts,
      topAttentionPetCount,
      selectedPetActiveAlerts,
      selectedPetAllAlerts,
      selectedPetCardAlerts: {
        vacinas: shouldAlert(vaccineEvents),
        vermifugo: shouldAlert(dewormerEvents),
        antipulgas: shouldAlert(fleaTickEvents),
        coleira: shouldAlert(collarEvents),
        grooming: false,
        food: shouldAlert(foodEvents),
      },
      selectedPetCardColors: {
        vacinas: resolveTone(vaccineEvents),
        vermifugo: resolveTone(dewormerEvents),
        antipulgas: resolveTone(fleaTickEvents),
        coleira: resolveTone(collarEvents),
        grooming: 'neutral',
        food: resolveTone(foodEvents),
      },
      basicCareAttentionPetIds,
    };
  }, [interactions, canonicalEvents, selectedPetId, allPetIds]);
}

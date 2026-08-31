import type { CanonicalEventActionTarget } from '@/features/events/types';
import type { ProductCategory } from '@/lib/productScanner';

export type HomePushActionType = 'vaccines' | 'medication' | 'parasites' | 'food' | 'grooming';

export const CANONICAL_ACTION_TARGET_TO_HOME_MODAL: Record<CanonicalEventActionTarget, string> = {
  'health/vaccines': 'vaccines',
  'health/parasites/dewormer': 'vermifugo',
  'health/parasites/flea_tick': 'antipulgas',
  'health/parasites/collar': 'coleira',
  'health/parasites': 'vermifugo',
  'health/medication': 'medication',
  'health/grooming': 'grooming',
  'health/food': 'food',
  'health/eventos': 'eventos',
};

export function resolveCanonicalActionTargetModal(target: CanonicalEventActionTarget): string {
  return CANONICAL_ACTION_TARGET_TO_HOME_MODAL[target] ?? 'health';
}

export function resolveTopAttentionDestination(target: CanonicalEventActionTarget): HomeSurfaceResolution | null {
  if (target === 'health/eventos') {
    return { kind: 'health-modal', healthModalMode: 'health', healthActiveTab: 'eventos' };
  }
  if (target === 'health/vaccines') {
    return { kind: 'sheet', sheet: 'vaccines_quick' };
  }

  const modal = resolveCanonicalActionTargetModal(target);
  return resolveHomeDeepLinkDestination(modal, null);
}

export function resolveScannedProductDestination(category: ProductCategory): HomeSurfaceResolution | null {
  if (category === 'food') return { kind: 'sheet', sheet: 'food' };
  if (category === 'medication') return { kind: 'sheet', sheet: 'medication' };
  if (category === 'dewormer') return { kind: 'sheet', sheet: 'vermifugo' };
  if (category === 'collar') return { kind: 'sheet', sheet: 'coleira' };
  if (category === 'antiparasite') return { kind: 'sheet', sheet: 'antipulgas' };
  return null;
}

export type HomeSurfaceResolution =
  | {
      kind: 'push-action-sheet';
      actionSheetType: HomePushActionType;
    }
  | {
      kind: 'health-modal';
      healthModalMode: 'health' | 'grooming' | 'food' | 'full';
      healthActiveTab?: 'vaccines' | 'parasites' | 'medication' | 'eventos';
    }
  | {
      kind: 'health-options';
    }
  | {
      kind: 'sheet';
      sheet: 'grooming' | 'food' | 'vaccines' | 'vaccines_quick' | 'vermifugo' | 'antipulgas' | 'coleira' | 'medication';
    }
  | {
      kind: 'edit-pet';
      initialSection: 'food';
    };

export function resolveHomeDeepLinkDestination(
  modal: string | null,
  tabParam: string | null,
  subtypeParam?: string | null,
): HomeSurfaceResolution | null {
  if (!modal) return null;
  const subtype = String(subtypeParam || '').trim().toLowerCase();

  if (modal === 'food-setup') {
    return { kind: 'edit-pet', initialSection: 'food' };
  }

  if (modal === 'eventos') {
    return { kind: 'health-modal', healthModalMode: 'health', healthActiveTab: 'eventos' };
  }

  if (modal === 'health') {
    return { kind: 'health-options' };
  }

  if (modal === 'manage') {
    if (tabParam === 'banho') {
      return { kind: 'sheet', sheet: 'grooming' };
    }

    if (tabParam === 'alimentacao') {
      return { kind: 'sheet', sheet: 'food' };
    }

    const modeMap: Record<string, 'health' | 'grooming' | 'food'> = {
      vacinas: 'health',
      antiparasitario: 'health',
      medicacao: 'health',
    };
    const tabMap: Record<string, 'vaccines' | 'parasites' | 'medication'> = {
      vacinas: 'vaccines',
      antiparasitario: 'parasites',
      medicacao: 'medication',
    };

    return {
      kind: 'health-modal',
      healthModalMode: modeMap[tabParam ?? ''] ?? 'health',
      healthActiveTab: tabMap[tabParam ?? ''],
    };
  }

  if (modal === 'vaccines' || modal === 'vaccine-sheet') {
    return { kind: 'sheet', sheet: 'vaccines' };
  }

  if (modal === 'parasites') {
    if (subtype === 'antipulgas' || subtype === 'flea_tick' || subtype === 'flea-tick' || subtype === 'antiparasite') {
      return { kind: 'sheet', sheet: 'antipulgas' };
    }
    if (subtype === 'coleira' || subtype === 'collar') {
      return { kind: 'sheet', sheet: 'coleira' };
    }
    return { kind: 'sheet', sheet: 'vermifugo' };
  }

  if (modal === 'vermifugo') {
    return { kind: 'sheet', sheet: 'vermifugo' };
  }

  if (modal === 'antipulgas') {
    return { kind: 'sheet', sheet: 'antipulgas' };
  }

  if (modal === 'coleira') {
    return { kind: 'sheet', sheet: 'coleira' };
  }

  if (modal === 'banho' || modal === 'grooming') {
    return { kind: 'sheet', sheet: 'grooming' };
  }

  if (modal === 'medication') {
    return { kind: 'sheet', sheet: 'medication' };
  }

  if (modal === 'food') {
    return { kind: 'sheet', sheet: 'food' };
  }

  return null;
}

export function resolvePushActionSheetFullDestination(type: HomePushActionType): HomeSurfaceResolution {
  if (type === 'food') {
    return { kind: 'sheet', sheet: 'food' };
  }

  if (type === 'grooming') {
    return { kind: 'sheet', sheet: 'grooming' };
  }

  if (type === 'vaccines') {
    return { kind: 'sheet', sheet: 'vaccines' };
  }

  if (type === 'parasites') {
    return { kind: 'sheet', sheet: 'vermifugo' };
  }

  return { kind: 'health-modal', healthModalMode: 'health', healthActiveTab: type };
}

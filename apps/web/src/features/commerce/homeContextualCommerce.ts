export type PushActionSheetContext = 'vaccines' | 'medication' | 'parasites' | 'food' | 'grooming';

export type HomeContextualCommerceTarget = 'food' | 'parasites';

export interface FoodCommerceSnapshot {
  status: 'steady' | 'attention' | 'urgent';
  title: string;
  description: string;
  ctaLabel: string;
  searchQuery: string;
}

export interface HomeContextualCommerceIntent {
  source: 'push_action_sheet';
  petId: string;
  itemName?: string;
  target: HomeContextualCommerceTarget;
}

interface ResolvePushActionSheetCommerceIntentInput {
  type: PushActionSheetContext;
  petId: string;
  itemName?: string;
}

interface HomeContextualCommerceHandlers {
  openFoodSheet: () => void;
  openParasiteSheet: () => void;
}

interface ResolveFoodCommerceSnapshotInput {
  brand: string;
  packageSizeKg?: string | null;
  daysLeft?: number | null;
  estimatedEndDate?: string | null;
}

export function resolveFoodCommerceSnapshot(
  input: ResolveFoodCommerceSnapshotInput,
): FoodCommerceSnapshot | null {
  const brand = input.brand.trim();
  if (!brand) return null;

  const sizeLabel = input.packageSizeKg ? `${input.packageSizeKg}kg` : '';
  const searchQuery = [brand, sizeLabel, 'ração pet'].filter(Boolean).join(' ').trim();

  if (input.daysLeft == null) {
    return {
      status: 'steady',
      title: 'Anote onde comprar para não buscar de novo',
      description: 'Registre sua loja preferida e a próxima compra fica a um toque de distância.',
      ctaLabel: 'Ver onde comprar',
      searchQuery,
    };
  }

  if (input.daysLeft < 0) {
    return {
      status: 'urgent',
      title: 'A ração já deve ter acabado',
      description: 'Já está na hora de comprar. Vamos direto para a loja.',
      ctaLabel: 'Comprar agora',
      searchQuery,
    };
  }

  if (input.daysLeft <= 5) {
    return {
      status: 'attention',
      title: 'Hora de preparar a próxima compra',
      description: input.estimatedEndDate
        ? `A ração termina por volta de ${input.estimatedEndDate}.`
        : 'Já é hora de pensar na próxima compra.',
      ctaLabel: 'Ver onde comprar',
      searchQuery,
    };
  }

  return {
    status: 'steady',
    title: 'Alimentação em dia',
    description: 'Quando acabar, você vai saber exatamente onde comprar.',
    ctaLabel: 'Ver onde comprar',
    searchQuery,
  };
}

export function resolvePushActionSheetCommerceIntent(
  input: ResolvePushActionSheetCommerceIntentInput,
): HomeContextualCommerceIntent | null {
  if (input.type === 'food') {
    return {
      source: 'push_action_sheet',
      petId: input.petId,
      itemName: input.itemName,
      target: 'food',
    };
  }

  if (input.type === 'parasites') {
    return {
      source: 'push_action_sheet',
      petId: input.petId,
      itemName: input.itemName,
      target: 'parasites',
    };
  }

  return null;
}

export function openHomeContextualCommerce(
  intent: HomeContextualCommerceIntent,
  handlers: HomeContextualCommerceHandlers,
): void {
  switch (intent.target) {
    case 'food':
      handlers.openFoodSheet();
      break;
    case 'parasites':
      handlers.openParasiteSheet();
      break;
    default:
      break;
  }
}
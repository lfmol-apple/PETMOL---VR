import type { InteractionPreferences, InteractionCategory, MasterInteractionRules, CareInteractionPolicy } from './types';

const INTERACTION_PREFERENCES_KEY = 'petmol_interaction_preferences';
// Armazena TEMPORARIAMENTE, no cliente, um espelho da política master.
// Em produção, essa política deve vir do backend/control plane do sistema.
const MASTER_RULES_KEY = 'petmol_master_interaction_policy_temp_v1';

// Preferências do tutor (camada 2) — por escopo/dispositivo
export const DEFAULT_INTERACTION_PREFERENCES: InteractionPreferences = {
  enabled: true,
  categories: {
    vaccine: true,
    parasite: true,
    medication: true,
    grooming: true,
    food: true,
    event: true,
    general: true,
  },
  advance_days: 7,
};

// Regras de governança master (camada 1) — globais
export const DEFAULT_MASTER_INTERACTION_RULES: MasterInteractionRules = {
  enabled: true,
  categories: {
    vaccine: true,
    parasite: true,
    medication: true,
    grooming: true,
    food: true,
    event: true,
    general: true,
  },
  // Governança master define a antecedência máxima permitida
  advance_days: 7,
  // Política de quais categorias podem ser silenciadas pelo tutor
  canBeSilenced: {
    vaccine: true,
    parasite: true,
    medication: true,
    grooming: true,
    food: true,
    event: true,
    general: true,
  },
  globalPolicy: {
    intensity: 'medium',
    cooldown_hours: 6,
    resurfacing: 'daily',
    insistenceLimit: 3,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
    },
    expiredBehavior: 'central-only',
    dueSoonBehavior: 'home-and-central',
  },
  channels: {
    internalCenter: {
      enabled: true,
    },
    homePanel: {
      enabled: true,
    },
    homeBadge: {
      enabled: true,
    },
  },
  externalChannels: {
    browserNotifications: {
      // Arquitetura preparada, mas canal EXTERNO desligado por padrão
      allowed: true,
      active: false,
    },
    pushNotifications: {
      // Push ativo como canal de conversão e cuidado
      allowed: true,
      active: true,
    },
  },
  carePolicies: buildDefaultCarePolicies(),
  multipet: {
    grouping: 'by-pet',
    showOverdueFirst: true,
    consolidatedOnAppOpen: true,
    multiplePendingBehavior: 'summarize',
    maxItemsPerPet: 3,
  },
};

export function buildDefaultCarePolicies(): Record<string, CareInteractionPolicy> {
  const base = (overrides: Partial<CareInteractionPolicy> = {}): CareInteractionPolicy => ({
    enabled: true,
    showOnHome: true,
    showInCenter: true,
    severity: 'warning',
    priority: 50,
    advance_days: 7,
    cooldown_hours: 24,
    resurfacing: 'daily',
    persistence: 'until-resolved',
    expiredBehavior: 'persistent',
    dueSoonBehavior: 'highlight',
    allowMarkAsOk: true,
    allowResolve: true,
    allowEdit: true,
    showOnAppOpen: false,
    showHomeBadge: true,
    openPriority: 50,
    commercialFocus: 'soft',
    primaryCtaLabel: 'Ver detalhes',
    secondaryCtaLabel: 'Ação secundária',
    purchaseDestination: 'open-shopping',
    registerDestination: 'open-register',
    editDestination: 'open-edit',
    historyDestination: 'open-history',
    internalCenterEnabled: true,
    homeEnabled: true,
    badgeEnabled: true,
    browserEnabled: false,
    pushEnabled: false,
    pushTitle: '',
    pushBody: '',
    pushPreferredHour: '08:00',
    pushRepeatLimit: 3,
    primary: {
      label: 'Ver detalhes',
      destination: 'open-central',
      allowContextualPurchase: false,
    },
    secondary: undefined,
    allowRemindLater: true,
    allowManualTracking: true,
    allowSilence: true,
    ...overrides,
  });

  return {
    vaccines: base({
      label: 'Vacinas',
      description: 'Carteira vacinal, reforços e histórico.',
      icon: '💉',
      domainType: 'vaccine',
      severity: 'critical',
      priority: 80,
      commercialFocus: 'none',
      primaryCtaLabel: 'Registrar dose',
      secondaryCtaLabel: 'Ver histórico',
      pushEnabled: true,
      pushTitle: '💉 Vacina próxima!',
      pushBody: 'Pode estar na hora de revisar a carteira vacinal do seu pet.',
      pushPreferredHour: '09:00',
      pushRepeatLimit: 3,
      registerDestination: 'health/vaccines',
      historyDestination: 'open-history',
      showOnAppOpen: true,
      primary: {
        label: 'Registrar dose',
        destination: 'health/vaccines',
        allowContextualPurchase: false,
      },
      secondary: {
        label: 'Ver histórico',
        destination: 'open-history',
      },
    }),
    emergency: base({
      label: 'Emergência',
      description: 'Eventos críticos e orientações imediatas.',
      icon: '🚨',
      domainType: 'event',
      severity: 'critical',
      priority: 100,
      cooldown_hours: 1,
      persistence: 'critical',
      commercialFocus: 'none',
      primaryCtaLabel: 'Ver emergência',
      secondaryCtaLabel: 'Ver histórico',
      showOnAppOpen: true,
      pushEnabled: true,
      pushTitle: '🚨 Atenção urgente!',
      pushBody: 'Há uma situação crítica que requer atenção imediata do seu pet.',
      pushPreferredHour: '00:00',
      pushRepeatLimit: 10,
      primary: {
        label: 'Ver orientações de emergência',
        destination: 'open-central',
        allowContextualPurchase: false,
      },
      secondary: {
        label: 'Ver histórico',
        destination: 'open-history',
      },
      allowRemindLater: false,
    }),
    documents: base({
      label: 'Documentos',
      description: 'Certidões, laudos e documentos obrigatórios.',
      icon: '📄',
      domainType: 'general',
      priority: 20,
      commercialFocus: 'none',
      primaryCtaLabel: 'Abrir documentos',
      secondaryCtaLabel: 'Ver histórico',
      primary: {
        label: 'Abrir documentos',
        destination: 'open-history',
        allowContextualPurchase: false,
      },
      secondary: {
        label: 'Ver histórico',
        destination: 'open-history',
      },
    }),
    shopping: base({
      label: 'Shopping',
      description: 'Conversões contextuais ligadas a cuidado.',
      icon: '🛒',
      domainType: 'general',
      priority: 40,
      commercialFocus: 'strong',
      primaryCtaLabel: 'Abrir shopping',
      secondaryCtaLabel: 'Ver central',
      primary: {
        label: 'Abrir shopping',
        destination: 'open-shopping',
        allowContextualPurchase: true,
      },
      secondary: {
        label: 'Ver central',
        destination: 'open-central',
      },
    }),
    medication: base({
      label: 'Medicação',
      description: 'Tratamentos contínuos e doses programadas.',
      icon: '💊',
      domainType: 'medication',
      severity: 'critical',
      priority: 85,
      commercialFocus: 'none',
      primaryCtaLabel: 'Registrar dose',
      secondaryCtaLabel: 'Editar tratamento',
      registerDestination: 'health/medication',
      editDestination: 'health/medication',
      pushEnabled: true,
      pushTitle: '💊 Dose pendente!',
      pushBody: 'Não esqueça a medicação do seu pet hoje.',
      pushPreferredHour: '08:00',
      pushRepeatLimit: 5,
      primary: {
        label: 'Registrar dose',
        destination: 'health/medication',
        allowContextualPurchase: false,
      },
      secondary: {
        label: 'Editar tratamento',
        destination: 'health/medication',
      },
    }),
    dewormer: base({
      label: 'Vermífugo',
      description: 'Protocolos de vermifugação e registro de aplicação.',
      icon: '🪱',
      domainType: 'parasite',
      priority: 70,
      commercialFocus: 'medium',
      primaryCtaLabel: 'Comprar vermífugo',
      secondaryCtaLabel: 'Registrar aplicação',
      purchaseDestination: 'health/parasites/dewormer',
      registerDestination: 'health/parasites/dewormer',
      pushEnabled: true,
      pushTitle: '🪱 Vermifugação chegando!',
      pushBody: 'Está na hora de vermifugar o seu pet. Garanta o produto.',
      pushPreferredHour: '09:00',
      pushRepeatLimit: 3,
      primary: {
        label: 'Comprar vermífugo',
        destination: 'health/parasites/dewormer',
        allowContextualPurchase: true,
      },
      secondary: {
        label: 'Registrar aplicação',
        destination: 'health/parasites/dewormer',
      },
    }),
    flea_tick: base({
      label: 'Antipulgas',
      description: 'Controle de pulgas e carrapatos.',
      icon: '🐜',
      domainType: 'parasite',
      priority: 75,
      commercialFocus: 'strong',
      primaryCtaLabel: 'Comprar antipulgas',
      secondaryCtaLabel: 'Marcar como aplicado',
      purchaseDestination: 'health/parasites/flea_tick',
      registerDestination: 'health/parasites/flea_tick',
      pushEnabled: true,
      pushTitle: '🐜 Antipulgas vencendo!',
      pushBody: 'Seu pet precisa da próxima dose de antipulgas. Compre agora.',
      pushPreferredHour: '09:00',
      pushRepeatLimit: 4,
      primary: {
        label: 'Comprar antipulgas',
        destination: 'health/parasites/flea_tick',
        allowContextualPurchase: true,
      },
      secondary: {
        label: 'Marcar como aplicado',
        destination: 'health/parasites/flea_tick',
      },
    }),
    collar: base({
      label: 'Coleira',
      description: 'Troca e acompanhamento de coleiras antiparasitárias.',
      icon: '📿',
      domainType: 'parasite',
      priority: 65,
      commercialFocus: 'medium',
      primaryCtaLabel: 'Comprar coleira',
      secondaryCtaLabel: 'Troquei hoje',
      pushEnabled: true,
      pushTitle: '📿 Trocar coleira!',
      pushBody: 'A coleira antiparasitária do seu pet precisa ser renovada.',
      pushPreferredHour: '09:00',
      pushRepeatLimit: 3,
      primary: {
        label: 'Comprar coleira',
        destination: 'health/parasites/collar',
        allowContextualPurchase: true,
      },
      secondary: {
        label: 'Troquei hoje',
        destination: 'health/parasites/collar',
      },
    }),
    food: base({
      label: 'Alimentação',
      description: 'Estoque, reabastecimento e ajuste de rotina alimentar.',
      icon: '🍖',
      domainType: 'food',
      severity: 'info',
      priority: 60,
      commercialFocus: 'strong',
      primaryCtaLabel: 'Comprar ração',
      secondaryCtaLabel: 'Ajustar estoque',
      purchaseDestination: 'health/food',
      editDestination: 'health/food',
      pushEnabled: true,
      pushTitle: '🍖 Estoque acabando!',
      pushBody: 'Está na hora de repor a ração do seu pet. Garanta a entrega.',
      pushPreferredHour: '10:00',
      pushRepeatLimit: 4,
      primary: {
        label: 'Comprar ração',
        destination: 'health/food',
        allowContextualPurchase: true,
      },
      secondary: {
        label: 'Ajustar estoque',
        destination: 'health/food',
      },
    }),
    grooming: base({
      label: 'Banho e tosa',
      description: 'Higiene, tosa e rotina estética.',
      icon: '🧼',
      domainType: 'grooming',
      priority: 35,
      commercialFocus: 'soft',
      primaryCtaLabel: 'Abrir grooming',
      secondaryCtaLabel: 'Ver histórico',
      severity: 'info',
      primary: {
        label: 'Abrir grooming',
        destination: 'health/grooming',
        allowContextualPurchase: false,
      },
      secondary: {
        label: 'Ver histórico',
        destination: 'open-history',
      },
    }),
  };
}

function mergeCarePolicy(base: CareInteractionPolicy, partial?: Partial<CareInteractionPolicy>): CareInteractionPolicy {
  if (!partial) return base;

  return {
    ...base,
    ...partial,
    primary: {
      ...base.primary,
      ...(partial.primary ?? {}),
    },
    secondary: partial.secondary
      ? {
          ...(base.secondary ?? { label: 'Ação secundária', destination: 'none' }),
          ...partial.secondary,
        }
      : base.secondary,
  };
}

function keyForScope(scopeId: string): string {
  return `${INTERACTION_PREFERENCES_KEY}:${scopeId}`;
}

export function loadTutorInteractionPreferences(scopeId: string): InteractionPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_INTERACTION_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(keyForScope(scopeId));
    if (!raw) {
      return DEFAULT_INTERACTION_PREFERENCES;
    }

    const parsed = JSON.parse(raw) as Partial<InteractionPreferences>;
    return {
      ...DEFAULT_INTERACTION_PREFERENCES,
      ...parsed,
      categories: {
        ...DEFAULT_INTERACTION_PREFERENCES.categories,
        ...(parsed.categories ?? {}),
      },
    };
  } catch {
    return DEFAULT_INTERACTION_PREFERENCES;
  }
}

export function saveTutorInteractionPreferences(scopeId: string, preferences: InteractionPreferences): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(keyForScope(scopeId), JSON.stringify(preferences));
}

export function loadMasterInteractionRules(): MasterInteractionRules {
  if (typeof window === 'undefined') {
    return DEFAULT_MASTER_INTERACTION_RULES;
  }

  try {
    const raw = window.localStorage.getItem(MASTER_RULES_KEY);
    if (!raw) {
      return DEFAULT_MASTER_INTERACTION_RULES;
    }

    const parsed = JSON.parse(raw) as Partial<MasterInteractionRules>;
    return {
      ...DEFAULT_MASTER_INTERACTION_RULES,
      ...parsed,
      categories: {
        ...DEFAULT_MASTER_INTERACTION_RULES.categories,
        ...(parsed.categories ?? {}),
      },
      canBeSilenced: {
        ...DEFAULT_MASTER_INTERACTION_RULES.canBeSilenced,
        ...(parsed.canBeSilenced ?? {}),
      },
      externalChannels: {
        ...DEFAULT_MASTER_INTERACTION_RULES.externalChannels,
        ...(parsed.externalChannels ?? {}),
        browserNotifications: {
          ...DEFAULT_MASTER_INTERACTION_RULES.externalChannels.browserNotifications,
          ...(parsed.externalChannels?.browserNotifications ?? {}),
        },
        pushNotifications: {
          ...DEFAULT_MASTER_INTERACTION_RULES.externalChannels.pushNotifications,
          ...(parsed.externalChannels?.pushNotifications ?? {}),
        },
      },
      globalPolicy: {
        ...DEFAULT_MASTER_INTERACTION_RULES.globalPolicy,
        ...(parsed.globalPolicy ?? {}),
        quietHours: {
          ...DEFAULT_MASTER_INTERACTION_RULES.globalPolicy.quietHours,
          ...(parsed.globalPolicy?.quietHours ?? {}),
        },
      },
      channels: {
        ...DEFAULT_MASTER_INTERACTION_RULES.channels,
        ...(parsed.channels ?? {}),
        internalCenter: {
          ...DEFAULT_MASTER_INTERACTION_RULES.channels.internalCenter,
          ...(parsed.channels?.internalCenter ?? {}),
        },
        homePanel: {
          ...DEFAULT_MASTER_INTERACTION_RULES.channels.homePanel,
          ...(parsed.channels?.homePanel ?? {}),
        },
        homeBadge: {
          ...DEFAULT_MASTER_INTERACTION_RULES.channels.homeBadge,
          ...(parsed.channels?.homeBadge ?? {}),
        },
      },
      multipet: {
        ...DEFAULT_MASTER_INTERACTION_RULES.multipet,
        ...(parsed.multipet ?? {}),
      },
      carePolicies: Object.fromEntries(
        Object.entries(DEFAULT_MASTER_INTERACTION_RULES.carePolicies).map(([careKey, basePolicy]) => [
          careKey,
          mergeCarePolicy(basePolicy, parsed.carePolicies?.[careKey]),
        ]),
      ),
    };
  } catch {
    return DEFAULT_MASTER_INTERACTION_RULES;
  }
}

export function getDefaultCarePolicy(careKey: string): CareInteractionPolicy | null {
  return DEFAULT_MASTER_INTERACTION_RULES.carePolicies[careKey] ?? null;
}

export function saveMasterInteractionRules(rules: MasterInteractionRules): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(MASTER_RULES_KEY, JSON.stringify(rules));
}

// Combina governança master + preferências do tutor em um contrato efetivo
// usado pelo motor de interações. O master sempre tem precedência.
// FUTURO (INATIVO): composição master + tutor.
// Mantido apenas como referência para fases futuras em que o tutor
// volte a ter alguma governança limitada. NÃO é usado no fluxo atual.
export function buildEffectiveInteractionPreferences(
  master: MasterInteractionRules,
  tutor: InteractionPreferences,
): InteractionPreferences {
  const allCategories = new Set<InteractionCategory>();
  Object.keys(master.categories).forEach((key) => allCategories.add(key as InteractionCategory));
  Object.keys(tutor.categories).forEach((key) => allCategories.add(key as InteractionCategory));

  const categories: Partial<Record<InteractionCategory, boolean>> = {};
  allCategories.forEach((category) => {
    const masterEnabled = master.categories[category] !== false;
    const tutorWantsEnabled = tutor.categories[category] !== false;
    const canBeSilenced = master.canBeSilenced[category] !== false;
    const effectiveEnabled = masterEnabled && (canBeSilenced ? tutorWantsEnabled : true);
    categories[category] = effectiveEnabled;
  });

  return {
    enabled: master.enabled && tutor.enabled,
    categories,
    advance_days: Math.min(master.advance_days, tutor.advance_days),
  };
}

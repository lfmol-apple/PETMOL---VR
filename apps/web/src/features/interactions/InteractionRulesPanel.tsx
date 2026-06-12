'use client';

import { useMasterInteractionRules } from './useMasterInteractionRules';
import { IosSwitch } from '@/components/ui/IosSwitch';

const categoryLabels = {
  vaccine: 'Vacinas',
  parasite: 'Antiparasitários',
  medication: 'Medicação',
  grooming: 'Banho e tosa',
  food: 'Alimentação',
  event: 'Eventos clínicos',
};

function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return <IosSwitch checked={on} onChange={onChange} size="sm" />;
}

interface InteractionRulesPanelProps {
  scopeId?: string;
}

export function InteractionRulesPanel({ scopeId }: InteractionRulesPanelProps) {
  // Governança MASTER (camada 1) — escopo global
  const { rules, updateRules } = useMasterInteractionRules();

  const toggleEnabled = () => {
    updateRules({
      ...rules,
      enabled: !rules.enabled,
    });
  };

  const toggleCategory = (category: keyof typeof categoryLabels) => {
    updateRules({
      ...rules,
      categories: {
        ...rules.categories,
        [category]: rules.categories[category] === false,
      },
    });
  };

  const toggleCanBeSilenced = (category: keyof typeof categoryLabels) => {
    updateRules({
      ...rules,
      canBeSilenced: {
        ...rules.canBeSilenced,
        [category]: rules.canBeSilenced[category] === false,
      },
    });
  };

  const setAdvanceDays = (advanceDays: number) => {
    updateRules({
      ...rules,
      advance_days: advanceDays,
    });
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Governança master de interações</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Define, em nível de sistema, quais domínios podem gerar interações e se canais externos podem ser usados.
          </p>
        </div>
        <Switch on={rules.enabled} onChange={toggleEnabled} />
      </div>

      <div className="space-y-2">
        <div className="rounded-xl bg-white px-3 py-2.5 border border-gray-200">
          <label className="block text-xs font-medium text-gray-500 mb-1">Antecedência para avisos futuros</label>
          <select
            value={rules.advance_days}
            onChange={(event) => setAdvanceDays(Number(event.target.value))}
            className="w-full rounded-lg bg-gray-100 px-2 py-2 text-sm outline-none"
          >
            {[0, 1, 3, 7, 14, 30].map((days) => (
              <option key={days} value={days}>
                {days === 0 ? 'Somente hoje/atrasados' : `${days} dia${days > 1 ? 's' : ''}`}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl bg-white border border-gray-200 divide-y divide-gray-100">
          {Object.entries(categoryLabels).map(([category, label]) => {
            const enabled = rules.categories[category as keyof typeof categoryLabels] !== false;
            const canBeSilenced = rules.canBeSilenced[category as keyof typeof categoryLabels] !== false;
            return (
              <div key={category} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-gray-800">{label}</p>
                  <p className="text-xs text-gray-500">Permite que este domínio gere interações automáticas.</p>
                  <p className="text-[11px] text-gray-500">
                    Tutor {canBeSilenced ? 'PODE' : 'NÃO PODE'} silenciar este domínio.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[11px] text-gray-500">Domínio ativo</span>
                    <Switch
                      on={enabled}
                      onChange={() => toggleCategory(category as keyof typeof categoryLabels)}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[11px] text-gray-500">Tutor pode silenciar</span>
                    <Switch
                      on={canBeSilenced}
                      onChange={() => toggleCanBeSilenced(category as keyof typeof categoryLabels)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl bg-white border border-gray-200 px-3 py-2.5">
          <p className="text-xs font-medium text-gray-500 mb-1">Canais externos (browser)</p>
          <p className="text-xs text-gray-500 mb-2">
            Browser notifications ficam DESLIGADAS por padrão. Só podem ser ativadas aqui, pela camada master.
          </p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-800">Browser notifications</span>
            <Switch
              on={rules.externalChannels.browserNotifications.active}
              onChange={() => updateRules({
                ...rules,
                externalChannels: {
                  ...rules.externalChannels,
                  browserNotifications: {
                    ...rules.externalChannels.browserNotifications,
                    active: !rules.externalChannels.browserNotifications.active,
                  },
                },
              })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
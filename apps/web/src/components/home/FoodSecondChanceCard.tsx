'use client';

/**
 * Cartão discreto na Home: "Falta só a ração de {pet}". Reaparece no máximo 3 vezes, com 7 dias de
 * pausa, para quem escolheu "depois" no cadastro. Não bloqueia nada; "Agora não" começa a pausa.
 */
import { useEffect, useState } from 'react';
import { trackV1Metric } from '@/lib/v1Metrics';
import {
  readSecondChance, recordSecondChance, shouldShowSecondChance,
} from './foodSecondChance';

interface Props {
  petId: string;
  petName: string;
  hasFoodData: boolean;
  onboardingFood: 'later' | 'na' | undefined;
  onRegister: () => void;
  /** chamado depois de usar ou dispensar — a Home recalcula e libera o próximo pedido (avisos) */
  onResolved?: () => void;
}

export function FoodSecondChanceCard({ petId, petName, hasFoodData, onboardingFood, onRegister, onResolved }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = shouldShowSecondChance({ hasFoodData, onboardingFood, state: readSecondChance(petId) });
    setVisible(show);
    if (show) trackV1Metric('food_second_chance_shown', { pet_id: petId });
  }, [petId, hasFoodData, onboardingFood]);

  if (!visible) return null;
  const name = petName || 'seu pet';

  return (
    <div className="mx-1.5 mb-2 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm min-[390px]:mx-2.5 sm:mx-4" data-testid="food-second-chance">
      <p className="text-[15px] font-extrabold leading-snug text-slate-900">Falta só a ração de {name}</p>
      <p className="mt-1 text-[13px] leading-snug text-slate-600">
        Cadastre em 1 minuto e o PETMOL avisa antes de acabar. Sem isso, não consigo lembrar você.
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button"
          onClick={() => {
            trackV1Metric('food_second_chance_click', { pet_id: petId });
            recordSecondChance(petId);
            setVisible(false);
            onRegister();
            onResolved?.();
          }}
          className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-[14px] font-extrabold text-white active:scale-[0.98]">
          Cadastrar a ração
        </button>
        <button type="button"
          onClick={() => {
            trackV1Metric('food_second_chance_dismiss', { pet_id: petId });
            recordSecondChance(petId);
            setVisible(false);
            onResolved?.();
          }}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] font-bold text-slate-500 active:bg-slate-50">
          Agora não
        </button>
      </div>
    </div>
  );
}

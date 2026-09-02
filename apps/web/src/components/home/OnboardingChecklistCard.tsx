'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, PawPrint, Utensils, Syringe, Bug, Pill, ArrowLeft } from 'lucide-react';
import { petDo } from '@/lib/petGender';
import { trackV1Metric, type V1MetricEvent } from '@/lib/v1Metrics';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';
import { SheetAvatar, SheetHeader, SheetShell } from '@/components/ui/sheet';
import {
  deriveOnboardingProgress,
  setOnboardingActiveFlag,
  shouldShowOnboardingCard,
  writeOnboardingStore,
  type OnboardingStepKey,
} from '@/lib/onboardingProgress';

interface OnboardingChecklistCardProps {
  petId: string;
  petName: string;
  petSex?: 'male' | 'female' | null;
  petPhotoSrc?: string;
  hasPet: boolean;
  vaccinesCount: number;
  parasiteControls: { type: string }[];
  feedingPlan: FeedingPlanEntry | null | undefined;
  onOpenFood: () => void;
  onOpenVaccines: () => void;
  onOpenFlea: () => void;
  onOpenDewormer: () => void;
  /** enquanto um sheet-alvo (alimentação/vacina/…) está aberto, o checklist
   *  se recolhe pra não cobrir esse sheet — reaparece já com o progresso
   *  atualizado quando ele fecha. */
  suppressed?: boolean;
}

type ActionKey = Exclude<OnboardingStepKey, 'profile'>;

const COMPLETION_EVENT: Record<ActionKey, V1MetricEvent> = {
  food: 'onboarding_food_completed',
  vaccine: 'onboarding_vaccine_completed',
  flea: 'onboarding_parasite_completed',
  dewormer: 'onboarding_dewormer_completed',
};

const FoodIcon = Utensils;

const STEP_ICON: Record<OnboardingStepKey, typeof PawPrint> = {
  profile: PawPrint,
  food: FoodIcon,
  vaccine: Syringe,
  flea: Bug,
  dewormer: Pill,
};

interface RowConfig {
  key: OnboardingStepKey;
  label: string;
  why: string;
  open?: () => void;
  skipChoices?: { value: string; label: string }[];
}

export function OnboardingChecklistCard({
  petId,
  petName,
  petSex,
  petPhotoSrc,
  hasPet,
  vaccinesCount,
  parasiteControls,
  feedingPlan,
  onOpenFood,
  onOpenVaccines,
  onOpenFlea,
  onOpenDewormer,
  suppressed = false,
}: OnboardingChecklistCardProps) {
  const [expandedSkip, setExpandedSkip] = useState<ActionKey | null>(null);
  const [storeTick, setStoreTick] = useState(0);

  const progress = useMemo(
    () =>
      deriveOnboardingProgress({
        petId,
        hasPet,
        vaccinesCount,
        parasiteTypes: parasiteControls.map((p) => p.type),
        feedingPlan,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [petId, hasPet, vaccinesCount, parasiteControls, feedingPlan, storeTick],
  );

  const name = petName || 'seu pet';
  const artigo = petDo({ sex: petSex });

  const showChecklist = shouldShowOnboardingCard(progress);
  const showCompletion =
    progress.allResolved && !progress.completedShownAt && !!progress.startedAt && hasPet;

  useEffect(() => {
    if (!hasPet || (!showChecklist && !showCompletion)) return;
    if (!progress.startedAt) {
      writeOnboardingStore(petId, { startedAt: new Date().toISOString() });
      trackV1Metric('onboarding_started', { pet_id: petId });
    }
    setOnboardingActiveFlag(true);
    return () => setOnboardingActiveFlag(false);
  }, [hasPet, petId, progress.startedAt, showChecklist, showCompletion]);

  const prevDoneRef = useRef<Record<string, boolean> | null>(null);
  useEffect(() => {
    const current: Record<string, boolean> = {};
    for (const s of progress.steps) current[s.key] = s.done;

    const prev = prevDoneRef.current;
    if (prev) {
      for (const s of progress.steps) {
        if (s.key === 'profile') continue;
        if (!prev[s.key] && s.done) {
          trackV1Metric(COMPLETION_EVENT[s.key as ActionKey], { pet_id: petId, from_data: s.fromData });
        }
      }
      const wasAllDone = progress.steps.every((s) => prev[s.key]);
      if (!wasAllDone && progress.allResolved) {
        trackV1Metric('onboarding_completed', { pet_id: petId, source: 'home_checklist' });
      }
    }
    prevDoneRef.current = current;
  }, [progress, petId]);

  if (!showChecklist && !showCompletion) return null;

  // ── conclusão ─────────────────────────────────────────────────────────────
  if (showCompletion) {
    const finish = () => {
      writeOnboardingStore(petId, { completedShownAt: new Date().toISOString() });
      setOnboardingActiveFlag(false);
      setStoreTick((t) => t + 1);
    };
    return (
      <SheetShell open={!suppressed} onClose={finish} tone="grey" variant="center" size="sm" z={70} hideHandle>
        <SheetHeader
          tone="petmol"
          wrapTitle
          title={`Tudo pronto para cuidar ${artigo} ${name} 💙`}
          subtitle="Configuração inicial concluída"
          media={<SheetAvatar src={petPhotoSrc} alt="" fallback={<PawPrint className="h-5 w-5 text-[#0056D2]" strokeWidth={2.2} />} />}
          onClose={finish}
        />
        <SheetShell.Body className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <Check className="h-8 w-8" strokeWidth={2.6} />
          </div>
          <h2 className="mt-4 text-[17px] font-bold leading-tight tracking-[-0.01em] text-slate-900">
            O Petmol já acompanha tudo que importa
          </h2>
          <p className="mt-1.5 text-[13.5px] text-slate-500">O Petmol já consegue acompanhar:</p>
          <ul className="mx-auto mt-4 grid max-w-[240px] grid-cols-1 gap-2 text-left text-[14px] font-semibold text-slate-700">
            {[
              { icon: FoodIcon, label: 'Alimentação' },
              { icon: Syringe, label: 'Vacinas' },
              { icon: Bug, label: 'Pulgas e carrapatos' },
              { icon: Pill, label: 'Vermífugo' },
              { icon: ChevronRight, label: 'Próximas compras' },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-black/5">
                  <Icon className="h-4 w-4" strokeWidth={2.2} />
                </span>
                {label}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={finish}
            className="mt-6 w-full rounded-2xl bg-[#0056D2] py-3.5 text-[15px] font-bold text-white shadow-[0_10px_24px_-8px_rgba(0,86,210,0.5)] transition-transform active:scale-[0.98]"
          >
            Ir para o Petmol
          </button>
        </SheetShell.Body>
      </SheetShell>
    );
  }

  // ── checklist ─────────────────────────────────────────────────────────────
  const rows: RowConfig[] = [
    { key: 'profile', label: `Perfil ${artigo} ${name}`, why: '' },
    {
      key: 'food',
      label: 'Alimentação',
      why: `O que ${name} come hoje? Assim o Petmol estima quando a ração vai acabar e facilita a próxima compra.`,
      open: onOpenFood,
      skipChoices: [
        { value: 'later', label: 'Depois' },
        { value: 'na', label: 'Não uso ração de saco' },
      ],
    },
    {
      key: 'vaccine',
      label: 'Vacinas',
      why: `Quando foi a última vacina ${artigo} ${name}? Isso ajuda a organizar os próximos cuidados.`,
      open: onOpenVaccines,
      skipChoices: [
        { value: 'later', label: 'Agora não' },
        { value: 'unknown', label: 'Não sei o histórico' },
      ],
    },
    {
      key: 'flea',
      label: 'Pulgas e carrapatos',
      why: `${name} usa proteção contra pulgas e carrapatos? Se usar, o Petmol lembra da reaplicação.`,
      open: onOpenFlea,
      skipChoices: [
        { value: 'later', label: 'Agora não' },
        { value: 'none', label: 'Não uso' },
        { value: 'unknown', label: 'Não sei' },
      ],
    },
    {
      key: 'dewormer',
      label: 'Vermífugo',
      why: `${name} toma vermífugo? Se tomar, o Petmol lembra da próxima dose.`,
      open: onOpenDewormer,
      skipChoices: [
        { value: 'later', label: 'Agora não' },
        { value: 'none', label: 'Não uso' },
        { value: 'unknown', label: 'Não sei' },
      ],
    },
  ];

  const doneByKey = Object.fromEntries(progress.steps.map((s) => [s.key, s.done])) as Record<OnboardingStepKey, boolean>;

  const handleSkip = (key: ActionKey, value: string) => {
    writeOnboardingStore(petId, { [key]: value });
    trackV1Metric('onboarding_skipped', { pet_id: petId, step: key, reason: value });
    setExpandedSkip(null);
    setStoreTick((t) => t + 1);
  };

  const dismissCard = () => {
    writeOnboardingStore(petId, { dismissed: true });
    trackV1Metric('onboarding_skipped', {
      pet_id: petId,
      reason: 'dismissed',
      pending: progress.total - progress.doneCount,
    });
    setOnboardingActiveFlag(false);
    setStoreTick((t) => t + 1);
  };

  const remaining = progress.total - progress.doneCount;
  const pct = Math.round((progress.doneCount / progress.total) * 100);

  return (
    <SheetShell open={!suppressed} onClose={dismissCard} tone="grey" variant="center" size="sm" z={70} hideHandle>
      <SheetHeader
        tone="petmol"
        wrapTitle
        title={
          progress.doneCount > 1
            ? `Continue os cuidados ${artigo} ${name}`
            : `Vamos preparar os cuidados ${artigo} ${name}`
        }
        subtitle={`Configuração inicial · ${progress.doneCount} de ${progress.total}`}
        media={<SheetAvatar src={petPhotoSrc} alt="" fallback={<PawPrint className="h-5 w-5 text-[#0056D2]" strokeWidth={2.2} />} />}
        onClose={dismissCard}
      />

      <SheetShell.Body className="pt-4">
        {/* progresso */}
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#0056D2] to-blue-400 transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="flex-shrink-0 text-[11px] font-bold tabular-nums text-slate-500">
            {progress.doneCount}/{progress.total}
          </span>
        </div>

        {/* itens */}
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const done = doneByKey[row.key];
            const isProfile = row.key === 'profile';
            const actionKey = row.key as ActionKey;
            const expanded = expandedSkip === actionKey;
            const StepIcon = STEP_ICON[row.key];
            const openable = !done && !isProfile;

            return (
              <li
                key={row.key}
                className={`overflow-hidden rounded-2xl bg-white ring-1 transition-shadow ${
                  done ? 'ring-black/[0.04]' : 'shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-black/[0.06]'
                }`}
              >
                <div className="flex items-center gap-3 px-3 py-3">
                  <span
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${
                      done
                        ? 'bg-emerald-500 text-white'
                        : isProfile
                          ? 'bg-slate-100 text-slate-400'
                          : 'bg-blue-50 text-[#0056D2]'
                    }`}
                    aria-hidden
                  >
                    {done ? <Check className="h-[17px] w-[17px]" strokeWidth={2.8} /> : <StepIcon className="h-[16px] w-[16px]" strokeWidth={2.2} />}
                  </span>

                  {openable ? (
                    <button type="button" onClick={row.open} className="flex-1 text-left text-[14.5px] font-bold text-slate-900">
                      {row.label}
                    </button>
                  ) : (
                    <span className={`flex-1 text-[14.5px] font-bold ${done ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-900'}`}>
                      {row.label}
                    </span>
                  )}

                  {openable && (
                    <button
                      type="button"
                      onClick={row.open}
                      className="flex flex-shrink-0 items-center gap-1 rounded-full bg-[#0056D2] px-3.5 py-1.5 text-[12px] font-bold text-white shadow-[0_6px_14px_-6px_rgba(0,86,210,0.6)] transition-transform active:scale-95"
                    >
                      Abrir
                      <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.6} />
                    </button>
                  )}
                </div>

                {openable && (
                  <div className="px-3 pb-3 pl-[52px]">
                    <p className="text-[12.5px] leading-snug text-slate-500">{row.why}</p>
                    {!expanded ? (
                      <button
                        type="button"
                        onClick={() => setExpandedSkip(actionKey)}
                        className="mt-1.5 text-[12px] font-semibold text-slate-400 underline decoration-slate-300 underline-offset-2 active:text-slate-600"
                      >
                        Agora não
                      </button>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {row.skipChoices?.map((choice) => (
                          <button
                            key={choice.value}
                            type="button"
                            onClick={() => handleSkip(actionKey, choice.value)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 active:bg-slate-50"
                          >
                            {choice.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setExpandedSkip(null)}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-slate-400"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.4} />
                          Voltar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-center text-[11.5px] text-slate-400">
          {remaining === 1 ? 'Falta 1 item — dá pra terminar depois na Home.' : `Faltam ${remaining} itens — dá pra terminar depois na Home.`}
        </p>
      </SheetShell.Body>
    </SheetShell>
  );
}

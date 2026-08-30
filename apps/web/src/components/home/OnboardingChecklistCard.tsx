'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { petDo } from '@/lib/petGender';
import { trackV1Metric, type V1MetricEvent } from '@/lib/v1Metrics';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';
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
  hasPet: boolean;
  vaccinesCount: number;
  parasiteControls: { type: string }[];
  feedingPlan: FeedingPlanEntry | null | undefined;
  onOpenFood: () => void;
  onOpenVaccines: () => void;
  onOpenFlea: () => void;
  onOpenDewormer: () => void;
}

type ActionKey = Exclude<OnboardingStepKey, 'profile'>;

const COMPLETION_EVENT: Record<ActionKey, V1MetricEvent> = {
  food: 'onboarding_food_completed',
  vaccine: 'onboarding_vaccine_completed',
  flea: 'onboarding_parasite_completed',
  dewormer: 'onboarding_dewormer_completed',
};

interface RowConfig {
  key: OnboardingStepKey;
  label: string;
  why: string;
  open?: () => void;
  /** opções de "agora não" — value grava no store */
  skipChoices?: { value: string; label: string }[];
}

export function OnboardingChecklistCard({
  petId,
  petName,
  petSex,
  hasPet,
  vaccinesCount,
  parasiteControls,
  feedingPlan,
  onOpenFood,
  onOpenVaccines,
  onOpenFlea,
  onOpenDewormer,
}: OnboardingChecklistCardProps) {
  const [expandedSkip, setExpandedSkip] = useState<ActionKey | null>(null);
  // força re-derivação após gravar "agora não" (o store não é reativo)
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
    // storeTick entra de propósito para re-ler o localStorage após writes locais
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [petId, hasPet, vaccinesCount, parasiteControls, feedingPlan, storeTick],
  );

  const name = petName || 'seu pet';
  const artigo = petDo({ sex: petSex });

  const showChecklist = shouldShowOnboardingCard(progress);
  // Só mostra a tela de conclusão para quem de fato passou pelo checklist
  // (startedAt gravado). Veterano com dados completos que nunca viu o card
  // não recebe um "tudo pronto" do nada.
  const showCompletion =
    progress.allResolved && !progress.completedShownAt && !!progress.startedAt && hasPet;

  // ── onboarding_started + flag global (uma vez por pet) ──────────────────────
  useEffect(() => {
    if (!hasPet || (!showChecklist && !showCompletion)) return;
    if (!progress.startedAt) {
      writeOnboardingStore(petId, { startedAt: new Date().toISOString() });
      trackV1Metric('onboarding_started', { pet_id: petId });
    }
    setOnboardingActiveFlag(true);
    return () => setOnboardingActiveFlag(false);
  }, [hasPet, petId, progress.startedAt, showChecklist, showCompletion]);

  // ── eventos de conclusão por passo (só transições reais, pós-montagem) ─────
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
      <div className="rounded-3xl border border-blue-200 bg-gradient-to-b from-blue-50 to-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[17px] font-black text-slate-900 leading-tight">
              Tudo pronto para cuidar {artigo} {name} 💙
            </p>
            <p className="mt-1 text-[13px] text-slate-500">O PETMOL agora consegue acompanhar:</p>
          </div>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-1.5 text-[13px] font-semibold text-slate-700">
          <li>🥣 alimentação</li>
          <li>💉 vacinas</li>
          <li>🛡️ pulgas e carrapatos</li>
          <li>💊 vermífugo</li>
          <li>🛒 próximas compras</li>
        </ul>
        <button
          type="button"
          onClick={finish}
          className="mt-4 w-full rounded-2xl bg-[#0056D2] py-3.5 text-sm font-black text-white shadow-md shadow-blue-600/20 active:scale-[0.98] transition-transform"
        >
          Ir para o PETMOL
        </button>
      </div>
    );
  }

  // ── checklist ─────────────────────────────────────────────────────────────
  const rows: RowConfig[] = [
    {
      key: 'profile',
      label: `Perfil ${artigo} ${name}`,
      why: '',
    },
    {
      key: 'food',
      label: 'Alimentação',
      why: `O que ${name} come hoje? Assim o PETMOL estima quando a ração vai acabar e facilita a próxima compra.`,
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
      why: `${name} usa proteção contra pulgas e carrapatos? Se usar, o PETMOL lembra da reaplicação.`,
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
      why: `${name} toma vermífugo? Se tomar, o PETMOL lembra da próxima dose.`,
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

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Configuração inicial</p>
          <p className="mt-1 text-[16px] font-black leading-tight text-slate-900">
            {progress.doneCount > 1 ? `Continue preparando ${artigo} ${name}` : `Vamos deixar ${artigo} ${name} pronto`}
          </p>
        </div>
        <button
          type="button"
          onClick={dismissCard}
          aria-label="Fechar configuração"
          className="-mr-1 -mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100 active:text-slate-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* progresso */}
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[#0056D2] transition-[width] duration-500"
            style={{ width: `${(progress.doneCount / progress.total) * 100}%` }}
          />
        </div>
        <span className="flex-shrink-0 text-[11px] font-black text-slate-500">
          {progress.doneCount} de {progress.total}
        </span>
      </div>

      {/* itens */}
      <ul className="mt-3 space-y-1">
        {rows.map((row) => {
          const done = doneByKey[row.key];
          const isProfile = row.key === 'profile';
          const actionKey = row.key as ActionKey;
          const expanded = expandedSkip === actionKey;

          return (
            <li key={row.key} className="rounded-2xl">
              <div
                className={`flex items-center gap-3 rounded-2xl px-2.5 py-2.5 ${
                  !done && !isProfile ? 'active:bg-slate-50' : ''
                }`}
              >
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-black ${
                    done ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300 text-transparent'
                  }`}
                  aria-hidden
                >
                  ✓
                </span>

                {done || isProfile ? (
                  <span className={`flex-1 text-[14px] font-bold ${done ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}>
                    {row.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={row.open}
                    className="flex-1 text-left text-[14px] font-bold text-slate-900"
                  >
                    {row.label}
                  </button>
                )}

                {!done && !isProfile && (
                  <button
                    type="button"
                    onClick={row.open}
                    className="flex-shrink-0 rounded-full bg-blue-50 px-3 py-1.5 text-[12px] font-black text-[#0056D2] active:scale-95 transition-transform"
                  >
                    Abrir
                  </button>
                )}
              </div>

              {!done && !isProfile && (
                <div className="pl-11 pr-2.5 pb-1.5">
                  <p className="text-[12px] leading-snug text-slate-400">{row.why}</p>
                  {!expanded ? (
                    <button
                      type="button"
                      onClick={() => setExpandedSkip(actionKey)}
                      className="mt-1 text-[12px] font-bold text-slate-400 active:text-slate-600"
                    >
                      Agora não
                    </button>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {row.skipChoices?.map((choice) => (
                        <button
                          key={choice.value}
                          type="button"
                          onClick={() => handleSkip(actionKey, choice.value)}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-600 active:bg-slate-50"
                        >
                          {choice.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setExpandedSkip(null)}
                        className="rounded-full px-2 py-1 text-[12px] font-semibold text-slate-400"
                      >
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

      <p className="mt-2 px-2.5 text-[11px] text-slate-400">
        {remaining === 1 ? 'Falta 1 item — dá pra fazer depois na Home.' : `Faltam ${remaining} itens — você pode completar depois na Home.`}
      </p>
    </div>
  );
}

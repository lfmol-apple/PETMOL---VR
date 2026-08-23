'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { petDo } from '@/lib/petGender';
import { type HomeInactiveEligibleControlId } from '@/lib/homeControlPreferences';

// ── Props H1 logic preserved ──────────────────────────────────────────────────
interface AppleControlButtonsProps {
  onHealthClick: () => void;
  onVaccinesClick: () => void;
  petName?: string;
  petSex?: 'male' | 'female' | null;
  onAlimentacaoClick?: () => void;
  onBanhoTosaClick?: () => void;
  onMedicacaoClick?: () => void;
  onPetSumidoClick?: () => void;
  onFamilyClick?: () => void;
  onShoppingClick?: () => void;
  hasFoodData?: boolean;
  foodTitle?: string;
  foodHeadline?: string;
  foodSubline?: string;

  // Card de Vacina — substituiu a antiga "Caderneta" (cofre de documentos).
  // Mesmo peso visual/posição que ela tinha; conteúdo agora é lembrete de
  // ciclo, não cofre.
  vaccineHeadline?: string;
  vaccineSubline?: string;

  // Card de Saúde — headline/subline dinâmicos: mostram o item de maior
  // gravidade real vencendo (leishmaniose > antiparasitário > vermífugo >
  // remédio > banho), calculado fora deste componente. Sem valor, cai no
  // texto estático de sempre.
  healthHeadline?: string;
  healthSubline?: string;

  // Alert overrides from engine H1
  alertHealth?: boolean;
  alertGrooming?: boolean;
  alertFood?: boolean;
  alertMedicacao?: boolean;
  alertShopping?: boolean;
  alertVaccines?: boolean;

  colorHealth?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorGrooming?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorFood?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorMedicacao?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorVaccines?: 'neutral' | 'ok' | 'warning' | 'critical';

  inactiveControls?: HomeInactiveEligibleControlId[];
  onDeactivateControl?: (controlId: HomeInactiveEligibleControlId) => void;
}

type ControlTone = 'neutral' | 'ok' | 'warning' | 'critical';

function shouldShowAlert(tone?: ControlTone, fallbackAlert?: boolean) {
  if (tone) return tone === 'warning' || tone === 'critical';
  return fallbackAlert === true;
}

function AlertDot({ tone = 'critical' }: { tone?: ControlTone }) {
  if (tone === 'warning') {
    return (
      <span className="absolute left-2.5 top-2.5 z-10 h-2 w-2 animate-pulse rounded-full bg-amber-400 ring-2 ring-amber-300/60 ring-offset-1" />
    );
  }
  return (
    <span className="absolute left-2.5 top-2.5 z-10 h-2 w-2 animate-pulse rounded-full bg-rose-500 ring-2 ring-rose-400/60 ring-offset-1" />
  );
}

export function AppleControlButtons({
  onHealthClick,
  onVaccinesClick,
  petName,
  petSex,
  onAlimentacaoClick,
  onPetSumidoClick,
  onShoppingClick,
  hasFoodData,
  foodTitle,
  foodHeadline,
  foodSubline,
  vaccineHeadline,
  vaccineSubline,
  healthHeadline,
  healthSubline,
  alertHealth,
  alertFood,
  alertVaccines,
  colorHealth,
  colorFood,
  colorVaccines,
}: AppleControlButtonsProps) {
  const { t } = useI18n();
  const [showEmergencyChoice, setShowEmergencyChoice] = useState(false);
  const shoppingTitle = petName ? `Loja ${petDo({ sex: petSex })} ${petName}` : t('home.shopping.title');

  return (
    <>
      {/* Grid 2×2: Alimentação | Saúde | Vacina | Shopping */}
      <div className="relative">
        <div className="grid grid-cols-2 gap-2 min-[390px]:gap-2.5">

          {/* 1. ALIMENTAÇÃO */}
          <button
            type="button"
            onClick={onAlimentacaoClick}
            className="group relative min-h-[68px] overflow-hidden rounded-xl border border-amber-400 bg-gradient-to-br from-amber-100 via-yellow-100 to-orange-200 p-2.5 shadow-sm shadow-amber-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95 min-[390px]:min-h-[76px] min-[390px]:rounded-2xl min-[390px]:p-3"
          >
            {(!hasFoodData || shouldShowAlert(colorFood, alertFood)) && (
              <AlertDot tone={!hasFoodData ? 'critical' : colorFood} />
            )}
            <span className="absolute right-1 top-1 opacity-95 pointer-events-none transition-transform group-hover:scale-105 min-[390px]:right-1.5 min-[390px]:top-1.5">
              <img
                src="/alimentacao-tigela.webp"
                alt=""
                className="h-10 w-10 object-contain min-[390px]:h-12 min-[390px]:w-12"
              />
            </span>
            <div className="flex h-full flex-col justify-center pr-6 pt-2 text-left min-[390px]:pr-7 min-[390px]:pt-3">
              <h3 className="line-clamp-2 text-[12px] font-bold leading-tight text-amber-950 min-[390px]:text-[13px] sm:text-base">{foodTitle || t('home.food.title')}</h3>
              <p className={`mt-0.5 line-clamp-1 text-[9px] leading-[1.1] min-[390px]:line-clamp-2 min-[390px]:text-[10px] sm:text-xs ${!hasFoodData ? 'font-bold text-red-700' : 'text-amber-800/85'}`}>
                {!hasFoodData ? 'Cuidado em aberto' : (hasFoodData ? (foodHeadline || t('home.food.desc')) : (foodHeadline || 'Toque para cadastrar'))}
              </p>
              {foodSubline && hasFoodData && (
                <p className="mt-0.5 line-clamp-1 text-[9px] font-bold leading-[1.1] text-amber-900 min-[390px]:mt-1 min-[390px]:text-[10px] sm:text-xs">
                  {foodSubline}
                </p>
              )}
            </div>
          </button>

          {/* 2. SAÚDE */}
          <button
            type="button"
            onClick={onHealthClick}
            className="group relative min-h-[68px] overflow-hidden rounded-xl border border-indigo-400 bg-gradient-to-br from-indigo-100 via-violet-100 to-violet-200 p-2.5 shadow-sm shadow-indigo-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95 min-[390px]:min-h-[76px] min-[390px]:rounded-2xl min-[390px]:p-3"
          >
            {shouldShowAlert(colorHealth, alertHealth) && <AlertDot tone={colorHealth} />}
            <span className="absolute right-1 top-1.5 opacity-95 pointer-events-none transition-transform group-hover:scale-105 min-[390px]:right-1.5 min-[390px]:top-2">
              <img
                src="/cuidados-pets-banho.webp"
                alt=""
                className="h-8 w-14 object-contain min-[390px]:h-9 min-[390px]:w-16"
              />
            </span>
            <div className="flex h-full flex-col justify-center pr-6 pt-2 text-left min-[390px]:pr-7 min-[390px]:pt-3">
              <h3 className="truncate text-[13px] font-semibold leading-tight text-indigo-950 min-[390px]:text-[14px] sm:text-base">Cuidados</h3>
              <p className="mt-0.5 line-clamp-1 text-[9px] leading-[1.1] text-indigo-900/80 min-[390px]:line-clamp-2 min-[390px]:text-[10px] sm:text-xs">{healthHeadline || `Mantenha os cuidados ${petDo({ sex: petSex })} ${petName || 'seu pet'} em dia`}</p>
              {healthSubline && (
                <p className="mt-0.5 line-clamp-1 text-[9px] font-bold leading-[1.1] text-indigo-900 min-[390px]:mt-1 min-[390px]:text-[10px] sm:text-xs">
                  {healthSubline}
                </p>
              )}
            </div>
          </button>

          {/* 3. VACINA — substituiu a antiga Caderneta (cofre de documentos).
              Mesma posição/cor/peso visual; conteúdo agora é lembrete de
              ciclo, não cofre. Ver docs/RUNBOOK.md ou memória do projeto
              "caderneta redesign" pro raciocínio completo por trás disso. */}
          <button
            type="button"
            onClick={onVaccinesClick}
            className="group relative min-h-[68px] overflow-hidden rounded-xl border border-emerald-400 bg-gradient-to-br from-emerald-100 via-emerald-100 to-teal-200 p-2.5 shadow-sm shadow-emerald-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95 min-[390px]:min-h-[76px] min-[390px]:rounded-2xl min-[390px]:p-3"
          >
            {shouldShowAlert(colorVaccines, alertVaccines) && <AlertDot tone={colorVaccines} />}
            <span className="absolute right-2 top-2 text-[18px] opacity-90 pointer-events-none transition-transform group-hover:scale-105 min-[390px]:right-2.5 min-[390px]:top-2.5 min-[390px]:text-[22px]">💉</span>
            <div className="flex h-full flex-col justify-center pr-6 pt-2 text-left min-[390px]:pr-7 min-[390px]:pt-3">
              <h3 className="truncate text-[13px] font-semibold leading-tight text-emerald-950 min-[390px]:text-[14px] sm:text-base">
                Vacina
              </h3>
              <p className="mt-0.5 line-clamp-1 text-[9px] leading-[1.1] text-emerald-900/80 min-[390px]:line-clamp-2 min-[390px]:text-[10px] sm:text-xs">{vaccineHeadline || `Mantenha ${petName || 'seu pet'} em dia com a vacinação`}</p>
              {vaccineSubline && (
                <p className="mt-0.5 line-clamp-1 text-[9px] font-bold leading-[1.1] text-emerald-900 min-[390px]:mt-1 min-[390px]:text-[10px] sm:text-xs">
                  {vaccineSubline}
                </p>
              )}
            </div>
          </button>

          {/* 4. SHOPPING (Loja do/da {pet}) — visual destaque deliberado:
              borda mais grossa, gradiente mais rico (azul mais saturado que
              o Saúde, indo até ciano pra não colidir com indigo/violet) e
              sombra mais forte que os outros 3. É a fonte de renda dedicada
              do app agora, então chama mais atenção que Ração/Saúde/
              Caderneta de propósito. */}
          <button
            type="button"
            onClick={onShoppingClick}
            className="group relative min-h-[68px] overflow-hidden rounded-xl border-2 border-blue-500 bg-gradient-to-br from-blue-100 via-blue-200 to-cyan-200 p-2.5 shadow-md shadow-blue-900/15 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-95 min-[390px]:min-h-[76px] min-[390px]:rounded-2xl min-[390px]:p-3"
          >
            <span className="absolute right-1 top-1 opacity-95 pointer-events-none transition-transform group-hover:scale-105 min-[390px]:right-1.5 min-[390px]:top-1.5">
              <img
                src="/loja-cart-ossos.webp"
                alt=""
                className="h-10 w-10 object-contain min-[390px]:h-12 min-[390px]:w-12"
              />
            </span>
            <div className="flex h-full flex-col justify-center pr-6 pt-2 text-left min-[390px]:pr-7 min-[390px]:pt-3">
              <h3 className="line-clamp-2 text-[13px] font-bold leading-tight text-blue-950 min-[390px]:text-[14px] sm:text-base">{shoppingTitle}</h3>
              <p className="mt-0.5 line-clamp-1 text-[9px] leading-[1.1] text-blue-900/75 min-[390px]:line-clamp-2 min-[390px]:text-[10px] sm:text-xs">Tudo que {petName || 'seu pet'} usa</p>
            </div>
          </button>

        </div>

        {/* Abaixo do grid: Pet Sumido + Socorro (agrupados — ambos de urgência) */}
        <div className="mt-2 space-y-2 min-[390px]:mt-2.5">
          <button
            type="button"
            onClick={onPetSumidoClick}
            className="group relative flex min-h-[44px] w-full items-center gap-2 overflow-hidden rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-2.5 shadow-sm shadow-red-900/5 transition-all duration-300 hover:shadow-md active:scale-[0.98] min-[390px]:min-h-[52px] min-[390px]:gap-2.5 min-[390px]:rounded-2xl min-[390px]:p-3"
          >
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-100 transition-transform group-hover:scale-105 min-[390px]:h-8 min-[390px]:w-8">
              <span className="pointer-events-none text-base min-[390px]:text-lg">🚨</span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <h3 className="truncate text-[13px] font-black leading-tight text-red-800 min-[390px]:text-[14px] sm:text-base">Pet Sumido</h3>
              <p className="mt-0.5 truncate text-[9px] font-semibold leading-[1.1] text-red-600/80 min-[390px]:text-[10px] sm:text-xs">Gerar alerta urgente</p>
            </div>
            <span className="text-lg text-red-300 transition-transform group-hover:translate-x-1">›</span>
          </button>

          <button
            type="button"
            onClick={() => setShowEmergencyChoice(true)}
            className="group relative flex min-h-[44px] w-full items-center gap-2 overflow-hidden rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-2.5 shadow-sm shadow-red-900/5 transition-all duration-300 hover:shadow-md active:scale-[0.98] min-[390px]:min-h-[52px] min-[390px]:gap-2.5 min-[390px]:rounded-2xl min-[390px]:p-3"
          >
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-100 transition-transform group-hover:scale-105 min-[390px]:h-8 min-[390px]:w-8">
              <span className="pointer-events-none text-base min-[390px]:text-lg">🚨</span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <h3 className="truncate text-[13px] font-bold leading-tight text-red-800 min-[390px]:text-[14px] sm:text-base">Emergência veterinária</h3>
              <p className="mt-0.5 truncate text-[9px] font-semibold leading-[1.1] text-red-600/80 min-[390px]:text-[10px] sm:text-xs">Encontre atendimento aberto ou ligue agora</p>
            </div>
            <span className="text-lg text-red-300 transition-transform group-hover:translate-x-1">›</span>
          </button>
        </div>
      </div>

      {/* Mini-choice: Socorro Agora */}
      {showEmergencyChoice && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" onClick={() => setShowEmergencyChoice(false)}>
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
          <div
            className="relative w-full max-w-sm bg-white rounded-t-[32px] sm:rounded-[28px] shadow-2xl border border-gray-200 overflow-hidden animate-slideUp sm:animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-handle my-3 opacity-40 sm:hidden" />
            <div className="px-5 pt-4 pb-2 border-b border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xl">🚨</span>
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-black text-red-900">O que você precisa agora?</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEmergencyChoice(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 active:scale-90 transition-all"
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-4 pb-8 space-y-2.5">
              {/* Hospital 24h — mais urgente, aparece primeiro */}
              <a
                href="https://www.google.com/maps/search/hospital+veterinário+24+horas+perto+de+mim"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowEmergencyChoice(false)}
                className="flex items-center gap-4 p-4 bg-red-600 rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-red-600/30"
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl flex-shrink-0">
                  🏨
                </div>
                <div className="flex-1">
                  <p className="font-black text-white text-[15px]">Hospitais veterinários 24h</p>
                  <p className="text-[11px] text-red-100 mt-0.5">Internação e atendimento emergencial</p>
                </div>
                <span className="text-white/60 text-lg">›</span>
              </a>
              {/* Clínica — urgente, mas menos grave */}
              <a
                href="https://www.google.com/maps/search/clínica+veterinária+aberta+agora+perto+de+mim"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowEmergencyChoice(false)}
                className="flex items-center gap-4 p-4 bg-orange-500 rounded-2xl active:scale-[0.98] transition-all shadow-md shadow-orange-500/20"
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl flex-shrink-0">
                  🏥
                </div>
                <div className="flex-1">
                  <p className="font-black text-white text-[15px]">Clínicas abertas agora</p>
                  <p className="text-[11px] text-orange-100 mt-0.5">Atendimento urgente próximo de você</p>
                </div>
                <span className="text-white/60 text-lg">›</span>
              </a>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

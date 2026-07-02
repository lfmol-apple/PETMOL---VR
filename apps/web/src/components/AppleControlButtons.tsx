'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { HomeShoppingSheet } from '@/features/commerce/HomeShoppingSheet';
import { type HomeInactiveEligibleControlId } from '@/lib/homeControlPreferences';

// ── Props H1 logic preserved ──────────────────────────────────────────────────
interface AppleControlButtonsProps {
  onHealthClick: () => void;
  onDocumentosClick: () => void;
  onAlimentacaoClick?: () => void;
  onBanhoTosaClick?: () => void;
  onMedicacaoClick?: () => void;
  onFamilyClick?: () => void;
  hasFoodData?: boolean;
  foodTitle?: string;
  foodHeadline?: string;
  foodSubline?: string;

  // Alert overrides from engine H1
  alertHealth?: boolean;
  alertGrooming?: boolean;
  alertFood?: boolean;
  alertMedicacao?: boolean;
  alertShopping?: boolean;
  
  colorHealth?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorGrooming?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorFood?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorMedicacao?: 'neutral' | 'ok' | 'warning' | 'critical';
  
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
  onDocumentosClick,
  onAlimentacaoClick,
  onMedicacaoClick,
  hasFoodData,
  foodTitle,
  foodHeadline,
  foodSubline,
  alertHealth,
  alertFood,
  alertMedicacao,
  colorHealth,
  colorFood,
  colorMedicacao,
}: AppleControlButtonsProps) {
  const { t } = useI18n();
  const [showShoppingSheet, setShowShoppingSheet] = useState(false);
  const [showEmergencyChoice, setShowEmergencyChoice] = useState(false);

  const medicacaoStatusText = colorMedicacao === 'critical'
    ? 'Dose atrasada'
    : colorMedicacao === 'warning'
      ? 'Dose para hoje'
      : colorMedicacao === 'ok'
        ? 'Em dia'
        : 'Gerenciar medicação';

  return (
    <>
      {/* Grid 2×2: Alimentação | Medicação / Saúde | Shopping */}
      <div className="relative">
        <div className="grid grid-cols-2 gap-2.5">

          {/* 1. ALIMENTAÇÃO */}
          <button
            type="button"
            onClick={onAlimentacaoClick}
            className="group relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-100 p-3 min-h-[82px] shadow-sm shadow-amber-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
          >
            {shouldShowAlert(colorFood, alertFood) && <AlertDot tone={colorFood} />}
            <span className="absolute right-2.5 top-2.5 opacity-85 pointer-events-none transition-transform group-hover:scale-105">
              <span className="text-[22px]">🥣</span>
            </span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="line-clamp-2 text-[13px] sm:text-base font-bold leading-tight text-amber-950">{foodTitle || t('home.food.title')}</h3>
              <p className="mt-0.5 line-clamp-2 text-[10px] sm:text-xs leading-[1.15] text-amber-800/85">
                {hasFoodData ? (foodHeadline || t('home.food.desc')) : (foodHeadline || 'Toque para cadastrar')}
              </p>
              {foodSubline && (
                <p className="mt-1 line-clamp-1 text-[10px] sm:text-xs font-bold leading-[1.15] text-amber-900">
                  {foodSubline}
                </p>
              )}
            </div>
          </button>

          {/* 2. SAÚDE */}
          <button
            type="button"
            onClick={onHealthClick}
            className="group relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-violet-50 to-violet-100 p-3 min-h-[82px] shadow-sm shadow-indigo-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
          >
            {shouldShowAlert(colorHealth, alertHealth) && <AlertDot tone={colorHealth} />}
            <span className="absolute right-2.5 top-2.5 text-[22px] opacity-85 pointer-events-none transition-transform group-hover:scale-105">🏥</span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-[14px] sm:text-base font-semibold leading-tight text-indigo-950">Saúde</h3>
              <p className="mt-0.5 line-clamp-2 text-[10px] sm:text-xs leading-[1.15] text-indigo-900/80">Vacinas, parasitas e coleira</p>
            </div>
          </button>

          {/* 3. MEDICAÇÃO */}
          <button
            type="button"
            onClick={onMedicacaoClick}
            className="group relative overflow-hidden rounded-2xl border border-purple-200/80 bg-gradient-to-br from-purple-50 via-violet-50 to-purple-100 p-3 min-h-[82px] shadow-sm shadow-purple-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
          >
            {shouldShowAlert(colorMedicacao, alertMedicacao) && <AlertDot tone={colorMedicacao} />}
            <span className="absolute right-2.5 top-2.5 text-[22px] opacity-85 pointer-events-none transition-transform group-hover:scale-105">💊</span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-[14px] sm:text-base font-semibold leading-tight text-purple-950">Medicação</h3>
              <p className="mt-0.5 line-clamp-2 text-[10px] sm:text-xs leading-[1.15] text-purple-900/80">{medicacaoStatusText}</p>
            </div>
          </button>

          {/* 4. SHOPPING */}
          <button
            type="button"
            onClick={() => setShowShoppingSheet(true)}
            className="group relative overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-blue-50 to-blue-100 p-3 min-h-[82px] shadow-sm shadow-sky-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
          >
            <span className="absolute right-2.5 top-2.5 text-[22px] opacity-85 pointer-events-none transition-transform group-hover:scale-105">🛒</span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-[14px] sm:text-base font-semibold leading-tight text-sky-950">{t('home.shopping.title')}</h3>
              <p className="mt-0.5 line-clamp-2 text-[10px] sm:text-xs leading-[1.15] text-sky-900/75">Produtos com desconto</p>
            </div>
          </button>

        </div>

        {/* Abaixo do grid: Histórico + Socorro */}
        <div className="mt-2.5 space-y-2">
          <button
            type="button"
            onClick={onDocumentosClick}
            className="group w-full relative overflow-hidden rounded-2xl border border-slate-200 bg-white/80 p-3 min-h-[52px] shadow-sm shadow-slate-900/5 transition-all duration-300 hover:shadow-md active:scale-[0.98] flex items-center gap-2.5"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 transition-transform group-hover:scale-105">
              <span className="pointer-events-none text-lg">📁</span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <h3 className="truncate text-[14px] sm:text-base font-bold leading-tight text-slate-800">Histórico</h3>
              <p className="mt-0.5 text-[10px] sm:text-xs font-semibold leading-[1.15] text-slate-500">Leve o histórico do pet para cada consulta</p>
            </div>
            <span className="text-lg text-slate-300 transition-transform group-hover:translate-x-1">›</span>
          </button>

          <button
            type="button"
            onClick={() => setShowEmergencyChoice(true)}
            className="group w-full relative overflow-hidden rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-3 min-h-[52px] shadow-sm shadow-red-900/5 transition-all duration-300 hover:shadow-md active:scale-[0.98] flex items-center gap-2.5"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-100 transition-transform group-hover:scale-105">
              <span className="pointer-events-none text-lg">🚨</span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <h3 className="truncate text-[14px] sm:text-base font-bold leading-tight text-red-800">Emergência veterinária</h3>
              <p className="mt-0.5 text-[10px] sm:text-xs font-semibold leading-[1.15] text-red-600/80">Encontre atendimento aberto ou ligue agora</p>
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

      <HomeShoppingSheet open={showShoppingSheet} onClose={() => setShowShoppingSheet(false)} />
      
    </>
  );
}

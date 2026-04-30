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

function AlertBadge({ tone = 'critical' }: { tone?: ControlTone }) {
  if (tone === 'warning') {
    return (
      <span className="absolute right-2 bottom-2 z-10 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 shadow-sm ring-2 ring-white/80">
        Atenção
      </span>
    );
  }

  return (
    <span className="absolute right-2 bottom-2 z-10 rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 shadow-sm ring-2 ring-white/80">
      Agora
    </span>
  );
}

export function AppleControlButtons({
  onHealthClick,
  onDocumentosClick,
  onAlimentacaoClick,
  onBanhoTosaClick,
  onFamilyClick,
  hasFoodData,
  foodTitle,
  foodHeadline,
  foodSubline,
  alertHealth,
  alertGrooming,
  alertFood,
  alertMedicacao,
  alertShopping,
  colorHealth,
  colorGrooming,
  colorFood,
  colorMedicacao,
  inactiveControls = [],
}: AppleControlButtonsProps) {
  const { t } = useI18n();
  const [showShoppingSheet, setShowShoppingSheet] = useState(false);


  return (
    <>
      {/* Grid principal — Alimentação em destaque na primeira posição */}
      <div className="relative">
        <div className="grid grid-cols-2 gap-2.5">
          {/* 1. ALIMENTAÇÃO — hero card, primeira posição */}
          <button
            type="button"
            onClick={onAlimentacaoClick}
            className="group relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-100 p-3 min-h-[82px] shadow-sm shadow-amber-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
          >
            {shouldShowAlert(colorFood, alertFood) && <AlertBadge tone={colorFood} />}
            <span className="absolute right-2.5 top-2.5 opacity-85 pointer-events-none transition-transform group-hover:scale-105">
              <span className="text-[22px]">🥣</span>
            </span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="line-clamp-2 text-[13px] sm:text-base font-bold leading-tight text-amber-950">{foodTitle || t('home.food.title')}</h3>
              <p className="mt-0.5 line-clamp-2 text-[10px] sm:text-xs leading-[1.15] text-amber-800/85">
                {hasFoodData
                  ? (foodHeadline || t('home.food.desc'))
                  : (foodHeadline || 'Toque para escanear a ração')}
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
            className="group relative overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-blue-50 to-blue-100 p-3 min-h-[82px] shadow-sm shadow-blue-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
          >
            {shouldShowAlert(colorHealth, alertHealth) && <AlertBadge tone={colorHealth} />}
            <span className="absolute right-2.5 top-2.5 text-[22px] opacity-85 pointer-events-none transition-transform group-hover:scale-105">🏥</span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-[14px] sm:text-base font-semibold leading-tight text-blue-950">
                {t('home.health.title')}
              </h3>
              <p className="mt-0.5 line-clamp-2 text-[10px] sm:text-xs leading-[1.15] text-blue-900/80">{t('home.health.vaccines')}</p>
            </div>
          </button>

          {/* 3. HIGIENE */}
          <button
            type="button"
            onClick={onBanhoTosaClick}
            className="group relative overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-green-50 to-lime-100 p-3 min-h-[76px] shadow-sm shadow-emerald-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
          >
            {shouldShowAlert(colorGrooming, alertGrooming) && <AlertBadge tone={colorGrooming} />}
            <span className="absolute right-2.5 top-2.5 text-[22px] opacity-85 pointer-events-none transition-transform group-hover:scale-105">🛁</span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-[14px] sm:text-base font-semibold leading-tight text-green-950">
                {t('home.hygiene')}
              </h3>
              <p className="mt-0.5 line-clamp-2 text-[10px] sm:text-xs leading-[1.15] text-green-900/80">{t('home.hygiene.desc')}</p>
            </div>
          </button>

          {/* 4. SCANNER / COMPRAS */}
          <button
            type="button"
            onClick={() => setShowShoppingSheet(true)}
            className="group relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-blue-100 via-indigo-100 to-violet-100 p-3 min-h-[76px] shadow-sm shadow-indigo-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
          >
            {alertShopping && <AlertBadge tone="critical" />}
            <span className="absolute right-2.5 top-2.5 text-[22px] opacity-85 pointer-events-none transition-transform group-hover:scale-105">🛒</span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-[14px] sm:text-base font-bold leading-tight text-indigo-950">{t('home.shopping.title')}</h3>
              <p className="mt-0.5 line-clamp-2 text-[10px] sm:text-xs leading-[1.15] text-indigo-900/75">{t('home.shopping.desc')}</p>
            </div>
          </button>

          {/* 5. DOCUMENTOS — full width */}
          <button
            type="button"
            onClick={onDocumentosClick}
            className="group col-span-2 relative overflow-hidden rounded-2xl border border-slate-200 bg-white/80 p-3 min-h-[56px] shadow-sm shadow-slate-900/5 transition-all duration-300 hover:shadow-md active:scale-[0.98]"
          >
            <div className="flex h-full items-center gap-2.5 text-left">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 transition-transform group-hover:scale-105">
                <span className="pointer-events-none text-lg">📁</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[14px] sm:text-base font-bold leading-tight text-slate-800">Histórico</h3>
                <p className="mt-0.5 line-clamp-2 text-[10px] sm:text-xs font-semibold leading-[1.15] text-slate-500">Leve o histórico do pet para cada consulta</p>
              </div>
              <span className="text-lg text-slate-300 transition-transform group-hover:translate-x-1">›</span>
            </div>
          </button>
        </div>
      </div>

      <HomeShoppingSheet open={showShoppingSheet} onClose={() => setShowShoppingSheet(false)} />
      
    </>
  );
}

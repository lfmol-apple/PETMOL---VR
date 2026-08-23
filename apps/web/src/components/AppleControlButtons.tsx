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

// Ilustração colorida (não emoji, não ícone de linha) pro card Alimentação —
// saco de ração + latinha + pacote de petisco agrupados, cara de app de
// verdade em vez de glifo do sistema. Trocado card a card, a pedido — este
// é o primeiro (Alimentação); os outros seguem o mesmo raciocínio depois.
function FoodGroupIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className}>
      {/* Lata, atrás à esquerda */}
      <rect x="2" y="14" width="9" height="11" rx="1.5" fill="#B0B8C1" stroke="#78828C" strokeWidth="0.75" />
      <ellipse cx="6.5" cy="14" rx="4.5" ry="1.6" fill="#D6DBE0" stroke="#78828C" strokeWidth="0.75" />
      <rect x="2" y="18" width="9" height="4" fill="#4E8F5C" />
      <rect x="2" y="18" width="9" height="1" fill="#3C7248" />

      {/* Saco de ração, ao centro, mais alto */}
      <path
        d="M10.5 12.5c0-1.3.4-2.2 1.2-2.9-0.4-.9-.2-1.9.6-2.5.9-.7 2-.6 2.7.1.7-.7 1.8-.8 2.7-.1.8.6 1 1.6.6 2.5.8.7 1.2 1.6 1.2 2.9v13a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-13Z"
        fill="#C98A4B"
        stroke="#9C6530"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <path d="M11.3 12.3h9v3.2h-9z" fill="#E8B27A" />
      {/* Pata (marca do saco), não cruz — 1 almofada + 4 dedinhos */}
      <ellipse cx="15.8" cy="20.6" rx="1.5" ry="1.2" fill="#FBEFE0" opacity="0.9" />
      <circle cx="14.3" cy="18.5" r="0.65" fill="#FBEFE0" opacity="0.9" />
      <circle cx="15.5" cy="17.9" r="0.65" fill="#FBEFE0" opacity="0.9" />
      <circle cx="16.7" cy="18.1" r="0.65" fill="#FBEFE0" opacity="0.9" />
      <circle cx="17.6" cy="19.1" r="0.6" fill="#FBEFE0" opacity="0.9" />

      {/* Pacote de petisco, na frente à direita, menor */}
      <rect x="19.5" y="16.5" width="9.5" height="9" rx="2" fill="#E3673C" stroke="#B24A26" strokeWidth="0.75" />
      <path d="M19.5 19.5h9.5" stroke="#B24A26" strokeWidth="0.75" />
      <circle cx="24.25" cy="23.2" r="1.9" fill="#FBD9C6" />
      <path d="M23.2 23.2a1.05 1.05 0 1 1 2.1 0 1.05 1.05 0 0 1-2.1 0Z" fill="#B24A26" />
    </svg>
  );
}

// Ilustração colorida pro card Loja — carrinho de compras de verdade,
// transbordando de produtos pet (ossinhos coloridos, bolinha, coleira),
// mesmo raciocínio do card Alimentação acima. Referência: carrinho cheio
// até a borda, produtos visíveis por cima da cesta, não só um item solto.
function ShoppingCartWithProductsIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className}>
      {/* Três ossinhos transbordando por cima da cesta, cores variadas */}
      <path d="M11 6.2c-.7-.9-2-1-2.8-.2-.6.6-.6 1.5-.1 2.2-.7.5-1 1.4-.6 2.2.5.9 1.6 1.2 2.5.8l5.6-2.6c.9-.4 1.3-1.5.9-2.4-.4-.8-1.3-1.2-2.1-1-.4-.8-1.3-1.2-2.2-.9-.5.2-.9.5-1.2.9Z" fill="#E3673C" stroke="#B24A26" strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M16.5 4.3c-.4-1-1.5-1.5-2.5-1.1-.8.3-1.2 1.1-1.1 1.9-.8.3-1.3 1.1-1.2 2 .2 1 1.1 1.6 2.1 1.5l6-.9c1-.1 1.7-1 1.6-2-.1-.9-.9-1.5-1.7-1.5-.1-.9-.9-1.6-1.8-1.5-.5.1-1 .3-1.4.6Z" fill="#4E8F5C" stroke="#3C7248" strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M22.5 6.6c-.2-1-1.1-1.7-2.1-1.5-.8.1-1.4.8-1.4 1.6-.9.1-1.6.8-1.6 1.7 0 1 .8 1.8 1.8 1.8l6.1.3c1 .1 1.8-.6 1.9-1.6.1-.9-.6-1.7-1.4-1.9.1-.9-.5-1.8-1.4-1.9-.5-.1-1 .1-1.5.4Z" fill="#C98A4B" stroke="#9C6530" strokeWidth="0.5" strokeLinejoin="round" />

      {/* Cesta do carrinho */}
      <path d="M6 14h20l-2.2 9.5a1.6 1.6 0 0 1-1.55 1.25H9.75A1.6 1.6 0 0 1 8.2 23.5L6 14Z" fill="#4A90D9" stroke="#2F6CB0" strokeWidth="0.75" strokeLinejoin="round" />
      <path d="M8 17.5h16M8.6 20.5h14.8" stroke="#2F6CB0" strokeWidth="0.6" opacity="0.55" />
      <path d="M4 11h2.6l1 3h16.8" fill="none" stroke="#2F6CB0" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />

      {/* Bolinha e coleira, visíveis dentro da cesta */}
      <circle cx="11.5" cy="18.6" r="2.1" fill="#E3673C" stroke="#B24A26" strokeWidth="0.45" />
      <path d="M9.9 17.7c1.1.7 2.2.7 3.2 0M9.9 19.5c1.1-.7 2.2-.7 3.2 0" stroke="#B24A26" strokeWidth="0.4" fill="none" />
      <circle cx="19" cy="19" r="2.4" fill="none" stroke="#C98A4B" strokeWidth="1.3" />
      <circle cx="19" cy="21.6" r="0.75" fill="#4E8F5C" stroke="#3C7248" strokeWidth="0.3" />

      {/* Rodas */}
      <circle cx="11" cy="27.3" r="1.7" fill="#2F3B47" />
      <circle cx="22" cy="27.3" r="1.7" fill="#2F3B47" />
      <circle cx="11" cy="27.3" r="0.6" fill="#8894A0" />
      <circle cx="22" cy="27.3" r="0.6" fill="#8894A0" />
    </svg>
  );
}

// Ilustração colorida pro card Vacina — duas ampolas de verdade (vidro +
// líquido colorido + tampa) e uma seringa com agulha, mesmo raciocínio dos
// cards Alimentação/Loja acima.
function VaccineVialsIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="-2 -2 40 40" className={className}>
      {/* Ampola de trás, à esquerda */}
      <rect x="4" y="10" width="6.5" height="11" rx="1.6" fill="#EAF3FB" stroke="#8FB9DE" strokeWidth="0.6" />
      <rect x="4" y="14.5" width="6.5" height="6.5" rx="1" fill="#4A90D9" opacity="0.85" />
      <rect x="5.2" y="7.6" width="4.1" height="2.6" rx="0.5" fill="#B0B8C1" stroke="#78828C" strokeWidth="0.4" />
      <rect x="6.4" y="6.3" width="1.7" height="1.5" fill="#8894A0" />

      {/* Ampola da frente, à direita, um pouco maior */}
      <rect x="10.5" y="8.5" width="7.5" height="13" rx="1.8" fill="#EAF3FB" stroke="#E0A9A0" strokeWidth="0.6" />
      <rect x="10.5" y="14" width="7.5" height="8" rx="1.1" fill="#E3673C" opacity="0.85" />
      <rect x="11.9" y="5.7" width="4.7" height="3" rx="0.5" fill="#B0B8C1" stroke="#78828C" strokeWidth="0.4" />
      <rect x="13.3" y="4.2" width="1.9" height="1.7" fill="#8894A0" />
      <path d="M12.2 10.2v11" stroke="#F7DCD5" strokeWidth="0.6" opacity="0.8" />

      {/* Seringa, diagonal, na frente */}
      <g transform="rotate(38 22 20)">
        <rect x="18.5" y="14" width="10" height="5" rx="1" fill="#EAF3FB" stroke="#8FB9DE" strokeWidth="0.6" />
        <rect x="19.3" y="14.9" width="7.6" height="3.2" fill="#4A90D9" opacity="0.4" />
        <path d="M20.6 14v5M22.6 14v5M24.6 14v5" stroke="#2F6CB0" strokeWidth="0.4" opacity="0.7" />
        <rect x="16.3" y="14.7" width="2.6" height="3.6" rx="0.5" fill="#B0B8C1" stroke="#78828C" strokeWidth="0.4" />
        <path d="M14 16.5h2.6" stroke="#8894A0" strokeWidth="1.1" strokeLinecap="round" />
        <rect x="28" y="15.3" width="3" height="1.4" fill="#8894A0" />
        <path d="M31 16h1.6" stroke="#8894A0" strokeWidth="0.7" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// Ilustração colorida pro card Cuidados — caixinha de remédio (cruz
// vermelha), aplicador antipulgas (spot-on) e cartela de vermífugo,
// agrupados, mesmo raciocínio dos cards Alimentação/Loja/Vacina acima.
function HealthCareGroupIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className}>
      {/* Caixinha de remédio, atrás à esquerda */}
      <rect x="2" y="15" width="9" height="10" rx="1.4" fill="#FFFFFF" stroke="#B0B8C1" strokeWidth="0.75" />
      <rect x="2" y="15" width="9" height="3.2" fill="#4A90D9" />
      <rect x="5.9" y="18.4" width="1.6" height="5.2" rx="0.4" fill="#E3673C" />
      <rect x="4" y="20.2" width="5.4" height="1.6" rx="0.4" fill="#E3673C" />

      {/* Antipulgas (aplicador spot-on), ao centro, mais alto */}
      <rect x="14" y="10.5" width="5" height="11.5" rx="1.2" fill="#4E8F5C" stroke="#3C7248" strokeWidth="0.6" />
      <rect x="14.5" y="14.5" width="4" height="6.5" rx="0.6" fill="#7BB88A" opacity="0.85" />
      <rect x="14.7" y="7.6" width="3.6" height="3.2" rx="0.6" fill="#8894A0" stroke="#6B7480" strokeWidth="0.4" />
      <rect x="15.9" y="5.6" width="1.2" height="2.4" fill="#6B7480" />

      {/* Vermífugo (cartela de comprimidos), na frente à direita */}
      <rect x="19.5" y="16.5" width="9.5" height="9" rx="1.6" fill="#F0D9B5" stroke="#C98A4B" strokeWidth="0.75" />
      <circle cx="22.1" cy="19.1" r="1.3" fill="#FFFFFF" stroke="#9C6530" strokeWidth="0.4" />
      <circle cx="26.4" cy="19.1" r="1.3" fill="#FFFFFF" stroke="#9C6530" strokeWidth="0.4" />
      <circle cx="22.1" cy="22.9" r="1.3" fill="#FFFFFF" stroke="#9C6530" strokeWidth="0.4" />
      <circle cx="26.4" cy="22.9" r="1.3" fill="#FFFFFF" stroke="#9C6530" strokeWidth="0.4" />
    </svg>
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
            <span className="absolute right-1.5 top-1.5 opacity-95 pointer-events-none transition-transform group-hover:scale-105 min-[390px]:right-2 min-[390px]:top-2">
              <FoodGroupIllustration className="w-[30px] h-[30px] min-[390px]:w-9 min-[390px]:h-9" />
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
            <span className="absolute right-1.5 top-1.5 opacity-95 pointer-events-none transition-transform group-hover:scale-105 min-[390px]:right-2 min-[390px]:top-2">
              <HealthCareGroupIllustration className="w-[30px] h-[30px] min-[390px]:w-9 min-[390px]:h-9" />
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
            <span className="absolute right-1.5 top-1.5 opacity-95 pointer-events-none transition-transform group-hover:scale-105 min-[390px]:right-2 min-[390px]:top-2">
              <VaccineVialsIllustration className="w-[30px] h-[30px] min-[390px]:w-9 min-[390px]:h-9" />
            </span>
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
            <span className="absolute right-1.5 top-1.5 opacity-95 pointer-events-none transition-transform group-hover:scale-105 min-[390px]:right-2 min-[390px]:top-2">
              <ShoppingCartWithProductsIllustration className="w-[30px] h-[30px] min-[390px]:w-9 min-[390px]:h-9" />
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

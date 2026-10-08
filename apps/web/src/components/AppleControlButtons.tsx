'use client';

import { useBackHandler } from '@/lib/backStack';
import { useState } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { type HomeInactiveEligibleControlId } from '@/lib/homeControlPreferences';
import { PetHealthPlanCard } from '@/components/home/PetHealthPlanCard';
import { HEALTH_PLAN_CARD_ENABLED } from '@/lib/featureFlags';

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
  alertVaccines?: boolean;

  colorHealth?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorGrooming?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorFood?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorMedicacao?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorVaccines?: 'neutral' | 'ok' | 'warning' | 'critical';

  inactiveControls?: HomeInactiveEligibleControlId[];
  onDeactivateControl?: (controlId: HomeInactiveEligibleControlId) => void;

  // Quantos pets sumidos existem na região agora (não são do usuário) — dono
  // da lógica/estado continua em home/page.tsx (nearbyAlerts,
  // handledAlertIds). Botão dedicado ao lado de "Pet Sumido" (a pedido do
  // dono, 18/09) — abre o mesmo visualizador em tela cheia estilo Stories
  // que o pisco ao lado do nome do pet já abre (onOpenNearbyMissing).
  nearbyMissingCount?: number;
  onOpenNearbyMissing?: () => void;
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

function isDenseCardCopy(...parts: Array<string | undefined | null>) {
  const text = parts.filter(Boolean).join(' ');
  return text.length > 42 || parts.filter(Boolean).length >= 3;
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
  healthHeadline,
  alertHealth,
  alertFood,
  alertVaccines,
  colorHealth,
  colorFood,
  colorVaccines,
  nearbyMissingCount = 0,
  onOpenNearbyMissing,
}: AppleControlButtonsProps) {
  const { t } = useI18n();
  const [showEmergencyChoice, setShowEmergencyChoice] = useState(false);
  useBackHandler(showEmergencyChoice, () => setShowEmergencyChoice(false));
  // Texto fixo, sem personalização por pet (pedido do dono, 08/10/2026:
  // trocar "Loja do [pet]" por "Comprar Produtos" — era `Loja ${petDo(...)}
  // ${petName}`, com fallback genérico só quando faltava o nome; agora é
  // sempre o mesmo texto, direto do dicionário de i18n.
  const shoppingTitle = t('home.shopping.title');
  const foodHeadlineText = !hasFoodData
    ? 'Cuidado em aberto'
    : (foodHeadline || t('home.food.desc'));
  // Subtexto = ESTADO do cuidado, não repetição do título (checklist
  // PETMOL 1.0, item 6: "a Home responde 'Como está meu pet hoje?'").
  // Antes o texto era fixo ("Cuidados de Ted") e só a bolinha avisava
  // problema. Agora: o lembrete real quando há um vencendo (o dado já é
  // calculado em HomePetDashboard e passado como healthHeadline/
  // vaccineHeadline) → senão "Precisa de atenção" / "Está tudo em dia" /
  // "Sem registro ainda" pelo tom. A bolinha (AlertDot) continua.
  const careStatusText = (
    headline: string | undefined,
    tone: ControlTone | undefined,
    alert: boolean | undefined,
    emptyText: string,
  ) =>
    headline
      ? headline
      : shouldShowAlert(tone, alert)
        ? 'Precisa de atenção'
        : tone === 'ok'
          ? 'Está tudo em dia'
          : emptyText;
  const healthHeadlineText = careStatusText(healthHeadline, colorHealth, alertHealth, 'Toque para revisar');
  const vaccineHeadlineText = careStatusText(vaccineHeadline, colorVaccines, alertVaccines, 'Sem vacina registrada');
  const foodIsDense = isDenseCardCopy(foodTitle || t('home.food.title'), foodHeadlineText, foodSubline);

  return (
    <>
      {/* Grid 2×2: Alimentação | Saúde | Vacina | Shopping — items-stretch
          explícito (08/10/2026, pedido do dono: cards com tamanhos
          diferentes no celular real) porque o <button> como item de grid
          às vezes não herda align-items:stretch por padrão em alguns
          WebKit/Safari, mesmo sendo o comportamento padrão do CSS Grid. */}
      <div className="relative">
        <div className="grid grid-cols-2 items-stretch gap-2 min-[390px]:gap-2.5">

          {/* 1. ALIMENTAÇÃO — reviravolta 11/10/2026 (pedido do dono): sem
              emoji/arte nenhuma nos 4 cards principais, título com mais
              peso tipográfico carregando o card sozinho. */}
          <button
            type="button"
            onClick={onAlimentacaoClick}
            className="group relative min-h-[76px] overflow-hidden rounded-xl border border-[#BFD4F0] bg-gradient-to-br from-white to-[#E6EEF9] p-2.5 shadow-[0_2px_10px_-2px_rgba(0,86,210,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-6px_rgba(0,86,210,0.16)] active:scale-95 min-[390px]:min-h-[86px] min-[390px]:rounded-2xl min-[390px]:p-3"
          >
            {(!hasFoodData || shouldShowAlert(colorFood, alertFood)) && (
              <AlertDot tone={!hasFoodData ? 'critical' : colorFood} />
            )}
            <div className="flex h-full flex-col justify-center text-left">
              <h3 className="line-clamp-2 text-[14px] font-black leading-tight tracking-tight text-[#0B1E36] min-[390px]:text-[15px] sm:text-base">{foodTitle || t('home.food.title')}</h3>
              <p className={`mt-1 ${foodIsDense ? 'line-clamp-2' : 'line-clamp-1 min-[390px]:line-clamp-2'} text-[11px] leading-snug min-[390px]:text-xs sm:text-sm ${!hasFoodData ? 'font-bold text-red-700' : 'text-[#5B6B82]'}`}>
                {foodHeadlineText}
              </p>
              {foodSubline && hasFoodData && (
                <p className="mt-0.5 line-clamp-1 text-[11px] font-bold leading-snug text-[#0B1E36] min-[390px]:mt-1 min-[390px]:text-xs sm:text-sm">
                  {foodSubline}
                </p>
              )}
            </div>
          </button>

          {/* 2. SAÚDE */}
          <button
            type="button"
            onClick={onHealthClick}
            className="group relative min-h-[76px] overflow-hidden rounded-xl border border-[#BFD4F0] bg-gradient-to-br from-white to-[#E6EEF9] p-2.5 shadow-[0_2px_10px_-2px_rgba(0,86,210,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-6px_rgba(0,86,210,0.16)] active:scale-95 min-[390px]:min-h-[86px] min-[390px]:rounded-2xl min-[390px]:p-3"
          >
            {shouldShowAlert(colorHealth, alertHealth) && <AlertDot tone={colorHealth} />}
            <div className="relative z-10 flex h-full flex-col justify-center text-left">
              <h3 className="line-clamp-1 break-words text-[17px] font-black leading-tight tracking-tight text-[#0B1E36] min-[390px]:text-[18px] sm:text-lg">Cuidados</h3>
              <p className="mt-1 line-clamp-2 break-words text-[11px] leading-snug text-[#5B6B82] min-[390px]:text-xs sm:text-sm">{healthHeadlineText}</p>
            </div>
          </button>

          {/* 3. VACINA — substituiu a antiga Caderneta (cofre de documentos).
              Mesma posição/cor/peso visual; conteúdo agora é lembrete de
              ciclo, não cofre. Ver docs/RUNBOOK.md ou memória do projeto
              "caderneta redesign" pro raciocínio completo por trás disso. */}
          <button
            type="button"
            onClick={onVaccinesClick}
            className="group relative min-h-[84px] overflow-hidden rounded-xl border border-[#BFD4F0] bg-gradient-to-br from-white to-[#E6EEF9] p-2.5 shadow-[0_2px_10px_-2px_rgba(0,86,210,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-6px_rgba(0,86,210,0.16)] active:scale-95 min-[390px]:min-h-[96px] min-[390px]:rounded-2xl min-[390px]:p-3"
          >
            {shouldShowAlert(colorVaccines, alertVaccines) && <AlertDot tone={colorVaccines} />}
            <div className="relative z-10 flex h-full flex-col justify-center text-left">
              <h3 className="line-clamp-1 break-words text-[17px] font-black leading-tight tracking-tight text-[#0B1E36] min-[390px]:text-[18px] sm:text-lg">
                Vacina
              </h3>
              <p className="mt-1 line-clamp-2 break-words text-[11px] leading-snug text-[#5B6B82] min-[390px]:text-xs sm:text-sm">{vaccineHeadlineText}</p>
            </div>
          </button>

          {/* 4. SHOPPING (Loja do/da {pet}) — até 07/10/2026 tinha destaque
              deliberado (borda grossa, gradiente azul saturado próprio,
              sombra mais forte) por ser fonte de renda; convergido pra
              família única do redesign premium (azul-gelo) a pedido
              explícito do dono — "não precisam ter fundos fortes
              completamente diferentes apenas para serem reconhecidos".
              SEM bolinha de alerta (decisão de produto, 04/09/2026),
              mantido: loja não deve parecer urgente. */}
          <button
            type="button"
            onClick={onShoppingClick}
            className="group relative min-h-[84px] overflow-hidden rounded-xl border border-[#BFD4F0] bg-gradient-to-br from-white to-[#E6EEF9] p-2.5 shadow-[0_2px_10px_-2px_rgba(0,86,210,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-6px_rgba(0,86,210,0.16)] active:scale-95 min-[390px]:min-h-[96px] min-[390px]:rounded-2xl min-[390px]:p-3"
          >
            <div className="relative z-10 flex h-full flex-col justify-center text-left">
              <h3 className="line-clamp-2 break-words text-[14px] font-black leading-tight tracking-tight text-[#0B1E36] min-[390px]:text-[15px] sm:text-base">{shoppingTitle}</h3>
              <p className="mt-1 line-clamp-2 break-words text-[11px] leading-snug text-[#5B6B82] min-[390px]:text-xs sm:text-sm">Tudo que {petName || 'seu pet'} usa</p>
            </div>
          </button>

        </div>

        {/* Plano de Saúde — área complementar/destaque, fora da grade de
            cards funcionais. Entre os cards e "Pet Sumido". Desativado pro
            1.0 (19/09/2026): sem parceria aprovada, virou só um card "Em
            breve" sem função nenhuma — implementação preservada atrás da
            flag, ver lib/featureFlags.ts. */}
        {HEALTH_PLAN_CARD_ENABLED && (
          <div className="mt-3 min-[390px]:mt-3.5">
            <PetHealthPlanCard petName={petName} petSex={petSex} />
          </div>
        )}

        {/* Abaixo: Pet Sumido + "Perto de você" (agrupados, meia largura cada
            — pedido do dono, 18/09). "Pet Sumido" continua só a função dele
            (reportar seu pet). "Perto de você" agora vive SEMPRE aqui, não
            só quando há alerta: número grande + pisco lento (igual o
            letreiro antigo) quando há pet sumido na região; verde claro e
            calmo quando não há nenhum. onOpenNearbyMissing decide, do lado
            de fora (home/page.tsx), qual tela cheia abrir: com alerta, o
            visualizador estilo Stories; sem alerta, um aviso verde de
            conscientização — antes o toque não fazia nada nesse estado
            (o Stories não tem slide sem alerta pra mostrar), virou botão
            morto até o dono pedir pra consertar (22/09). */}
        <div className="mt-2 space-y-2 min-[390px]:mt-2.5">
          <div className="grid grid-cols-2 gap-2 min-[390px]:gap-2.5">
            <button
              type="button"
              onClick={onPetSumidoClick}
              className="group relative flex min-h-[44px] items-center gap-1.5 overflow-hidden rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-2.5 shadow-sm shadow-red-900/5 transition-all duration-300 hover:shadow-md active:scale-[0.98] min-[390px]:min-h-[52px] min-[390px]:rounded-2xl min-[390px]:p-3"
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-100 transition-transform group-hover:scale-105 min-[390px]:h-8 min-[390px]:w-8">
                <span className="pointer-events-none text-base min-[390px]:text-lg">🚨</span>
              </div>
              <div className="min-w-0 flex-1 text-left">
                <h3 className="truncate text-[12px] font-black leading-tight text-red-800 min-[390px]:text-[13px]">Pet Sumido</h3>
                <p className="mt-0.5 truncate text-[9px] font-semibold leading-[1.1] text-red-600/80">Alerta urgente</p>
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenNearbyMissing}
              className={`group relative flex min-h-[44px] items-center gap-1.5 overflow-hidden rounded-xl border p-2.5 shadow-sm transition-all duration-300 hover:shadow-md active:scale-[0.98] min-[390px]:min-h-[52px] min-[390px]:rounded-2xl min-[390px]:p-3 ${
                nearbyMissingCount > 0
                  ? 'animate-blink-slow border-rose-400 bg-gradient-to-r from-rose-600 to-rose-500 shadow-rose-900/20'
                  : 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-50/70 shadow-emerald-900/5'
              }`}
            >
              <span
                className={`flex-shrink-0 text-xl font-black leading-none tabular-nums min-[390px]:text-2xl ${
                  nearbyMissingCount > 0 ? 'text-white' : 'text-emerald-600'
                }`}
              >
                {nearbyMissingCount}
              </span>
              {/* Um texto só ("X Pet(s) Sumido(s) Perto de você") em vez do
                  título + legenda separados de antes — pedido do dono
                  (22/09): o número já fica na bolinha, a frase completa o
                  resto. Sempre mostra a contagem, 0 incluso (nada de ✓
                  escondendo o número). */}
              <div className="min-w-0 flex-1 text-left">
                <h3 className={`line-clamp-2 text-[12px] font-black leading-tight min-[390px]:text-[13px] ${
                  nearbyMissingCount > 0 ? 'text-white' : 'text-emerald-700'
                }`}>
                  {nearbyMissingCount === 1 ? 'Pet Sumido' : 'Pets Sumidos'} Perto de você
                </h3>
              </div>
            </button>
          </div>

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

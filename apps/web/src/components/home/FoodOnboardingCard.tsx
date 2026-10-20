'use client';

/**
 * Passo focado de alimentação no onboarding inicial (pedido do dono,
 * 12/10/2026, a partir dos dados do Mission Control: 1.034 tutores, 910 com
 * pet, só 388 (37,5%) com alimentação cadastrada — 522 cadastraram o pet e
 * pararam aí). Substitui o `OnboardingChecklistCard` (que pedia vacina,
 * antipulgas, vermífugo E alimentação de uma vez só) como o passo que
 * aparece automaticamente logo após o 1º pet — esse card continua existindo
 * no código, só deixou de ser disparado na jornada inicial; os demais
 * controles seguem integralmente disponíveis pela Home (HomePetDashboard),
 * sem pedido automático.
 *
 * Reaproveita 100% a lógica real de alimentação (FoodControlTab em
 * formRequest.mode="quick_setup" — já existia: zero campo obrigatório além
 * de duração com default de 30 dias e data de início = hoje). Nada de
 * cálculo/validação duplicado aqui, só a moldura de onboarding por cima.
 */
import { useEffect, useRef, useState } from 'react';
import { Bell, PawPrint } from 'lucide-react';
import { petDo } from '@/lib/petGender';
import { trackV1Metric } from '@/lib/v1Metrics';
import { SheetAvatar, SheetHeader, SheetShell, SHEET_Z } from '@/components/ui/sheet';
import { writeOnboardingStore } from '@/lib/onboardingProgress';
import { startSecondChanceClock } from '@/components/home/foodSecondChance';
import { FoodControlTab } from '@/components/FoodControlTab';
import { ActivationAskSheet } from '@/components/home/ActivationAskSheet';
import { useNotificationPermissionController } from '@/features/interactions/useNotificationPermissionController';

/** Abaixo do cabeçalho global (sticky z-50): o Perfil e o ☰ continuam tocáveis com o passo de ração aberto. */
const ONBOARDING_SHEET_Z = 45;

interface FoodOnboardingCardProps {
  petId: string;
  petName: string;
  petSex?: 'male' | 'female' | null;
  petPhotoSrc?: string;
  species?: 'dog' | 'cat';
  /** chamado depois de salvar OU pular — o pai decide o que fazer (ex.:
   *  reconsultar o plano alimentar; inofensivo chamar isso num pulo, já
   *  que nada mudou no servidor). */
  onDone: () => void;
  /** enquanto outro sheet de controle está aberto, o card se recolhe — não
   *  cobre o que o tutor abriu por conta própria pela Home. */
  suppressed?: boolean;
}

const QUICK_SETUP_REQUEST = { id: 1, mode: 'quick_setup' } as const;

export function FoodOnboardingCard({
  petId,
  petName,
  petSex,
  petPhotoSrc,
  species,
  onDone,
  suppressed = false,
}: FoodOnboardingCardProps) {
  const [closed, setClosed] = useState(false);
  const [showPushAsk, setShowPushAsk] = useState(false);
  // Pedido do dono (17/10/2026): quem já chegou na tela do controle (ração escolhida) não recebe mais "Fazer depois"
  // nem o texto de introdução — a janela fica mais curta e o caminho, um só.
  const [controlVisible, setControlVisible] = useState(false);
  const name = petName || 'seu pet';
  const artigo = petDo({ sex: petSex });
  // Lembrete de ração só serve se o push funcionar — pedido do dono
  // (12/10/2026): mesmo que o tutor já tenha dispensado o pedido de
  // notificação em outra tela (flag global de usePushOneTimeAsk), pergunta
  // de novo aqui especificamente, porque concluir o cadastro de alimentação
  // sem push ativo é a causa raiz real que já gerou lembretes perdidos.
  const { permission: pushPermission, requestPermission: requestPushPermission, subscribeToPush } = useNotificationPermissionController();

  useEffect(() => {
    trackV1Metric('onboarding_food_step_viewed', { pet_id: petId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  const startedRef = useRef(false);
  const markStarted = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    trackV1Metric('onboarding_food_step_started', { pet_id: petId });
  };

  const handleSkip = () => {
    writeOnboardingStore(petId, { food: 'later' });
    startSecondChanceClock(petId);   // a 1ª segunda chance só vem depois de 7 dias
    trackV1Metric('onboarding_food_step_skipped', { pet_id: petId });
    setClosed(true);
    onDone();
  };

  const finish = () => {
    setClosed(true);
    onDone();
  };

  const handleSaved = () => {
    trackV1Metric('onboarding_food_step_completed', { pet_id: petId });
    if (pushPermission === 'default') {
      setShowPushAsk(true);
      return;
    }
    finish();
  };

  if (closed) return null;

  return (
    <>
    <ActivationAskSheet
      open={showPushAsk}
      icon={<Bell className="h-5 w-5" strokeWidth={2.2} />}
      title="Ative as notificações"
      body={`Pra você não perder a hora de comprar ração de novo — o PETMOL avisa sozinho quando o estoque ${artigo} ${name} estiver acabando.`}
      ctaLabel="Ativar notificações"
      onActivate={async () => {
        const granted = await requestPushPermission();
        if (granted) await subscribeToPush();
      }}
      onDismiss={finish}
    />
    {/* z=45 (abaixo do cabeçalho, z-50): esse passo aparece SOZINHO ao abrir a Home — não pode cobrir o cabeçalho
        (Perfil, ☰), senão o 1º toque em "Perfil" só fechava o sheet e parecia que "nada acontece". */}
    <SheetShell open={!suppressed} onClose={handleSkip} tone="grey" variant="center" size="sm" z={ONBOARDING_SHEET_Z} hideHandle>
      <SheetHeader
        tone="petmol"
        wrapTitle
        title={`Saiba quando a ração ${artigo} ${name} vai acabar`}
        media={<SheetAvatar src={petPhotoSrc} alt="" fallback={<PawPrint className="h-5 w-5 text-[#0056D2]" strokeWidth={2.2} />} />}
        onClose={handleSkip}
      />
      <SheetShell.Body className="pt-4">
        <div className="space-y-3" onPointerDownCapture={markStarted}>
          {!controlVisible && (
            <p className="text-[13.5px] text-slate-500">
              Cadastre a alimentação e o PETMOL ajuda você a prever quando será necessário comprar mais.
            </p>
          )}
          <FoodControlTab
            petId={petId}
            petName={name}
            species={species}
            embedded
            hideInternalHeader
            formRequest={QUICK_SETUP_REQUEST}
            onSaved={handleSaved}
            onQuickStageChange={setControlVisible}
          />
          {!controlVisible && (
            <button
              type="button"
              onClick={handleSkip}
              className="w-full py-2 text-center text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Fazer depois
            </button>
          )}
        </div>
      </SheetShell.Body>
    </SheetShell>
    </>
  );
}

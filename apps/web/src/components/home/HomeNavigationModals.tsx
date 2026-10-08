'use client';

import { useBackHandler } from '@/lib/backStack';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/I18nContext';
import { ModalPortal } from '@/components/ModalPortal';
import { PETMOL_HEADER_BG } from '@/components/ui/sheet';
import { PetShopsNearbySheet } from '@/components/home/PetShopsNearbySheet';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';
import { MEDICATIONS_ENABLED } from '@/lib/featureFlags';
import type { PetHealthProfile } from '@/lib/petHealth';

type ControlTone = 'neutral' | 'ok' | 'warning' | 'critical';

interface HomeNavigationModalsProps {
  currentPet: PetHealthProfile | null | undefined;
  showHealthOptionsModal: boolean;
  onCloseHealthOptionsModal: () => void;
  onOpenHealthOptionsModal: () => void;
  alertVaccinesValue: boolean;
  alertParasitesValue: boolean;
  alertMedicationValue: boolean;
  alertGroomingValue?: boolean;
  colorVaccinesValue?: ControlTone;
  colorVermifugoValue?: ControlTone;
  colorAntipulgasValue?: ControlTone;
  colorColeiraValue?: ControlTone;
  colorMedicationValue?: ControlTone;
  colorGroomingValue?: ControlTone;
  onOpenHealthTab: (tab: string) => void;
  onStartEventRegistration: (type: string) => void;
  onNavigateToSaude?: (tab: string) => void;
  // Individual sheet handlers H1
  onOpenVaccines?: () => void;
  onOpenVermifugo?: () => void;
  onOpenAntipulgas?: () => void;
  onOpenColeira?: () => void;
  onOpenMedication?: () => void;
  onOpenGrooming?: () => void;
  onOpenEmergency?: () => void;
}

function shouldShowAlert(tone?: ControlTone, fallbackAlert?: boolean) {
  if (tone) return tone === 'warning' || tone === 'critical';
  return fallbackAlert === true;
}

function ControlAlertBadge({ tone = 'critical' }: { tone?: ControlTone }) {
  if (tone === 'warning') {
    return (
      <div className="absolute top-2 left-2 w-6 h-6 flex items-center justify-center animate-pulse z-10">
        <span
          className="absolute inset-0 bg-amber-400 shadow-sm ring-2 ring-white"
          style={{ clipPath: 'polygon(50% 0%, 100% 92%, 0% 92%)' }}
        />
        <span className="relative mt-1 text-[11px] font-black text-amber-950 leading-none">!</span>
      </div>
    );
  }

  return (
    <div className="absolute top-2.5 left-2.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold animate-pulse shadow-sm border border-white/50 z-10">
      !
    </div>
  );
}

export function HomeNavigationModals({
  currentPet,
  showHealthOptionsModal,
  onCloseHealthOptionsModal,
  onOpenHealthOptionsModal,
  alertVaccinesValue,
  alertParasitesValue,
  alertMedicationValue,
  colorVaccinesValue,
  colorVermifugoValue,
  colorAntipulgasValue,
  colorColeiraValue,
  colorMedicationValue,
  onOpenHealthTab,
  onStartEventRegistration,
  onNavigateToSaude,
  onOpenVaccines,
  onOpenVermifugo,
  onOpenAntipulgas,
  onOpenColeira,
  onOpenMedication,
  onOpenGrooming,
  alertGroomingValue,
  colorGroomingValue,
  onOpenEmergency,
}: HomeNavigationModalsProps) {
  const { t } = useI18n();
  const petPhotoSrc = resolvePetPhotoUrl(currentPet?.photo);
  // "PetShops perto de você" saiu da Home e agora vive aqui dentro de Cuidados.
  const [showPetShopsNearby, setShowPetShopsNearby] = useState(false);
  useBackHandler(showHealthOptionsModal, onCloseHealthOptionsModal);

  return (
    <ModalPortal>
    <>
      {showHealthOptionsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn" onClick={onCloseHealthOptionsModal}>
          <div
            className="bg-[#F2F6FC] rounded-[26px] shadow-2xl w-full max-w-sm max-h-[92dvh] flex flex-col overflow-hidden animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Mini-Home — bloco azul PETMOL, mesma linguagem dos sheets do pet */}
            <div className={`flex items-center justify-between px-6 py-4 ${PETMOL_HEADER_BG} shadow-[0_6px_20px_-10px_rgba(0,66,126,0.7)]`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 flex-shrink-0 rounded-full overflow-hidden bg-white shadow-[0_2px_10px_rgba(0,0,0,0.18)] ring-2 ring-white/70 flex items-center justify-center">
                  {petPhotoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={petPhotoSrc} alt={currentPet?.pet_name || 'Pet'} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-xl">{currentPet?.species === 'cat' ? '🐱' : '🐶'}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-[17px] font-black text-white leading-tight tracking-[-0.01em]">Cuidados</h3>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/75 leading-tight truncate">{currentPet?.pet_name ? `Cuidando de ${currentPet.pet_name}` : 'Cuidados preventivos'}</p>
                </div>
              </div>
              <button
                onClick={onCloseHealthOptionsModal}
                className="ml-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0056D2]"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Grid de Cuidados (Mini-Home) — rola se não couber */}
            <div
              className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50"
              style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
            >
              <div className="grid grid-cols-2 gap-2 mb-1">
                {[
                  // Reviravolta 11/10/2026 (pedido do dono): sem emoji/arte
                  // nenhuma nos 6 cards — o título carrega o card sozinho,
                  // com mais destaque tipográfico no lugar do ícone.
                  { label: 'Vermífugo', tab: 'dewormer', alert: alertParasitesValue, tone: colorVermifugoValue },
                  { label: 'Antipulgas', tab: 'flea_tick', alert: alertParasitesValue, tone: colorAntipulgasValue },
                  // Coleira antiparasitária é uso específico de cães — outras espécies não usam
                  ...(currentPet?.species === 'dog'
                    ? [{ label: 'Coleira', tab: 'collar', alert: alertParasitesValue, tone: colorColeiraValue }]
                    : []),
                  { label: 'Banho e Tosa', tab: 'grooming', alert: alertGroomingValue, tone: colorGroomingValue },
                  // Medicamentos desativados no PETMOL 1.0 (ver
                  // docs/MEDICAMENTOS_DESATIVADOS.md) — mesmo padrão do
                  // filtro de espécie da Coleira acima, condicional na
                  // própria montagem do array.
                  ...(MEDICATIONS_ENABLED
                    ? [{ label: 'Medicação', tab: 'medication', alert: alertMedicationValue, tone: colorMedicationValue }]
                    : []),
                  // Busca de estabelecimento (Maps) — saiu da Home, é mais um card aqui em Cuidados.
                  { label: 'PetShops', tab: 'petshops', alert: false, tone: undefined },
                ].map(({ label, tab, alert, tone }) => {
                  const isEmergency = tab === 'emergency';

                  return (
                  <button
                    key={tab}
                    onClick={() => {
                      if (tab === 'dewormer' && onOpenVermifugo) {
                        onCloseHealthOptionsModal();
                        onOpenVermifugo();
                        return;
                      }
                      if (tab === 'flea_tick' && onOpenAntipulgas) {
                        onCloseHealthOptionsModal();
                        onOpenAntipulgas();
                        return;
                      }
                      if (tab === 'collar' && onOpenColeira) {
                        onCloseHealthOptionsModal();
                        onOpenColeira();
                        return;
                      }
                      if (tab === 'grooming' && onOpenGrooming) {
                        onCloseHealthOptionsModal();
                        onOpenGrooming();
                        return;
                      }
                      if (tab === 'medication' && onOpenMedication) {
                        onCloseHealthOptionsModal();
                        onOpenMedication();
                        return;
                      }
                      if (tab === 'emergency') {
                        onCloseHealthOptionsModal();
                        window.open('https://www.google.com/maps/search/veterinário+24+horas+perto+de+mim', '_blank', 'noopener,noreferrer');
                        return;
                      }
                      if (tab === 'petshops') {
                        onCloseHealthOptionsModal();
                        setShowPetShopsNearby(true);
                        return;
                      }

                      onCloseHealthOptionsModal();
                      onOpenHealthTab(tab);
                    }}
                    className={`group relative overflow-hidden border border-[#BFD4F0] bg-gradient-to-br from-white to-[#E6EEF9] rounded-2xl p-3 h-[108px] transition-all duration-200 hover:-translate-y-1 active:scale-95 text-left flex items-start shadow-[0_2px_10px_-2px_rgba(0,86,210,0.10)] hover:shadow-[0_8px_24px_-6px_rgba(0,86,210,0.16)] ${isEmergency ? 'shadow-[0_8px_20px_rgba(239,68,68,0.10)] hover:shadow-[0_12px_24px_rgba(239,68,68,0.14)]' : ''}`}
                  >
                    {shouldShowAlert(tone, alert) && <ControlAlertBadge tone={tone} />}
                    {isEmergency && (
                      <span className="pointer-events-none absolute right-2 top-2 h-6 w-6 rounded-full bg-red-300/35 blur-md animate-pulse" />
                    )}
                    {/* Mesma formatação dos 4 cards principais da Home
                        (08/10/2026, pedido do dono, imagem de referência):
                        título à esquerda (peso bold, não mais black) +
                        ">" à direita centralizado na altura do card. */}
                    <div className="relative min-w-0 flex-1">
                      <span className={`text-[15px] font-bold leading-tight block ${isEmergency ? 'text-red-700' : 'text-[#0B1E36]'}`}>{label}</span>
                      <span className={`text-[10px] font-black uppercase tracking-widest mt-1 block ${isEmergency ? 'text-red-500/80' : 'text-[#5B6B82]'}`}>{isEmergency ? 'Clínicas e hospitais 24h' : tab === 'petshops' ? 'Perto de você' : 'Acompanhar'}</span>
                    </div>
                    <ChevronRight className={`h-4 w-4 flex-shrink-0 self-center transition-transform group-hover:translate-x-0.5 ${isEmergency ? 'text-red-300' : 'text-[#8EA9C9]'}`} strokeWidth={2.5} />
                  </button>
                )})}
              </div>
            </div>
          </div>
        </div>
      )}

      <PetShopsNearbySheet open={showPetShopsNearby} onClose={() => setShowPetShopsNearby(false)} />

    </>
    </ModalPortal>
  );
}

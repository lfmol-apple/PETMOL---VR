'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/I18nContext';
import { showBlockingNotice } from '@/features/interactions/userPromptChannel';
import { ModalPortal } from '@/components/ModalPortal';
import type { PetHealthProfile } from '@/lib/petHealth';

type ControlTone = 'neutral' | 'ok' | 'warning' | 'critical';

interface HomeNavigationModalsProps {
  currentPet: PetHealthProfile | null | undefined;
  showServiceTypeModal: boolean;
  onCloseServiceTypeModal: () => void;
  showHealthOptionsModal: boolean;
  onCloseHealthOptionsModal: () => void;
  onOpenHealthOptionsModal: () => void;
  showEventTypeModal: boolean;
  onOpenEventTypeModal: () => void;
  onCloseEventTypeModal: () => void;
  showVetOptionsModal: boolean;
  onCloseVetOptionsModal: () => void;
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
  onOpenEditPet: () => void;
  getRecentVets: () => string[];
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
  showServiceTypeModal,
  onCloseServiceTypeModal,
  showHealthOptionsModal,
  onCloseHealthOptionsModal,
  onOpenHealthOptionsModal,
  showEventTypeModal,
  onOpenEventTypeModal,
  onCloseEventTypeModal,
  showVetOptionsModal,
  onCloseVetOptionsModal,
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
  onOpenEditPet,
  getRecentVets,
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

  return (
    <ModalPortal>
    <>
      {showServiceTypeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 w-full max-w-sm flex flex-col max-h-[92dvh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-lg font-bold flex items-center gap-2">🔍 {t('services.find_nearby')}</h3>
              <button onClick={onCloseServiceTypeModal} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {[
                { icon: '🏥', labelKey: 'services.vet_clinics_label', query: 'clínica veterinária', color: 'bg-blue-500 hover:bg-[#0056D2]' },
                { icon: '🏨', labelKey: 'services.vet_hospital_label', query: 'hospital veterinário', color: 'bg-indigo-500 hover:bg-indigo-600' },
                { icon: '🚨', labelKey: 'services.vet_emergency_label', query: 'veterinária 24 horas emergência', color: 'bg-red-500 hover:bg-red-600' },
                { icon: '🛁', labelKey: 'services.petshop_label', query: 'petshop', color: 'bg-purple-500 hover:bg-purple-600' },
                { icon: '🏠', labelKey: 'services.hotel_label', query: 'hotel para pet creche para cachorro', color: 'bg-orange-500 hover:bg-orange-600' },
                { icon: '🎓', labelKey: 'services.training_label', query: 'adestramento de cães', color: 'bg-green-500 hover:bg-green-600' },
              ].map(({ icon, labelKey, query, color }) => (
                <button
                  key={labelKey}
                  onClick={() => {
                    onCloseServiceTypeModal();
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
                  }}
                  className={`w-full px-4 py-3.5 ${color} text-white rounded-xl font-semibold flex items-center gap-3 transition-all active:scale-95 shadow-sm`}
                >
                  <span className="text-2xl leading-none">{icon}</span>
                  <span className="flex-1 text-left text-sm">{t(labelKey)}</span>
                  <span className="text-white/70 text-xs">{t('services.open_maps')}</span>
                </button>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              <button onClick={onCloseServiceTypeModal} className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium">{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {showHealthOptionsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn" onClick={onCloseHealthOptionsModal}>
          <div 
            className="bg-slate-50 rounded-[32px] shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Mini-Home */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-xl">🏥</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 leading-tight">Cuidados</h3>
                  <p className="text-xs text-slate-500 font-medium">{currentPet?.pet_name ? `Cuidando de ${currentPet.pet_name}` : 'Cuidados preventivos'}</p>
                </div>
              </div>
              <button 
                onClick={onCloseHealthOptionsModal} 
                className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Grid de Cuidados (Mini-Home) */}
            <div className="p-4 sm:p-6 bg-slate-50">
              <div className="grid grid-cols-2 gap-3 mb-2">
                {[
                  { icon: '🪱', image: '/vermifugo-produto.webp', label: 'Vermífugo', gradient: 'from-orange-100 to-amber-200 border-amber-300', tab: 'dewormer', alert: alertParasitesValue, tone: colorVermifugoValue },
                  { icon: '🛡️', image: '/cuidados-antipulgas.webp', label: 'Antipulgas', gradient: 'from-emerald-100 to-green-200 border-green-300', tab: 'flea_tick', alert: alertParasitesValue, tone: colorAntipulgasValue },
                  // Coleira antiparasitária é uso específico de cães — outras espécies não usam
                  ...(currentPet?.species === 'dog'
                    ? [{ icon: '📿', image: '/cuidados-coleira.webp', label: 'Coleira', gradient: 'from-teal-100 to-cyan-200 border-teal-300', tab: 'collar', alert: alertParasitesValue, tone: colorColeiraValue }]
                    : []),
                  { icon: '🛁', image: '/cuidados-pets-banho.webp', label: 'Banho e Tosa', gradient: 'from-sky-100 to-blue-200 border-sky-300', tab: 'grooming', alert: alertGroomingValue, tone: colorGroomingValue },
                  { icon: '💊', label: 'Medicação', gradient: 'from-purple-100 to-violet-200 border-purple-300', tab: 'medication', alert: alertMedicationValue, tone: colorMedicationValue },
                ].map(({ icon, image, label, gradient, tab, alert, tone }) => {
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
                      
                      onCloseHealthOptionsModal();
                      onOpenHealthTab(tab);
                    }}
                    className={`group relative overflow-hidden bg-gradient-to-br ${gradient} border rounded-2xl p-4 h-[134px] transition-all duration-200 hover:shadow-lg hover:-translate-y-1 active:scale-95 text-left flex flex-col justify-end shadow-sm ${isEmergency ? 'shadow-[0_8px_20px_rgba(239,68,68,0.10)] hover:shadow-[0_12px_24px_rgba(239,68,68,0.14)]' : ''}`}
                  >
                    {shouldShowAlert(tone, alert) && <ControlAlertBadge tone={tone} />}
                    {image ? (
                      <span className="absolute top-1 right-1 opacity-95 transition-transform duration-300 group-hover:scale-110">
                        <img src={image} alt="" className="h-[76px] w-[76px] object-contain" />
                      </span>
                    ) : (
                      <span className={`absolute top-1 right-1 text-[52px] leading-none transition-transform duration-300 group-hover:scale-110 ${isEmergency ? 'opacity-100 drop-shadow-[0_0_10px_rgba(239,68,68,0.28)]' : 'opacity-95'}`}>{icon}</span>
                    )}
                    {isEmergency && (
                      <span className="pointer-events-none absolute right-2 top-2 h-6 w-6 rounded-full bg-red-300/35 blur-md animate-pulse" />
                    )}
                    <div className="relative">
                      <span className={`text-[14px] font-bold leading-tight block ${isEmergency ? 'text-red-700' : 'text-slate-900'}`}>{label}</span>
                      <span className={`text-[9px] font-black uppercase tracking-widest mt-0.5 block ${isEmergency ? 'text-red-500/80' : 'text-slate-600/60'}`}>{isEmergency ? 'Clínicas e hospitais 24h' : 'Gerenciar'}</span>
                    </div>
                  </button>
                )})}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200/60 bg-white/50 text-center" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
              <p className="text-[11px] text-slate-400 font-medium">Toque em cada item para ver detalhes e datas</p>
            </div>
          </div>
        </div>
      )}

      {/* EventTypeModal SILENCIADO: bloco legado de Consultas/Exames removido da UI */}

      {showVetOptionsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2">🏥 Veterinários</h3>
              <button onClick={onCloseVetOptionsModal} className="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
            </div>

            {currentPet?.primary_vet?.name && (
              <div className="mb-4">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">👨‍⚕️</span>
                        <span className="text-xs font-semibold text-[#0056D2] uppercase tracking-wide">Veterinário de Confiança</span>
                      </div>
                      <h4 className="font-bold text-gray-900 text-lg mb-1">{currentPet.primary_vet.name}</h4>
                      {currentPet.primary_vet.clinic && <p className="text-sm text-gray-600">🏥 {currentPet.primary_vet.clinic}</p>}
                      {currentPet.primary_vet.phone && <p className="text-sm font-medium text-gray-700 mt-1">📱 {currentPet.primary_vet.phone}</p>}
                    </div>
                  </div>
                  {currentPet.primary_vet.phone && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <a href={`tel:${currentPet.primary_vet.phone.replace(/\D/g, '')}`} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors text-sm">📞 Ligar</a>
                      <a href={`https://wa.me/55${currentPet.primary_vet.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors text-sm">💬 WhatsApp</a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!currentPet?.primary_vet?.name && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  💡 <strong>Dica:</strong> Configure o veterinário de confiança de {currentPet?.pet_name} em
                  <button
                    onClick={() => {
                      onCloseVetOptionsModal();
                      onOpenEditPet();
                    }}
                    className="text-[#0056D2] hover:text-[#003889] font-semibold underline ml-1"
                  >
                    Editar → Veterinário de Confiança
                  </button>
                </p>
              </div>
            )}

            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">📋 Histórico de Veterinários</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {getRecentVets().map((vet, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      navigator.clipboard.writeText(vet);
                      showBlockingNotice(`📋 Copiado: ${vet}`);
                      onCloseVetOptionsModal();
                    }}
                    className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg transition-colors"
                  >
                    <div className="font-medium text-gray-800">{vet}</div>
                    <div className="text-xs text-gray-500">Clique para copiar</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white text-gray-500">ou buscar novos</span>
              </div>
            </div>

            <div className="space-y-3">
              <Link href="/emergency" onClick={onCloseVetOptionsModal} className="block w-full">
                <button className="w-full px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2">🚨 Emergência 24h</button>
              </Link>
              <button
                onClick={() => { onCloseVetOptionsModal(); window.open('https://www.google.com/maps/search/?api=1&query=cl%C3%ADnica+veterin%C3%A1ria', '_blank', 'noopener,noreferrer'); }}
                className="w-full px-4 py-3 bg-blue-500 hover:bg-[#0056D2] text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                🏥 Clínicas Próximas
              </button>
              <p className="text-xs text-gray-500 text-center mt-3">💡 Escolha o tipo de atendimento que você precisa</p>
            </div>

            <div className="mt-4 text-center">
              <button onClick={onCloseVetOptionsModal} className="text-sm text-gray-500 hover:text-gray-700">{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </>
    </ModalPortal>
  );
}

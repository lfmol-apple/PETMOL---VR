'use client';

// RESPONSABILIDADE: gestão ativa de saúde e rotina (WRITE).
// VetHistoryModal = timeline histórica somente leitura (READ). Modais complementares, não duplicados.

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { useDraftAutosave, loadDraft, clearDraft } from '@/hooks/useDraftAutosave';
import { useI18n } from '@/lib/I18nContext';
import { FoodControlTab } from '@/components/FoodControlTab';
import { HealthParasiteControlPanel } from '@/components/home/HealthParasiteControlPanel';
import { HealthGroomingPanel } from '@/components/home/HealthGroomingPanel';
import { HealthMedicationPanel } from '@/components/home/HealthMedicationPanel';
import { HealthVaccinesPanel } from '@/components/home/HealthVaccinesPanel';
import { PetShareExportPanel } from '@/components/PetShareExportPanel';
import { useHomeMedicationActions } from '@/features/interactions/useHomeMedicationActions';
import { type PetEventRecord } from '@/lib/petEvents';
import type { EventFormState } from '@/hooks/usePetEventManagement';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';
import type { GroomingRecord, ParasiteControl, PlaceDetails } from '@/lib/types/home';
import type {
  DocFolderModalState,
  GroomingFormData,
  ParasiteFormData,
  VetHistoryDocument,
} from '@/lib/types/homeForms';
import { latestVaccinePerGroup } from '@/lib/vaccineUtils';
import { ModalPortal } from '@/components/ModalPortal';
type VaccineCardOcrRecord = {
  tipo_vacina?: string | null; nome_comercial: string | null;
  data_aplicacao: string | null; data_revacina: string | null;
  veterinario_responsavel: string | null; missing_fields?: string[]; confianca_score?: number;
};

// Photo utilities (mirrored from page.tsx)
const OWN_PHOTO_HOSTS_HM = ['petmol.app', 'petmol.com.br', 'www.petmol.com.br', 'localhost'];
const isOwnHost_hm = (url: string): boolean => {
  try { const { hostname } = new URL(url); return OWN_PHOTO_HOSTS_HM.some((h) => hostname === h || hostname.endsWith(`.${h}`)); }
  catch { return false; }
};
const getPhotoUrl = (photoPath: string | undefined | null, petId?: string, photoTimestamps?: Record<string, string | number>): string | null => {
  if (!photoPath) return null;
  if (photoPath.startsWith('data:')) return photoPath;
  if (photoPath.startsWith('http')) {
    if (isOwnHost_hm(photoPath)) return photoPath;
    return `/api/photo-proxy?url=${encodeURIComponent(photoPath)}`;
  }
  const configured = String(process.env.NEXT_PUBLIC_PHOTOS_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || '')
    .replace(/\/api\/?$/, '').replace(/\/$/, '');
  const photosBase = configured || (typeof window !== 'undefined' ? window.location.origin : '');
  const timestamp = petId && photoTimestamps?.[petId] ? `?t=${photoTimestamps[petId]}` : '';
  const normalized = photoPath.replace(/^\/+/, '');
  const path = normalized.startsWith('uploads/') ? `/${normalized}` : `/uploads/${normalized}`;
  return `${photosBase}${path}${timestamp}`;
};

// Hint contextual de ação — aparece apenas quando há dado relevante
// Para adicionar conversão de produto/serviço: passar action + onAction com link/navegação para o módulo de commerce
function ConversionHint({ count, singular, plural, action, onAction }: {
  count: number; singular: string; plural: string;
  action?: string; onAction?: () => void;
}) {
  if (count === 0) return null;
  const message = count === 1 ? singular : plural.replace('{n}', String(count));
  return (
    <div className="flex items-center gap-3 bg-amber-50 border border-amber-200/80 rounded-2xl px-4 py-3 mb-4">
      <span className="text-lg flex-shrink-0">⚠️</span>
      <p className="text-sm text-amber-800 font-medium flex-1 leading-snug">{message}</p>
      {action && onAction && (
        <button
          onClick={onAction}
          className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 active:scale-95 px-3 py-1.5 rounded-xl whitespace-nowrap transition-all"
        >
          {action}
        </button>
      )}
    </div>
  );
}

// Banner de restauração de rascunho — aparece quando o formulário está vazio e há draft salvo
function DraftRestoreBanner({ onRestore, onDiscard }: { onRestore: () => void; onDiscard: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-4">
      <span className="text-lg flex-shrink-0">📝</span>
      <p className="text-sm text-blue-800 font-medium flex-1 leading-snug">Você tem um rascunho não salvo.</p>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={onRestore} className="text-xs font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 active:scale-95 px-3 py-1.5 rounded-xl whitespace-nowrap transition-all">
          Restaurar
        </button>
        <button onClick={onDiscard} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 whitespace-nowrap transition-colors">
          Descartar
        </button>
      </div>
    </div>
  );
}

// Props
interface HealthModalProps {
  currentPet: PetHealthProfile | null; selectedPetId: string | null;
  photoTimestamps: Record<string, string | number>;
  healthModalMode: 'full' | 'health' | 'grooming' | 'food';
  healthActiveTab: string;
  eventTypeLocked: boolean;
  onBackFromHealthModal: (wasLocked: boolean) => void;
  onCloseHealthModal: () => void;
  onGoHome?: () => void;
  onSelectHealthTab: (tab: string) => void;
  onOpenVaccineCenter: () => void;
  vaccines: VaccineRecord[];
  parasiteControls: ParasiteControl[]; showParasiteForm: boolean; setShowParasiteForm: (v: boolean) => void;
  editingParasite: ParasiteControl | null; setEditingParasite: (p: ParasiteControl | null) => void;
  parasiteFormData: ParasiteFormData; setParasiteFormData: Dispatch<SetStateAction<ParasiteFormData>>; handleDeleteParasite: (parasite: ParasiteControl) => void;
  handleEditParasite: (parasite: ParasiteControl) => void; handleSaveParasite: () => void; resetParasiteForm: () => void;
  groomingRecords: GroomingRecord[]; editingGrooming: GroomingRecord | null;
  groomingFormData: GroomingFormData; setGroomingFormData: Dispatch<SetStateAction<GroomingFormData>>;
  groomingDueAlerts: { petName: string; type: string; daysOverdue: number }[];
  setGroomingDueAlerts: (alerts: { petName: string; type: string; daysOverdue: number }[]) => void;
  handleDeleteGrooming: (record: GroomingRecord) => Promise<void>; handleEditGrooming: (record: GroomingRecord) => void;
  handleSaveGrooming: () => void; handleCancelEditGrooming: () => void;
  showPlaceSuggestions: boolean; setShowPlaceSuggestions: (v: boolean) => void;
  searchingPlaces: boolean; placeSuggestions: PlaceDetails[]; searchPlaces: (q: string) => void; selectPlace: (place: PlaceDetails) => void;
  fetchFeedingPlan: (petId: string) => void;
  petEvents: PetEventRecord[]; eventsLoading: boolean; editingEventId: string | null; setEditingEventId: (id: string | null) => void;
  eventFormData: EventFormState; setEventFormData: Dispatch<SetStateAction<EventFormState>>; eventSaving: boolean; setEventSaving: (v: boolean) => void;
  // Props legadas do HealthEventPanel (desativado) — remover junto com HealthEventPanel em page.tsx quando feature for oficialmente descontinuada
  setCreatedEventId: (id: string | null) => void;
  docFolderModal: DocFolderModalState; setDocFolderModal: Dispatch<SetStateAction<DocFolderModalState>>; handleDeleteEvent: (eventId: string) => void;
  fetchPetEvents: (petId: string) => void; openEditEvent: (event: PetEventRecord) => void; vetHistoryDocs: VetHistoryDocument[];
}

export function HealthModal({
  currentPet, selectedPetId, photoTimestamps,
  healthModalMode, healthActiveTab, eventTypeLocked, onBackFromHealthModal, onCloseHealthModal, onGoHome, onSelectHealthTab, onOpenVaccineCenter,
  vaccines,
  parasiteControls, showParasiteForm, setShowParasiteForm, editingParasite, setEditingParasite,
  parasiteFormData, setParasiteFormData, handleDeleteParasite, handleEditParasite, handleSaveParasite, resetParasiteForm,
  groomingRecords, editingGrooming, groomingFormData, setGroomingFormData,
  groomingDueAlerts, setGroomingDueAlerts, handleDeleteGrooming, handleEditGrooming, handleSaveGrooming, handleCancelEditGrooming,
  showPlaceSuggestions, setShowPlaceSuggestions, searchingPlaces, placeSuggestions, searchPlaces, selectPlace, fetchFeedingPlan,
  petEvents, eventsLoading, editingEventId, setEditingEventId, eventFormData, setEventFormData,
  eventSaving, setEventSaving,
  docFolderModal: _docFolderModal, setDocFolderModal: _setDocFolderModal,
  handleDeleteEvent, fetchPetEvents, openEditEvent, vetHistoryDocs,
}: HealthModalProps) {
  const { t } = useI18n();

  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<'close' | 'back' | null>(null);
  const [showShareOverlay, setShowShareOverlay] = useState(false);

  const hasUnsavedForm =
    showParasiteForm ||
    editingGrooming !== null ||
    editingEventId !== null ||
    (healthActiveTab === 'medication' && eventFormData.title.trim() !== '') ||
    (healthActiveTab === 'grooming' && (groomingFormData.location.trim() !== '' || groomingFormData.notes.trim() !== ''));

  const handleClose = () => {
    if (hasUnsavedForm) { setPendingAction('close'); setShowCloseWarning(true); return; }
    onCloseHealthModal();
  };

  const handleBack = () => {
    if (hasUnsavedForm) { setPendingAction('back'); setShowCloseWarning(true); return; }
    onBackFromHealthModal(eventTypeLocked);
  };

  const confirmDiscard = () => {
    setShowCloseWarning(false);
    if (pendingAction === 'close') onCloseHealthModal();
    else if (pendingAction === 'back') onBackFromHealthModal(eventTypeLocked);
    setPendingAction(null);
  };

  const { saveMedication, cancelMedicationForm } = useHomeMedicationActions({
    selectedPetId,
    eventFormData,
    setEventFormData,
    setEventSaving,
    editingEventId,
    setEditingEventId,
    fetchPetEvents,
  });

  // ── Autosave de rascunho ─────────────────────────────────────────────────────
  const draftKeyParasite   = selectedPetId ? `petmol_draft_${selectedPetId}_parasite`   : null;
  const draftKeyGrooming   = selectedPetId ? `petmol_draft_${selectedPetId}_grooming`   : null;
  const draftKeyMedication = selectedPetId ? `petmol_draft_${selectedPetId}_medication` : null;

  const [offerParasiteRestore,   setOfferParasiteRestore]   = useState(false);
  const [offerGroomingRestore,   setOfferGroomingRestore]   = useState(false);
  const [offerMedicationRestore, setOfferMedicationRestore] = useState(false);

  useDraftAutosave(draftKeyParasite,   parasiteFormData,  showParasiteForm && editingParasite === null, parasiteFormData.product_name.trim() !== '');
  useDraftAutosave(draftKeyGrooming,   groomingFormData,  healthActiveTab === 'grooming',              groomingFormData.location.trim() !== '' || groomingFormData.notes.trim() !== '');
  useDraftAutosave(draftKeyMedication, eventFormData,     healthActiveTab === 'medication' && editingEventId === null, eventFormData.title.trim() !== '');

  // Oferecer restauração ao abrir formulário vazio com draft existente
  const parasiteNewEmpty = showParasiteForm && editingParasite === null && !parasiteFormData.product_name;
  useEffect(() => {
    if (parasiteNewEmpty && draftKeyParasite) setOfferParasiteRestore(!!loadDraft(draftKeyParasite));
    else setOfferParasiteRestore(false);
  }, [parasiteNewEmpty, draftKeyParasite]);

  const groomingNewEmpty = healthActiveTab === 'grooming' && editingGrooming === null && !groomingFormData.location && !groomingFormData.notes;
  useEffect(() => {
    if (groomingNewEmpty && draftKeyGrooming) setOfferGroomingRestore(!!loadDraft(draftKeyGrooming));
    else setOfferGroomingRestore(false);
  }, [groomingNewEmpty, draftKeyGrooming]);

  const medicationNewEmpty = healthActiveTab === 'medication' && editingEventId === null && !eventFormData.title;
  useEffect(() => {
    if (medicationNewEmpty && draftKeyMedication) setOfferMedicationRestore(!!loadDraft(draftKeyMedication));
    else setOfferMedicationRestore(false);
  }, [medicationNewEmpty, draftKeyMedication]);

  // Handlers que limpam o rascunho ao salvar / cancelar
  const handleSaveParasiteWithClear = useCallback(() => {
    if (draftKeyParasite) clearDraft(draftKeyParasite);
    setOfferParasiteRestore(false);
    handleSaveParasite();
  }, [draftKeyParasite, handleSaveParasite]);

  const handleResetParasiteWithClear = useCallback(() => {
    if (draftKeyParasite) clearDraft(draftKeyParasite);
    setOfferParasiteRestore(false);
    resetParasiteForm();
  }, [draftKeyParasite, resetParasiteForm]);

  const handleSaveGroomingWithClear = useCallback(() => {
    if (draftKeyGrooming) clearDraft(draftKeyGrooming);
    setOfferGroomingRestore(false);
    handleSaveGrooming();
  }, [draftKeyGrooming, handleSaveGrooming]);

  const handleCancelGroomingWithClear = useCallback(() => {
    if (draftKeyGrooming) clearDraft(draftKeyGrooming);
    setOfferGroomingRestore(false);
    handleCancelEditGrooming();
  }, [draftKeyGrooming, handleCancelEditGrooming]);

  const saveMedicationWithClear = useCallback(async () => {
    if (draftKeyMedication) clearDraft(draftKeyMedication);
    setOfferMedicationRestore(false);
    await saveMedication();
  }, [draftKeyMedication, saveMedication]);

  const cancelMedicationWithClear = useCallback(() => {
    if (draftKeyMedication) clearDraft(draftKeyMedication);
    setOfferMedicationRestore(false);
    cancelMedicationForm();
  }, [draftKeyMedication, cancelMedicationForm]);

  const latestVaccinesMap = latestVaccinePerGroup(vaccines);
  const currentVaccines = Array.from(latestVaccinesMap.values());
  const currentParasiteControls = Array.from(
    parasiteControls.reduce((latestByType, control) => {
      const key = String(control.type || '').toLowerCase();
      if (!key) return latestByType;
      const previous = latestByType.get(key);
      const controlTime = new Date(control.date_applied || '0').getTime();
      const previousTime = previous ? new Date(previous.date_applied || '0').getTime() : Number.NaN;
      if (!previous || (!Number.isNaN(controlTime) && (Number.isNaN(previousTime) || controlTime > previousTime))) {
        latestByType.set(key, control);
      }
      return latestByType;
    }, new Map<string, ParasiteControl>()).values()
  );

  const now = Date.now();
  const overdueVaccines = currentVaccines.filter(v => v.next_dose_date && new Date(v.next_dose_date).getTime() < now).length;
  const overdueParasites = currentParasiteControls.filter((p) => {
    const nextDate = p.collar_expiry_date || p.next_due_date;
    return nextDate ? new Date(nextDate).getTime() < now : false;
  }).length;
  const overdueGroomingCount = groomingDueAlerts.length;
  const healthTabs = [
    { id: 'vaccines', label: t('health.vaccines'), icon: '💉', urgent: overdueVaccines > 0 },
    { id: 'parasites', label: t('health.parasite_control'), icon: '🛡️', urgent: overdueParasites > 0 },
    { id: 'medication', label: 'Medicação', icon: '💊', urgent: false },
    ...(healthModalMode === 'full' ? [
      { id: 'grooming', label: t('health.grooming'), icon: '🛁', urgent: overdueGroomingCount > 0 },
      { id: 'food', label: t('health.food'), icon: '🥣', urgent: false },
    ] : []),
  ].sort((a, b) => Number(b.urgent) - Number(a.urgent));

  return (
    <ModalPortal>
    <>
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-md flex items-center justify-center sm:p-4 z-50 animate-fadeIn">
          <div className="bg-slate-50 rounded-[28px] shadow-premium w-full max-w-3xl max-h-[100dvh] sm:max-h-[92dvh] overflow-hidden flex flex-col animate-scaleIn border border-slate-200/50">
            {/* Header do Modal - Design Clean e Elegante */}
            <div className="sticky top-0 z-50 shadow-sm bg-white/90 backdrop-blur-xl border-b border-slate-100">
              {/* Borda Colorida Superior - dinâmica por modo */}
              <div className={`absolute top-0 left-0 right-0 h-1 ${
                healthModalMode === 'grooming' ? 'bg-emerald-500' :
                healthModalMode === 'food' ? 'bg-amber-500' :
                healthModalMode === 'health' && healthActiveTab === 'parasites' ? 'bg-orange-500' :
                healthModalMode === 'health' && healthActiveTab === 'medication' ? 'bg-purple-500' :
                'bg-blue-500'
              }`}></div>
              
              {/* Conteúdo do Header */}
              <div className="relative">
                {/* Barra Superior Minimalista */}
                <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-4">
                  {/* Esquerda: Voltar (health mode) + Info do Pet */}
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    {healthModalMode === 'health' && (
                      <button
                        onClick={handleBack}
                        className="group bg-gray-100 hover:bg-gray-200 rounded-2xl w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center flex-shrink-0 transition-all duration-200 active:scale-95 border border-gray-200"
                        aria-label="Voltar"
                      >
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                    )}
                    {/* Avatar Grande do Pet */}
                    <div className="relative group flex-shrink-0 cursor-pointer">
                      <div className="absolute -inset-0.5 bg-gray-200/50 rounded-3xl blur-md group-hover:bg-gray-300/60 transition-all duration-300"></div>
                      <div className="relative rounded-2xl p-0.5 overflow-hidden w-10 h-10 sm:w-14 sm:h-14 group-hover:shadow-lg transition-all duration-300 bg-white shadow-sm ring-1 ring-slate-100/50">
                        {currentPet?.photo ? (
                          <div className="relative w-full h-full rounded-xl overflow-hidden">
                            <img
                              src={getPhotoUrl(currentPet.photo, currentPet.pet_id, photoTimestamps) || ''}
                              alt={currentPet.pet_name}
                              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                              style={{
                                objectPosition: 'center 30%',
                                transform: 'scale(1.08)',
                              }}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const fallback = target.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                            <div className="hidden w-full h-full items-center justify-center">
                              <span className="text-3xl sm:text-4xl drop-shadow-sm">
                                {currentPet?.species === 'dog' ? '🐕' : currentPet?.species === 'cat' ? '🐈' : '🐾'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-3xl sm:text-4xl drop-shadow-sm group-hover:scale-105 transition-transform duration-300">
                              {currentPet?.species === 'dog' ? '🐕' : currentPet?.species === 'cat' ? '🐈' : '🐾'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Nome do Pet */}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base sm:text-xl font-black text-gray-900 truncate mb-0.5 sm:mb-1">
                        {currentPet?.pet_name}
                      </h2>
                      <p className="text-gray-600 text-xs sm:text-base font-medium">
                        {healthModalMode === 'grooming' ? t('health.grooming') :
                         healthModalMode === 'food' ? t('home.food.title') :
                         healthModalMode === 'health' && healthActiveTab === 'vaccines' ? '💉 Vacinas' :
                         healthModalMode === 'health' && healthActiveTab === 'parasites' ? '🛡️ Controle Parasitário' :
                         healthModalMode === 'health' && healthActiveTab === 'medication' ? '💊 Medicação' :
                         t('health.record_title')}
                      </p>
                    </div>
                  </div>

                  {/* Direita: Compartilhar + Início + Fechar */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {currentPet && (
                      <button
                        onClick={() => setShowShareOverlay(v => !v)}
                        className={`group rounded-2xl w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center flex-shrink-0 transition-all duration-200 active:scale-95 border ${showShareOverlay ? 'bg-brand-DEFAULT border-brand-DEFAULT/50' : 'bg-gray-100 hover:bg-gray-200 border-gray-200'}`}
                        aria-label="Compartilhar histórico do pet"
                      >
                        <svg className={`w-4 h-4 sm:w-5 sm:h-5 transition-colors ${showShareOverlay ? 'text-white' : 'text-gray-700'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                      </button>
                    )}
                    {onGoHome && (
                      <button
                        onClick={onGoHome}
                        className="h-8 px-3 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-colors flex-shrink-0"
                        aria-label="Ir para a home"
                      >
                        Início
                      </button>
                    )}
                    <button
                      onClick={handleClose}
                      className="group bg-gray-100 hover:bg-gray-200 rounded-2xl w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center flex-shrink-0 transition-all duration-200 active:scale-95 border border-gray-200"
                      aria-label={t('common.close')}
                    >
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 transform group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Navegação por Abas */}
                {healthModalMode === 'full' && (
                <div className="px-3 sm:px-6 pb-2.5 sm:pb-4 pt-1">
                  <div className="flex gap-1.5 sm:gap-2.5 overflow-x-auto scrollbar-hide pb-2 [touch-action:pan-x]">
                    {healthTabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => onSelectHealthTab(tab.id)}
                        className={`group relative px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-2xl text-[13px] sm:text-sm font-bold transition-all duration-300 whitespace-nowrap flex items-center gap-2 flex-shrink-0 ${
                          healthActiveTab === tab.id ? 'scale-105 active:scale-100 shadow-sm' : 'hover:scale-105 active:scale-95'
                        }`}
                      >
                        {healthActiveTab === tab.id ? (
                          <>
                            <div className="absolute inset-0 bg-white rounded-2xl border border-slate-200"></div>
                            <div className="absolute inset-0 ring-2 ring-brand-DEFAULT/20 rounded-2xl"></div>
                          </>
                        ) : (
                          <div className="absolute inset-0 bg-slate-100/50 rounded-2xl border border-slate-200/50 group-hover:bg-slate-200/50"></div>
                        )}
                        
                        <span className={`relative text-lg sm:text-xl transition-transform ${healthActiveTab === tab.id ? 'scale-110' : 'grayscale group-hover:grayscale-0'}`}>
                          {tab.icon}
                        </span>
                        <span className={`relative font-bold transition-colors ${
                          healthActiveTab === tab.id ? 'text-brand-DEFAULT' : 'text-slate-500 group-hover:text-slate-700'
                        }`}>
                          {tab.label}
                        </span>
                        {tab.urgent && (
                          <span className="relative h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                )}
              </div>
            </div>

            {/* Conteúdo do Modal - Área de scroll otimizada */}
            <div className="p-3 sm:p-5 overflow-y-auto flex-1 bg-gray-50">
              <p className="text-[11.5px] font-medium text-slate-500 text-center mb-3">ℹ️ Gerenciamento e controle apenas — consulte seu veterinário.</p>
              {/* Painel de Compartilhamento — acessível pelo botão ↗ no header */}
              {showShareOverlay && currentPet && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-700">Compartilhar histórico de {currentPet.pet_name}</h3>
                    <button
                      onClick={() => setShowShareOverlay(false)}
                      className="text-xs text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-xl transition-colors"
                    >
                      Fechar
                    </button>
                  </div>
                  <PetShareExportPanel
                    pet={currentPet}
                    vaccines={vaccines}
                    petEvents={petEvents}
                    documents={vetHistoryDocs}
                    parasiteControls={parasiteControls}
                    groomingRecords={groomingRecords}
                  />
                </div>
              )}

              {/* Aba Vacinas */}
              {healthActiveTab === 'vaccines' && (
                <div className="space-y-4">
                  <ConversionHint
                    count={overdueVaccines}
                    singular="1 vacina precisa de revisão hoje"
                    plural="{n} vacinas precisam de revisão"
                    action="Ver vacinas"
                    onAction={onOpenVaccineCenter}
                  />
                  <HealthVaccinesPanel
                    petName={currentPet?.pet_name}
                    vaccines={vaccines}
                    currentVaccines={currentVaccines}
                    onOpenVaccineCenter={onOpenVaccineCenter}
                  />
                  {/* PetShareExportPanel movido para o botão ↗ no header — acessível em todos os tabs */}
                </div>
              )}

              {/* Aba Vermífugos/Antiparasitários */}
              {healthActiveTab === 'parasites' && (
                <div className="space-y-4">
                  <ConversionHint
                    count={overdueParasites}
                    singular="1 preventivo precisa de atenção"
                    plural="{n} preventivos precisam de atenção"
                    // TODO P2: action="Comprar novamente" onAction={() => openCommerce('antiparasitario')}
                  />
                  {offerParasiteRestore && (
                    <DraftRestoreBanner
                      onRestore={() => {
                        const draft = loadDraft<ParasiteFormData>(draftKeyParasite!);
                        if (draft) setParasiteFormData(draft);
                        setOfferParasiteRestore(false);
                      }}
                      onDiscard={() => { clearDraft(draftKeyParasite!); setOfferParasiteRestore(false); }}
                    />
                  )}
                  <HealthParasiteControlPanel
                    petName={currentPet?.pet_name}
                    species={currentPet?.species}
                    parasiteControls={parasiteControls}
                    showParasiteForm={showParasiteForm}
                    setShowParasiteForm={setShowParasiteForm}
                    editingParasite={editingParasite}
                    parasiteFormData={parasiteFormData}
                    setParasiteFormData={setParasiteFormData}
                    handleDeleteParasite={handleDeleteParasite}
                    handleEditParasite={handleEditParasite}
                    handleSaveParasite={handleSaveParasiteWithClear}
                    resetParasiteForm={handleResetParasiteWithClear}
                  />
                </div>
              )}

              {/* Aba Banho e Tosa */}
              {healthActiveTab === 'grooming' && (
                <div className="space-y-4">
                  {groomingDueAlerts.length > 0 && (
                    <ConversionHint
                      count={groomingDueAlerts.length}
                      singular={`${groomingDueAlerts[0]?.type ?? 'Serviço'} de ${groomingDueAlerts[0]?.petName ?? 'seu pet'} precisa de atenção`}
                      plural="{n} serviços de higiene precisam de atenção"
                      // TODO P2: action="Agendar" onAction={() => openCommerce('grooming')}
                    />
                  )}
                  {offerGroomingRestore && (
                    <DraftRestoreBanner
                      onRestore={() => {
                        const draft = loadDraft<GroomingFormData>(draftKeyGrooming!);
                        if (draft) setGroomingFormData(draft);
                        setOfferGroomingRestore(false);
                      }}
                      onDiscard={() => { clearDraft(draftKeyGrooming!); setOfferGroomingRestore(false); }}
                    />
                  )}
                  <HealthGroomingPanel
                    petName={currentPet?.pet_name}
                    editingGrooming={editingGrooming}
                    groomingFormData={groomingFormData}
                    setGroomingFormData={setGroomingFormData}
                    groomingDueAlerts={groomingDueAlerts}
                    setGroomingDueAlerts={setGroomingDueAlerts}
                    groomingRecords={groomingRecords}
                    handleDeleteGrooming={handleDeleteGrooming}
                    handleEditGrooming={handleEditGrooming}
                    handleSaveGrooming={handleSaveGroomingWithClear}
                    handleCancelEditGrooming={handleCancelGroomingWithClear}
                    showPlaceSuggestions={showPlaceSuggestions}
                    setShowPlaceSuggestions={setShowPlaceSuggestions}
                    searchingPlaces={searchingPlaces}
                    placeSuggestions={placeSuggestions}
                    searchPlaces={searchPlaces}
                    selectPlace={selectPlace}
                  />
                </div>
              )}

              {/* Aba Comida / Food Control */}
              {healthActiveTab === 'food' && (
                <FoodControlTab
                  petId={currentPet?.pet_id || ''}
                  petName={currentPet?.pet_name}
                  species={currentPet?.species as 'dog' | 'cat' | undefined}
                  onSaved={() => { if (currentPet?.pet_id) fetchFeedingPlan(currentPet.pet_id); }}
                />
              )}

              {/* Aba Medicação */}
              {(healthActiveTab === 'medication' || healthActiveTab === 'medications') && (
                <div className="space-y-4">
                  {offerMedicationRestore && (
                    <DraftRestoreBanner
                      onRestore={() => {
                        const draft = loadDraft<EventFormState>(draftKeyMedication!);
                        if (draft) setEventFormData(draft);
                        setOfferMedicationRestore(false);
                      }}
                      onDiscard={() => { clearDraft(draftKeyMedication!); setOfferMedicationRestore(false); }}
                    />
                  )}
                  <HealthMedicationPanel
                    petName={currentPet?.pet_name}
                    selectedPetId={selectedPetId}
                    eventFormData={eventFormData}
                    setEventFormData={setEventFormData}
                    editingEventId={editingEventId}
                    eventSaving={eventSaving}
                    petEvents={petEvents}
                    eventsLoading={eventsLoading}
                    saveMedication={saveMedicationWithClear}
                    cancelMedicationForm={cancelMedicationWithClear}
                    openEditEvent={openEditEvent}
                    handleDeleteEvent={handleDeleteEvent}
                  />
                </div>
              )}

              {/* appointments e exams removidos — não implementados, risco de rejeição nas lojas */}
              {/* HealthEventPanel + useHomeEventActions removidos junto com o Cofre de Documentos.
                  docFolderModal/setDocFolderModal seguem apenas para a visualização do acervo legado. */}
            </div>

            {/* Guard: confirmação antes de fechar com formulário em andamento */}
            {showCloseWarning && (
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-6 rounded-[32px]">
                <div className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl">
                  <div className="text-center mb-5">
                    <div className="text-3xl mb-2">⚠️</div>
                    <h3 className="text-base font-black text-gray-900">Alterações não salvas</h3>
                    <p className="text-sm text-gray-500 mt-1 leading-snug">Se sair agora, as informações preenchidas serão perdidas.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setShowCloseWarning(false)}
                      className="w-full py-3 rounded-2xl bg-brand-DEFAULT text-white font-bold text-sm transition-all active:scale-[0.98]"
                    >
                      Continuar editando
                    </button>
                    <button
                      onClick={confirmDiscard}
                      className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-sm transition-all active:scale-[0.98]"
                    >
                      Descartar alterações
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

    </>
    </ModalPortal>
  );
}
